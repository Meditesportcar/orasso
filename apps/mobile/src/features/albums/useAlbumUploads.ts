// Les photos d'un album en cours de création (lot R9e) : le choix dans la photothèque, la détection des plaques à l'appareil, **la décision de plaque
// par photo** et l'envoi une photo à la fois (`albumUploads.ts`, la logique testée). Une coupure laisse les photos faites ; « Reprendre l'envoi »
// repart de la première restante (même `clientId`, l'API rejoue sans doublon). Les envois retirés passent par une file persistante par compte
// (`removalQueue.ts` : place libérée avant un remplacement, suppression hors ligne rejouée à l'ouverture).
import {
  createRemovalQueue,
  isDefinitiveStatus,
  albumLabels as L,
  type PlateRect,
  type QueuedOp,
  type RemovalStore,
} from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useNetworkState } from "expo-network";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { accountRemovalStore } from "@/features/media/galleryUploads";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { accountGuard, cacheGetJson, cacheScope, cacheSetJson } from "@/lib/kv";
import { type PickedPhoto, pickPhotos } from "@/lib/photos";
import { detectPlates } from "@/lib/plates/detect";
import type { UploadState } from "@/ui/PhotoGrid";
import {
  type AlbumItem,
  AlbumSendStopped,
  type BatchChoice,
  canReopen,
  decideAll,
  decidedCounts,
  detectionPatch,
  pickLimit,
  platedCount,
  remaining,
  removeAlbumItem,
  reopenDecisions,
  sendAlbumPhotos,
} from "./albumUploads";

async function uploadFile(item: AlbumItem, rects: PlateRect[] | null): Promise<{ id: string; key: string }> {
  const form = new FormData();
  form.append("purpose", "album_photo");
  if (rects?.length) form.append("plateRects", JSON.stringify(rects));
  if (Platform.OS === "web") {
    const blob = await (await fetch(item.uri)).blob();
    form.append("file", new File([blob], `photo-${item.clientId}.jpg`, { type: "image/jpeg" }));
  } else {
    form.append("file", { uri: item.uri, name: `photo-${item.clientId}.jpg`, type: "image/jpeg" } as unknown as Blob);
  }
  const { id, key } = await api.upload(form);
  return { id, key };
}

/**
 * Une opération de la file : l'annulation de l'ajout d'une photo (`clientId` : l'API la confirme, 204) ou la suppression d'un envoi (un
 * fichier déjà parti, 404, est une suppression réussie : c'est un envoi, pas une photo ; l'annulation, elle, ne se déclare jamais sur un 404).
 */
async function runOp(op: QueuedOp): Promise<void> {
  if (op.clientId && op.albumId) {
    await api.cancelAlbumPhoto(op.albumId, op.clientId);
    return;
  }
  try {
    await api.deleteUpload(op.id);
  } catch (e) {
    if (!(e instanceof ApiRequestError && e.status === 404)) throw e;
  }
}

/**
 * Refus définitif : 400, 404, 409, 422 seulement. L'opération sort de la file **avec un état d'échec visible** (l'album est relu, les photos
 * concernées réapparaissent). 401 et 403 (session expirée, droits en cours de rétablissement), le réseau, les 5xx, 408 et 429 **restent en
 * file** : ils ne prouvent rien sur l'opération.
 */
const isFinal = (e: unknown) => e instanceof ApiRequestError && isDefinitiveStatus(e.status);
/** Tout ce qui n'est pas définitif arrête la série (réseau, 401, 403, 5xx…) : on ne martèle pas l'API, l'opération reste. */
const stopsRemovals = (e: unknown) => !isFinal(e);

export function useAlbumUploads(albumId: string | null) {
  const [items, setItems] = useState<AlbumItem[]>([]);
  const latest = useRef<AlbumItem[]>([]);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const stopped = useRef(false);
  // Une seule opération à la fois : un second appui pendant un envoi, ou pendant que la file se rejoue, ne lance rien.
  const busyRef = useRef(false);
  // Les retraits refusés pour de bon (au rejeu) : l'écran relit l'album et les photos réapparaissent (compteur de signaux).
  const [refusals, setRefusals] = useState(0);
  // L'envoi fige tout : pendant qu'il tourne, ni les cadres ni la décision ne changent (l'état aussi, pas seulement les boutons).
  const frozen = useRef(false);

  // La file des envois à supprimer est celle du compte connecté (une file par compte, rangée dans le cache du compte).
  const account = cacheScope();
  const queues = useRef<{ account: string | null; queue: ReturnType<typeof createRemovalQueue> } | null>(null);
  if (!queues.current || queues.current.account !== account) {
    // Même liste JSON que celle des galeries : elle porte aussi les annulations d'ajout (`clientId`).
    const store = accountRemovalStore({ accountGuard, cacheGetJson, cacheSetJson }) as unknown as RemovalStore;
    queues.current = {
      account,
      queue: createRemovalQueue({
        remove: runOp,
        store,
        stops: stopsRemovals,
        final: isFinal,
        onDrop: (op, e) => console.warn("Opération d'album abandonnée (refus définitif) :", op.id, errorMessage(e)),
      }),
    };
  }
  const queue = queues.current.queue;

  const update = useCallback((fn: (list: AlbumItem[]) => AlbumItem[]) => {
    latest.current = fn(latest.current);
    setItems(latest.current);
  }, []);
  const patch = useCallback(
    (clientId: string, p: Partial<AlbumItem>) =>
      update((list) => list.map((i) => (i.clientId === clientId ? { ...i, ...p } : i))),
    [update],
  );

  /** Joue la file ; les refus définitifs sont notés (l'écran relit l'album, les photos réapparaissent). Rend leur nombre. */
  const drain = useCallback(async (): Promise<number> => {
    await queue.release();
    const dropped = queue.takeDropped();
    if (dropped.length > 0) setRefusals((n) => n + dropped.length);
    return dropped.length;
  }, [queue]);
  // Le rejeu du montage : l'écran l'attend (`ready`) avant d'afficher un brouillon repris (une annulation confirmée ici le change).
  const initial = useRef<Promise<number> | null>(null);
  const ready = useCallback(() => initial.current ?? Promise.resolve(0), []);

  // Le montage remet « arrêté » à faux (démontage puis remontage du mode strict) et rejoue la file (opérations non confirmées d'une séance précédente).
  useEffect(() => {
    stopped.current = false;
    initial.current = drain();
    // Retour au premier plan : les opérations non confirmées sont rejouées.
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") void drain();
    });
    return () => {
      stopped.current = true;
      sub.remove();
    };
  }, [drain]);

  // Retour du réseau (connectivité native, comme le Fil et les publications) : la file se rejoue **sans autre action** de la personne.
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) void drain();
    wasOnline.current = online;
  }, [online, drain]);

  /** Ouvre la photothèque (30 photos au plus par ouverture, jamais au-delà des 200 de l'album) et lance la détection des plaques. */
  const pick = useCallback(
    async (inAlbum: number) => {
      const room = pickLimit(inAlbum + latest.current.length, 0);
      if (room === 0) return;
      const picked: PickedPhoto[] = await pickPhotos(room);
      if (picked.length === 0) return;
      const fresh: AlbumItem[] = picked.map((p) => ({
        clientId: randomUUID(),
        uri: p.uri,
        width: p.width,
        height: p.height,
        rects: [],
        detected: false,
      }));
      update((list) => [...list, ...fresh]);
      // Détection une photo à la fois (ML Kit) ; sans détecteur (web, Expo Go) : aucune plaque repérée, la photo part « aucune plaque ».
      // Un cadre posé entretemps à la main n'est jamais remplacé (`detectionPatch`).
      for (const item of fresh) {
        let found: PlateRect[] = [];
        try {
          found = (await detectPlates(item.uri, item.width, item.height)) ?? [];
        } catch {
          found = [];
        }
        if (stopped.current) return;
        const now = latest.current.find((i) => i.clientId === item.clientId);
        if (now) patch(item.clientId, detectionPatch(now, found));
      }
    },
    [update, patch],
  );

  /** Règle à la main les cadres de plaque d'une photo (le détecteur peut en rater une) ; sa décision, déjà prise, est gardée. */
  const setRects = useCallback(
    (clientId: string, rects: PlateRect[]) => {
      if (!frozen.current) patch(clientId, { rects, edited: true });
    },
    [patch],
  );

  /** La décision du bloc : pour les photos à plaque qui n'en ont pas encore (les autres gardent la leur). */
  const decide = useCallback(
    (choice: BatchChoice) => {
      if (!frozen.current) update((list) => decideAll(list, choice));
    },
    [update],
  );
  /** « Changer » : rouvre les décisions des photos dont l'ajout n'est pas parti. */
  const reopen = useCallback(() => {
    if (!frozen.current) update((list) => reopenDecisions(list));
  }, [update]);

  /**
   * Retire une photo de la séance. Pas encore ajoutée : son envoi est retiré (file). Ajout parti (même sans réponse) : **annulation par
   * `clientId`**, qui entre dans la file (mémoire et persistance) **avant** son premier appel ; confirmée par un 204 de l'API. Hors ligne ou
   * session expirée : elle reste en file, la photo part de l'écran, la publication attend. Refus définitif : la photo reste, avec l'erreur.
   */
  const remove = useCallback(
    async (clientId: string): Promise<boolean> => {
      const gone = latest.current.find((i) => i.clientId === clientId);
      if (!gone) return true;
      setError(null);
      try {
        if (albumId) {
          const result = await removeAlbumItem(gone, { albumId, queue });
          if (result.status === "refused") {
            setError(errorMessage(result.error));
            return false;
          }
        } else if (gone.upload) queue.retire({ id: gone.upload.id, key: gone.upload.key });
      } catch (e) {
        setError(errorMessage(e));
        return false;
      }
      update((list) => list.filter((i) => i.clientId !== clientId));
      return true;
    },
    [albumId, queue, update],
  );

  /** Envoie les photos qui restent ; vrai quand tout est ajouté à l'album. */
  const send = useCallback(
    async (turnHeld = false): Promise<boolean> => {
      if (!albumId) return false;
      if (!turnHeld) {
        if (busyRef.current) return false;
        busyRef.current = true;
      }
      setSending(true);
      frozen.current = true;
      setError(null);
      try {
        // Les opérations non confirmées (retraits hors ligne) passent avant tout envoi ; un refus définitif arrête l'envoi (les photos réapparaissent).
        if ((await drain()) > 0) throw new Error(L.removalRefused);
        if (queue.hasPending()) throw new Error(L.pendingRemovals);
        await sendAlbumPhotos(latest.current, {
          upload: uploadFile,
          add: (item, body) => api.addAlbumPhoto(albumId, body),
          retire: (u) => queue.retire(u),
          release: () => queue.release(),
          onProgress: (current, total) => setProgress({ current, total }),
          onItem: patch,
          stopped: () => stopped.current,
        });
        setProgress(null);
        return true;
      } catch (e) {
        setProgress(null);
        if (!(e instanceof AlbumSendStopped)) setError(errorMessage(e));
        return false;
      } finally {
        frozen.current = false;
        busyRef.current = false;
        setSending(false);
        // Ce qui a été retiré pendant l'envoi est supprimé sans bloquer la suite (la liste persistante garde ce qui échoue).
        void drain();
      }
    },
    [albumId, drain, patch, queue],
  );

  const counts = decidedCounts(items);
  /**
   * Toute transition (« Continuer », « Publier ») attend la file : `ok` seulement quand plus rien n'attend ; `refused` : un retrait a été refusé
   * pour de bon (l'album est relu, la photo réapparaît) ; sinon `pending` (réseau, session : le retrait reste en file).
   */
  const flush = useCallback(async (): Promise<"ok" | "pending" | "refused"> => {
    if ((await drain()) > 0) return "refused";
    return queue.hasPending() ? "pending" : "ok";
  }, [drain, queue]);
  /** Une opération à la fois : prend le tour, ou rend faux (un autre appui est déjà en cours). */
  const takeTurn = useCallback((): boolean => {
    if (busyRef.current) return false;
    busyRef.current = true;
    return true;
  }, []);
  const endTurn = useCallback(() => {
    busyRef.current = false;
  }, []);
  /** Les identifiants de tentative dont l'annulation attend encore (ces photos ne se montrent pas de nouveau). */
  const pendingClientIds = useCallback(
    () => queue.pendingOps().flatMap((o) => (o.clientId ? [o.clientId] : [])),
    [queue],
  );
  return {
    flush,
    ready,
    refusals,
    takeTurn,
    endTurn,
    pendingClientIds,
    items,
    pick,
    remove,
    setRects,
    decide,
    reopen,
    send,
    sending,
    progress,
    error,
    /** Photos à plaque qui attendent leur décision. */
    plated: platedCount(items),
    /** Combien de photos portent chaque décision (le bloc dit « N floutées » / « N gardées telles quelles »). */
    counts,
    /** « Changer » est possible tant qu'une décision n'est pas figée par un ajout parti. */
    canChange: canReopen(items),
    /** La détection n'est pas finie pour toutes les photos. */
    detecting: items.some((i) => !i.detected),
    /** Photos qui n'ont pas encore été ajoutées à l'album. */
    pending: remaining(items).length,
  };
}
