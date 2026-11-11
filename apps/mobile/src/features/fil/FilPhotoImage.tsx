// La première photo d'une publication du Fil (lot R8c2, tour 2) : lue comme toute photo privée (jeton de session), et, si sa carte
// est dans la copie hors ligne, gardée sur le téléphone avec la copie (`savePhoto`, 7 jours). Sans réseau, la photo gardée
// s'affiche ; sinon retour à `CrewPhotoImage` (« Photo indisponible », « Réessayer »). Un chemin à part : la règle des photos de crew
// (mémoire seulement, R5c1) ne change pas. Aucune requête de plus : on ne garde que ce qui vient d'être reçu pour l'affichage.

import { useEffect, useState } from "react";
import { Image, type ImageStyle, type StyleProp, View } from "react-native";

import { apiUrl } from "@/api";
import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { getSessionToken } from "@/lib/http";
import { readPhoto, savePhoto } from "@/lib/offlineCopy";
import { isWantedPhoto } from "./copyPhotos";

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function FilPhotoImage({
  url,
  style,
  accessibilityLabel,
}: {
  url: string;
  style: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) {
  // `shown` : la photo à afficher (reçue en ligne, ou gardée) ; `fallback` : ni l'une ni l'autre, `CrewPhotoImage` dit pourquoi.
  const [shown, setShown] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setShown(null);
    setFallback(false);
    const token = getSessionToken();
    // Une seule requête en ligne : la photo reçue sert à l'affichage et, si sa carte est dans la copie, est gardée.
    void fetch(apiUrl(url), { headers: token ? { authorization: `Bearer ${token}` } : {}, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("refusée");
        const data = await asDataUrl(await res.blob());
        if (cancelled) return;
        setShown(data);
        if (isWantedPhoto(url)) void savePhoto(url, data);
      })
      .catch(async () => {
        const saved = await readPhoto(url);
        if (cancelled) return;
        if (saved) setShown(saved);
        else setFallback(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (fallback)
    return <CrewPhotoImage url={url} style={style} resizeMode="cover" accessibilityLabel={accessibilityLabel} />;
  if (!shown) return <View style={style} accessibilityLabel={accessibilityLabel} />;
  return <Image source={{ uri: shown }} style={style} resizeMode="cover" accessibilityLabel={accessibilityLabel} />;
}
