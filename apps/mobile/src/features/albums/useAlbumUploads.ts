// Les photos d'un album en cours de création (lot R9e) : le choix dans la photothèque, la détection des plaques à l'appareil, **la décision de plaque
// par photo** et l'envoi une photo à la fois (`albumUploads.ts`, la logique testée). Une coupure laisse les photos faites ; « Reprendre l'envoi »
// repart de la première restante (même `clientId`, l'API rejoue sans doublon).
//
// **Retirer une photo ajoutée est une opération serveur synchrone** (tour 4) : elle demande du réseau, la photo reste affichée (« Retrait… »)
// jusqu'au 204 de l'API, un échec la laisse visible avec son message et « Réessayer ». Une seule garde (`removePhoto`) devant tous les chemins.
// Une seule opération à la fois (envoi, retrait, « Continuer ») : les transitions sont désactivées tant qu'elle dure, et **le tour a un
// propriétaire** (tour 5 : `createAlbumTurn`, un jeton que seule l'opération qui l'a pris peut rendre). Au changement de compte, le formulaire est
// **mort pour toujours** (billet de compte avec génération : A, puis B, puis A ne le ressuscite pas) : plus aucune requête ne part, aucune réponse
// en vol n'est appliquée (`alive()`). Les envois non utilisés sont supprimés « au mieux », sans persistance : un essai, puis rien (le serveur
// purge les envois après 24 h et ne les compte plus).
import { type AlbumTurn, createAlbumTurn, type PlateRect, removalRoute, type TurnToken } from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useNetworkState } from "expo-network";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { accountTicket } from "@/lib/kv";
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
  // Une seule opération à la fois, **tour à propriétaire** : un second appui ne lance rien, et nul ne rend le tour d'un autre. Le billet de
  // compte (avec sa génération) est pris au départ ; une fois faux, le formulaire reste mort.
  const turnRef = useRef<AlbumTurn | null>(null);
  if (!turnRef.current) turnRef.current = createAlbumTurn(accountTicket().current);
  const turn = turnRef.current;
  const [busy, setBusy] = useState(false);
  // L'envoi fige tout : pendant qu'il tourne, ni les cadres ni la décision ne changent (l'état aussi, pas seulement les boutons).
  const frozen = useRef(false);
  // Retrait en cours (clé de la photo) et dernier échec de retrait (clé + message) : la photo reste visible.
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<{ key: string; message: string } | null>(null);

  const [dead, setDead] = useState(false);
  /** Vrai tant que c'est le compte du départ ; sinon le formulaire meurt **pour toujours** (plus de requête, plus de réponse appliquée). */
  const alive = useCallback((): boolean => {
    if (turn.alive()) return true;
    setDead(true);
    return false;
  }, [turn]);
  // La mort se voit aussi sans action : le compte est relu toutes les secondes tant que l'écran existe (les boutons se désactivent d'eux-mêmes).
  useEffect(() => {
    const id = setInterval(() => void alive(), 1000);
    return () => clearInterval(id);
  }, [alive]);

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

  /** Prend le tour (une opération à la fois) ; `null` : un autre appui est déjà en cours, ou le formulaire est mort. */
  const takeTurn = useCallback((): TurnToken | null => {
    if (!alive()) return null;
    const token = turn.take();
    if (token) setBusy(true);
    return token;
  }, [alive, turn]);
  /** Rend le tour **à son propriétaire seulement** (un autre jeton ne rend rien). */
  const endTurn = useCallback(
    (token: TurnToken | null) => {
      if (turn.end(token)) setBusy(false);
    },
    [turn],
  );
  /** Une opération tient le tour (lu de façon synchrone, pour la garde de sortie de l'écran). */
  const isBusy = useCallback(() => turn.busy(), [turn]);

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
      // **La sélection et la conversion tiennent le tour** (tour 6) : tant que le sélecteur est ouvert et que les photos sont converties, ni
      // « Continuer », ni un retrait ne partent (des photos arrivées pendant la transition ne seraient jamais envoyées). Le jeton est rendu dans
      // un `finally` ; la détection des plaques, elle, se lit déjà par `detecting` (« Continuer » attend).
      const token = takeTurn();
      if (!token) return;
      let fresh: AlbumItem[] = [];
      try {
        const room = pickLimit(inAlbum + latest.current.length, 0);
        if (room === 0) return;
        const picked: PickedPhoto[] = await pickPhotos(room);
        if (picked.length === 0 || !alive()) return;
        fresh = picked.map((p) => ({
          clientId: randomUUID(),
          uri: p.uri,
          width: p.width,
          height: p.height,
          rects: [],
          detected: false,
        }));
        update((list) => [...list, ...fresh]);
      } finally {
        endTurn(token);
      }
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
    [alive, endTurn, takeTurn, update, patch],
  );

  /** Règle à la main les cadres de plaque d'une photo (le détecteur peut en rater une) ; sa décision, déjà prise, est gardée. */
  const setRects = useCallback(
    (clientId: string, rects: PlateRect[]) => {
      if (!frozen.current && !turn.busy() && alive()) patch(clientId, { rects, edited: true });
    },
    [alive, turn, patch],
  );

  /** La décision du bloc : pour les photos à plaque qui n'en ont pas encore (les autres gardent la leur). */
  const decide = useCallback(
    (choice: BatchChoice) => {
      if (!frozen.current && !turn.busy() && alive()) update((list) => decideAll(list, choice));
    },
    [alive, turn, update],
  );
  /** « Changer » : rouvre les décisions des photos dont l'ajout n'est pas parti. */
  const reopen = useCallback(() => {
    if (!frozen.current && !turn.busy() && alive()) update((list) => reopenDecisions(list));
  }, [alive, turn, update]);

  /**
   * **La seule garde de retrait**, devant tous les chemins (photo de la séance, ajout en vol, brouillon repris, photo réapparue) : le tour (un
   * seul retrait, jamais pendant un envoi ni « Continuer »), le compte, puis l'état de la photo (`removalRoute`) :
   * - **local** (aucun envoi commencé) : la photo part de l'écran tout de suite, sans réseau, son envoi inutilisé est supprimé au mieux ;
   * - **serveur** (ajout parti ou ajoutée) : opération synchrone qui demande du réseau (`removeAlbumPhoto` : par `clientId` si connu, sinon par
   *   identifiant). Vrai seulement au 204 ; sinon la photo reste visible avec le message (`removeError`) et « Réessayer » ;
   * - **bloqué** : un envoi est en vol, rien ne se retire.
   * Vrai : la photo est retirée (l'appelant retire la tuile du brouillon repris).
   */
  const removePhoto = useCallback(
    async (target: { clientId?: string | null; photoId?: string | null }): Promise<boolean> => {
      const key = target.clientId ?? target.photoId ?? "";
      const token = takeTurn();
      if (!token) return false;
      try {
        const item = target.clientId ? latest.current.find((i) => i.clientId === target.clientId) : undefined;
        const route = item ? removalRoute(item, frozen.current) : "server";
        if (route === "blocked") return false;
        if (route === "server") {
          if (!albumId || !online) return false;
          setRemoving(key);
          setRemoveError(null);
          try {
            await removeAlbumPhoto(target, {
              cancelByClient: (id) => api.cancelAlbumPhoto(albumId, id),
              deleteByPhoto: (id) => api.deleteAlbumPhoto(albumId, id),
            });
          } catch (e) {
            if (alive()) setRemoveError({ key, message: errorMessage(e) });
            return false;
          } finally {
            setRemoving(null);
          }
        }
        // Une réponse qui arrive après un changement de compte n'est pas appliquée.
        if (!alive()) return false;
        if (item) {
          // L'envoi resté sans ajout n'est plus utile : suppression au mieux, un essai (le serveur purge à 24 h).
          if (item.upload) retireUpload(item.upload);
          update((list) => list.filter((i) => i.clientId !== item.clientId));
        }
        return true;
      } finally {
        endTurn(token);
      }
    },
    [albumId, alive, endTurn, online, retireUpload, takeTurn, update],
  );
  /** Retire une photo de la séance (par sa tentative). */
  const remove = useCallback(
    async (clientId: string): Promise<boolean> => {
      if (!latest.current.some((i) => i.clientId === clientId)) return true;
      return removePhoto({ clientId });
    },
    [removePhoto],
  );
  /** Retire une photo du brouillon repris (d'avant la séance) : le même chemin, toujours par le serveur. */
  const removeBase = useCallback(
    (photo: { id: string; clientId?: string | null }) => removePhoto({ clientId: photo.clientId, photoId: photo.id }),
    [removePhoto],
  );

  /** Envoie les photos qui restent ; vrai quand tout est ajouté à l'album. `held` : le tour tenu par l'appelant (« Continuer »), qu'il rendra lui-même. */
  const send = useCallback(
    async (held: TurnToken | null = null): Promise<boolean> => {
      if (!albumId) return false;
      const token = held ?? takeTurn();
      if (!token) return false;
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
          stopped: () => stopped.current || !turn.alive(),
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
        // Le tour est rendu par son propriétaire : ici seulement s'il a été pris ici.
        if (!held) endTurn(token);
      }
    },
    [albumId, alive, endTurn, patch, retireUpload, settleCleanups, takeTurn, turn],
  );

  const counts = decidedCounts(items);
  return {
    items,
    pick,
    remove,
    removeBase,
    removing,
    removeError,
    clearRemoveError: () => setRemoveError(null),
    online,
    dead,
    alive,
    busy,
    isBusy,
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
