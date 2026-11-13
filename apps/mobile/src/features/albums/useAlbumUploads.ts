// Les photos d'un album en cours de création (lot R9e) : le choix dans la photothèque, la détection des plaques à l'appareil, la décision du
// lot et l'envoi une photo à la fois (`albumUploads.ts`, la logique testée). Une coupure laisse les photos faites ; « Reprendre l'envoi »
// repart de la première restante (même `clientId`, l'API rejoue sans doublon).
import type { PlateRect } from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { type PickedPhoto, pickPhotos } from "@/lib/photos";
import { detectPlates } from "@/lib/plates/detect";
import type { UploadState } from "@/ui/PhotoGrid";
import {
  type AlbumItem,
  AlbumSendStopped,
  type BatchChoice,
  pickLimit,
  platedCount,
  remaining,
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
  const [batch, setBatch] = useState<BatchChoice | null>(null);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const stopped = useRef(false);
  const retired = useRef<{ id: string }[]>([]);

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

  /** Ouvre la photothèque (30 photos au plus par ouverture, jamais au-delà des 200 de l'album) et lance la détection des plaques. */
  const pick = useCallback(
    async (inAlbum: number) => {
      const room = pickLimit(inAlbum, remaining(latest.current).length);
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
      for (const item of fresh) {
        let rects: PlateRect[] = [];
        try {
          rects = (await detectPlates(item.uri, item.width, item.height)) ?? [];
        } catch {
          rects = [];
        }
        if (stopped.current) return;
        patch(item.clientId, { rects, detected: true });
      }
    },
    [update, patch],
  );

  const remove = useCallback(
    (clientId: string) => {
      const gone = latest.current.find((i) => i.clientId === clientId);
      if (gone?.upload) retired.current.push({ id: gone.upload.id });
      update((list) => list.filter((i) => i.clientId !== clientId));
    },
    [update],
  );

  /** Règle à la main les cadres de plaque d'une photo (le détecteur peut en rater une) ; un envoi déjà fait pour d'autres cadres repart. */
  const setRects = useCallback((clientId: string, rects: PlateRect[]) => patch(clientId, { rects }), [patch]);

  /** Envoie les photos qui restent ; vrai quand tout est ajouté à l'album. */
  const send = useCallback(async (): Promise<boolean> => {
    if (!albumId) return false;
    setSending(true);
    setError(null);
    try {
      await sendAlbumPhotos(latest.current, batch, {
        upload: uploadFile,
        add: (item, body) => api.addAlbumPhoto(albumId, body),
        retire: (u) => retired.current.push({ id: u.id }),
        onProgress: (current, total) => setProgress({ current, total }),
        onItem: patch,
        stopped: () => stopped.current,
      });
      setProgress(null);
      // Les envois retirés (décision changée) sont supprimés côté API, sans bloquer la suite.
      for (const u of retired.current.splice(0)) void api.deleteUpload(u.id).catch(() => undefined);
      return true;
    } catch (e) {
      setProgress(null);
      if (!(e instanceof AlbumSendStopped)) setError(errorMessage(e));
      return false;
    } finally {
      setSending(false);
    }
  }, [albumId, batch, patch]);

  return {
    items,
    batch,
    setBatch,
    pick,
    remove,
    setRects,
    send,
    sending,
    progress,
    error,
    /** Photos dont la plaque est repérée et qui attendent la décision du lot. */
    plated: platedCount(items),
    /** La détection n'est pas finie pour toutes les photos. */
    detecting: items.some((i) => !i.detected),
    /** Photos qui n'ont pas encore été ajoutées à l'album. */
    pending: remaining(items).length,
  };
}
