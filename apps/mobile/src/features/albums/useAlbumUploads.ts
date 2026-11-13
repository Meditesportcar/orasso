// Les photos d'un album en cours de création (lot R9e) : le choix dans la photothèque, la détection des plaques à l'appareil, **la décision de plaque
// par photo** et l'envoi une photo à la fois (`albumUploads.ts`, la logique testée). Une coupure laisse les photos faites ; « Reprendre l'envoi »
// repart de la première restante (même `clientId`, l'API rejoue sans doublon).
//
// **Retirer une photo ajoutée est une opération serveur synchrone** (tour 4) : elle demande du réseau, la photo reste affichée (« Retrait… »)
// jusqu'au 204 de l'API, un échec la laisse visible avec son message et « Réessayer ». Un seul chemin (`removeAlbumPhoto`) pour tous les retraits.
// Une seule opération à la fois (envoi, retrait) : les transitions sont désactivées tant qu'elle dure. Au changement de compte, le formulaire est
// **mort** : plus aucune requête ne part, aucune réponse en vol n'est appliquée (`alive()`). Les envois non utilisés sont supprimés « au mieux »,
// sans persistance : un essai, puis rien (le serveur purge les envois après 24 h et ne les compte plus).
import type { PlateRect } from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useNetworkState } from "expo-network";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { accountGuard } from "@/lib/kv";
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
  type RemovalTarget,
  remaining,
  removeAlbumPhoto,
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

export function useAlbumUploads(albumId: string | null) {
  const [items, setItems] = useState<AlbumItem[]>([]);
  const latest = useRef<AlbumItem[]>([]);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const stopped = useRef(false);
  // Une seule opération à la fois : un second appui pendant un envoi ou un retrait ne lance rien.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  // L'envoi fige tout : pendant qu'il tourne, ni les cadres ni la décision ne changent (l'état aussi, pas seulement les boutons).
  const frozen = useRef(false);
  // Retrait en cours (clé de la photo) et dernier échec de retrait (clé + message) : la photo reste visible.
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<{ key: string; message: string } | null>(null);

  // Le compte du départ : s'il change (déconnexion, autre compte), le formulaire est mort.
  const guard = useRef(accountGuard());
  const [dead, setDead] = useState(false);
  /** Vrai tant que c'est le compte du départ ; sinon le formulaire meurt (plus de requête, plus de réponse appliquée). */
  const alive = useCallback((): boolean => {
    if (guard.current.current()) return true;
    setDead(true);
    return false;
  }, []);

  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;

  const update = useCallback((fn: (list: AlbumItem[]) => AlbumItem[]) => {
    latest.current = fn(latest.current);
    setItems(latest.current);
  }, []);
  const patch = useCallback(
    (clientId: string, p: Partial<AlbumItem>) =>
      update((list) => list.map((i) => (i.clientId === clientId ? { ...i, ...p } : i))),
    [update],
  );

  // Le montage remet « arrêté » à faux (démontage puis remontage du mode strict).
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  /** Prend le tour (une opération à la fois) ; faux : un autre appui est déjà en cours, ou le formulaire est mort. */
  const takeTurn = useCallback((): boolean => {
    if (busyRef.current || !alive()) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }, [alive]);
  const endTurn = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
  }, []);

  // Les envois non utilisés (photo retirée avant l'ajout, cadres changés) : suppression au mieux, un essai, sans persistance.
  const cleanups = useRef<Promise<unknown>[]>([]);
  const retireUpload = useCallback((u: { id: string }) => {
    cleanups.current.push(api.deleteUpload(u.id).then(undefined, () => undefined));
  }, []);
  const settleCleanups = useCallback(async () => {
    await Promise.all(cleanups.current.splice(0));
  }, []);

  /** Ouvre la photothèque (30 photos au plus par ouverture, jamais au-delà des 200 de l'album) et lance la détection des plaques. */
  const pick = useCallback(
    async (inAlbum: number) => {
      const room = pickLimit(inAlbum + latest.current.length, 0);
      if (room === 0) return;
      const picked: PickedPhoto[] = await pickPhotos(room);
      if (picked.length === 0 || !alive()) return;
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
    [alive, update, patch],
  );

  /** Règle à la main les cadres de plaque d'une photo (le détecteur peut en rater une) ; sa décision, déjà prise, est gardée. */
  const setRects = useCallback(
    (clientId: string, rects: PlateRect[]) => {
      if (!frozen.current && alive()) patch(clientId, { rects, edited: true });
    },
    [alive, patch],
  );

  /** La décision du bloc : pour les photos à plaque qui n'en ont pas encore (les autres gardent la leur). */
  const decide = useCallback(
    (choice: BatchChoice) => {
      if (!frozen.current && alive()) update((list) => decideAll(list, choice));
    },
    [alive, update],
  );
  /** « Changer » : rouvre les décisions des photos dont l'ajout n'est pas parti. */
  const reopen = useCallback(() => {
    if (!frozen.current && alive()) update((list) => reopenDecisions(list));
  }, [alive, update]);

  /**
   * **Le retrait d'une photo ajoutée** (séance, brouillon repris, photo en vol) : une opération serveur synchrone, qui demande du réseau. Vrai
   * seulement sur le 204 ; sinon la photo reste visible, avec le message (`removeError`) et « Réessayer ». Aucune photo ne quitte l'écran avant.
   */
  const removeServer = useCallback(
    async (target: RemovalTarget): Promise<boolean> => {
      const key = target.clientId ?? target.photoId ?? "";
      if (!albumId || !online || !takeTurn()) return false;
      setRemoving(key);
      setRemoveError(null);
      try {
        await removeAlbumPhoto(target, {
          cancelByClient: (id) => api.cancelAlbumPhoto(albumId, id),
          deleteByPhoto: (id) => api.deleteAlbumPhoto(albumId, id),
        });
        // Une réponse qui arrive après un changement de compte n'est pas appliquée.
        return alive();
      } catch (e) {
        if (alive()) setRemoveError({ key, message: errorMessage(e) });
        return false;
      } finally {
        setRemoving(null);
        endTurn();
      }
    },
    [albumId, alive, endTurn, online, takeTurn],
  );

  /** Retire une photo de la séance : pas encore ajoutée, elle part de l'écran tout de suite (rien côté serveur) ; sinon retrait serveur, puis elle part. */
  const remove = useCallback(
    async (clientId: string): Promise<boolean> => {
      const gone = latest.current.find((i) => i.clientId === clientId);
      if (!gone) return true;
      if (gone.attempted || gone.photoId) {
        if (!(await removeServer({ clientId: gone.clientId, photoId: gone.photoId }))) return false;
      } else if (gone.upload) retireUpload(gone.upload);
      update((list) => list.filter((i) => i.clientId !== clientId));
      return true;
    },
    [removeServer, retireUpload, update],
  );

  /** Envoie les photos qui restent ; vrai quand tout est ajouté à l'album. */
  const send = useCallback(
    async (turnHeld = false): Promise<boolean> => {
      if (!albumId) return false;
      if (!turnHeld && !takeTurn()) return false;
      setSending(true);
      frozen.current = true;
      setError(null);
      try {
        await sendAlbumPhotos(latest.current, {
          upload: async (item, rects) => {
            if (!alive()) throw new AlbumSendStopped();
            const up = await uploadFile(item, rects);
            if (!alive()) throw new AlbumSendStopped();
            return up;
          },
          add: async (item, body) => {
            if (!alive()) throw new AlbumSendStopped();
            const added = await api.addAlbumPhoto(albumId, body);
            if (!alive()) throw new AlbumSendStopped();
            return added;
          },
          retire: retireUpload,
          release: settleCleanups,
          onProgress: (current, total) => setProgress({ current, total }),
          onItem: (id, p) => {
            if (alive()) patch(id, p);
          },
          stopped: () => stopped.current || !guard.current.current(),
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
        endTurn();
      }
    },
    [albumId, alive, endTurn, patch, retireUpload, settleCleanups, takeTurn],
  );

  const counts = decidedCounts(items);
  return {
    items,
    pick,
    remove,
    removeServer,
    removing,
    removeError,
    clearRemoveError: () => setRemoveError(null),
    online,
    dead,
    alive,
    busy,
    takeTurn,
    endTurn,
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
