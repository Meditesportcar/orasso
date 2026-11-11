// La première photo d'une publication du Fil (lot R8c2, tour 2) : lue comme toute photo privée (jeton de session), et, si sa carte
// est dans la copie hors ligne, gardée sur le téléphone avec la copie (`savePhoto`, 7 jours, 25 Mo par compte). **Seule une absence
// de réponse** (réseau coupé) affiche la photo gardée ; une réponse du serveur (401, 403, 404, 410 : accès retiré, publication
// supprimée, photo modérée) efface la photo gardée et passe à `CrewPhotoImage`, qui dit pourquoi. Un chemin à part : la règle
// des photos de crew (mémoire seulement, R5c1) ne change pas. Une seule requête en ligne.
import { useEffect, useState } from "react";
import { Image, type ImageStyle, type StyleProp, View } from "react-native";

import { apiUrl } from "@/api";
import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { getSessionToken } from "@/lib/http";
import { accountGuard } from "@/lib/kv";
import { deletePhoto, readPhoto, savePhoto } from "@/lib/offlineCopy";
import { isWantedPhoto, photoResponseAction } from "./copyPhotos";

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
  const [shown, setShown] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setShown(null);
    setFallback(false);
    const token = getSessionToken();
    // Le compte est capturé avant la requête : une réponse tardive d'un autre compte n'écrit rien sous celui d'après.
    const account = accountGuard();
    void (async () => {
      let res: Response;
      try {
        res = await fetch(apiUrl(url), {
          headers: token ? { authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
      } catch {
        // Aucune réponse : la photo gardée, sinon le repli.
        const saved = await readPhoto(url, new Date(), account);
        if (cancelled) return;
        if (saved) setShown(saved);
        else setFallback(true);
        return;
      }
      const action = photoResponseAction(res.status);
      if (action === "forget") await deletePhoto(url, account);
      if (action !== "show") {
        if (!cancelled) setFallback(true);
        return;
      }
      try {
        const data = await asDataUrl(await res.blob());
        if (cancelled) return;
        setShown(data);
        if (isWantedPhoto(url)) void savePhoto(url, data, new Date(), account);
      } catch {
        if (!cancelled) setFallback(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (fallback)
    return <CrewPhotoImage url={url} style={style} resizeMode="cover" accessibilityLabel={accessibilityLabel} />;
  if (!shown) return <View style={style} accessibilityLabel={accessibilityLabel} />;
  return <Image source={{ uri: shown }} style={style} resizeMode="cover" accessibilityLabel={accessibilityLabel} />;
}
