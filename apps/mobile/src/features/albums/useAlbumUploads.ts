// Les photos d'un album en cours de création (lot R9e) : le choix dans la photothèque, la détection des plaques à l'appareil, **la décision de plaque
// par photo** et l'envoi une photo à la fois (`albumUploads.ts`, la logique testée). Une coupure laisse les photos faites ; « Reprendre l'envoi »
// repart de la première restante (même `clientId`, l'API rejoue sans doublon). Les envois retirés passent par une file persistante par compte
// (`removalQueue.ts` : place libérée avant un remplacement, suppression hors ligne rejouée à l'ouverture).
import { createRemovalQueue, type PlateRect, type QueuedOp, type RemovalStore } from "@orasso/shared";
import { randomUUID } from "expo-crypto";
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

/** Une panne réseau arrête la série (les suivantes échoueraient aussi, 15 s chacune). */
const stopsRemovals = (e: unknown) => !(e instanceof ApiRequestError) || e.isNetwork;
/** Panne passagère : réseau, ou 5xx, 408, 429 ; elle reste à rejouer. */
const isTransient = (e: unknown) =>
  !(e instanceof ApiRequestError) || e.isNetwork || e.status >= 500 || e.status === 408 || e.status === 429;
/** Refus définitif : tout autre 4xx sort de la file (avec une trace), il ne serait rejoué qu'à l'infini. */
const isFinal = (e: unknown) => e instanceof ApiRequestError && !isTransient(e);

export function useAlbumUploads(albumId: string | null) {
  const [items, setItems] = useState<AlbumItem[]>([]);
  const latest = useRef<AlbumItem[]>([]);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const stopped = useRef(false);
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

  // Le montage remet « arrêté » à faux (démontage puis remontage du mode strict) et rejoue les suppressions restées en échec (hors ligne).
  useEffect(() => {
    stopped.current = false;
    void queue.replay();
    // Retour au premier plan (le réseau est souvent revenu) : les opérations non confirmées sont rejouées, pas seulement à la réouverture.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void queue.replay();
    });
    const onlineWeb = () => void queue.replay();
    if (Platform.OS === "web" && typeof window !== "undefined") window.addEventListener("online", onlineWeb);
    return () => {
      stopped.current = true;
      sub.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") window.removeEventListener("online", onlineWeb);
    };
  }, [queue]);

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
   * Retire une photo de la séance. Pas encore ajoutée : son envoi est retiré (file). Ajoutée : `DELETE /me/albums/:id/photos/:photoId`. Ajout
   * demandé sans réponse : on la retrouve dans l'album par son `clientId` (aucune photo fantôme). Une erreur laisse la photo en place.
   */
  const remove = useCallback(
    async (clientId: string): Promise<boolean> => {
      const gone = latest.current.find((i) => i.clientId === clientId);
      if (!gone) return true;
      setError(null);
      try {
        // Annulation par `clientId` : atomique côté API (un ajout encore en route est refusé, un ajout fini est retiré) ; confirmée par un
        // 204. Hors ligne, elle reste en file (mémoire et persistante) et la photo part de l'écran ; un refus définitif la laisse en place.
        if (albumId)
          await removeAlbumItem(gone, {
            albumId,
            cancel: async (id) => {
              await api.cancelAlbumPhoto(albumId, id);
            },
            queue,
            isTransient,
          });
        else if (gone.upload) queue.retire({ id: gone.upload.id, key: gone.upload.key });
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
  const send = useCallback(async (): Promise<boolean> => {
    if (!albumId) return false;
    setSending(true);
    frozen.current = true;
    setError(null);
    try {
      // Les opérations non confirmées (retraits hors ligne) passent avant tout envoi.
      await queue.release();
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
      setSending(false);
      // Ce qui a été retiré pendant l'envoi est supprimé sans bloquer la suite (la liste persistante garde ce qui échoue).
      void queue.release();
    }
  }, [albumId, patch, queue]);

  const counts = decidedCounts(items);
  /** Confirme les opérations en attente avant de publier ; faux : des retraits attendent le retour du réseau (la publication attend). */
  const flush = useCallback(async (): Promise<boolean> => {
    await queue.release();
    return !queue.hasPending();
  }, [queue]);
  return {
    flush,
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
