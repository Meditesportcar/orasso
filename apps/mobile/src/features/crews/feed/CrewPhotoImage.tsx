// Photo du fil d'un crew (lot R5c1, tour 2, D36) : lue avec le jeton de session et gardée **en mémoire seulement**
// (jamais dans le cache disque des images du téléphone) : un membre qui part ne la retrouve pas sur son appareil. Le
// navigateur (recette web) l'affiche depuis un objet en mémoire ; le téléphone depuis une adresse `data:`.
import { useEffect, useState } from "react";
import { Image, type ImageStyle, Platform, type StyleProp, View } from "react-native";

import { apiUrl } from "@/api";
import { getSessionToken } from "@/lib/http";

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function CrewPhotoImage({
  url,
  style,
  accessibilityLabel,
  resizeMode = "contain",
}: {
  url: string;
  style: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
  /** Lot R5c2 : la bannière du crew (même lecture protégée) remplit son cadre. */
  resizeMode?: "contain" | "cover";
}) {
  const token = getSessionToken();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUri(null);
    void fetch(apiUrl(url), {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then(async (blob) => {
        if (!blob || cancelled) return;
        if (Platform.OS === "web") {
          objectUrl = URL.createObjectURL(blob);
          setUri(objectUrl);
        } else {
          const data = await asDataUrl(blob);
          if (!cancelled) setUri(data);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);
  if (!uri) return <View style={style} accessibilityLabel={accessibilityLabel} />;
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} accessibilityLabel={accessibilityLabel} />;
}
