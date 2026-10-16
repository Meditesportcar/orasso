// Image privée d'un message (lot 18) : servie par l'API aux seuls participants, avec le jeton de session. Sur le
// téléphone, l'en-tête `Authorization` accompagne la requête de l'image ; dans un navigateur (recette web), l'image
// est téléchargée avec le jeton puis affichée depuis la mémoire.
import { useEffect, useState } from "react";
import { Image, type ImageStyle, Platform, type StyleProp } from "react-native";

import { apiUrl } from "@/api";
import { getSessionToken } from "@/lib/http";

export function PrivateImage({
  url,
  style,
  accessibilityLabel,
}: {
  url: string;
  style: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) {
  const token = getSessionToken();
  const [webUri, setWebUri] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void fetch(apiUrl(url), { headers: token ? { authorization: `Bearer ${token}` } : {} })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setWebUri(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);
  if (Platform.OS === "web") {
    return webUri ? (
      <Image source={{ uri: webUri }} style={style} resizeMode="contain" accessibilityLabel={accessibilityLabel} />
    ) : null;
  }
  return (
    <Image
      source={{ uri: apiUrl(url), headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
      style={style}
      resizeMode="contain"
      accessibilityLabel={accessibilityLabel}
    />
  );
}
