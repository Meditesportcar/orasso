// Photo du fil d'un crew (lot R5c1, tour 2, D36) : lue avec le jeton de session et gardée **en mémoire seulement**
// (jamais dans le cache disque des images du téléphone) : un membre qui part ne la retrouve pas sur son appareil. Le
// navigateur (recette web) l'affiche depuis un objet en mémoire ; le téléphone depuis une adresse `data:`.
import { Text, useTheme } from "@orasso/design-system/native";
import { feedScreenLabels as L } from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useEffect, useRef, useState } from "react";
import { Image, type ImageStyle, Platform, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";

import { apiUrl } from "@/api";
import { getSessionToken } from "@/lib/http";
import { SmButton } from "@/ui/Kit";

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Lot R7e2, tour 4 : une photo qui n'arrive pas ne laisse pas un emplacement vide. « Photo indisponible » et « Réessayer »,
 * et la lecture repart toute seule au retour du réseau (rien n'est écrit sur le disque).
 */
function PhotoFailed({
  style,
  label,
  onRetry,
  retryOutside,
}: {
  style: StyleProp<ImageStyle>;
  label?: string;
  onRetry: () => void;
  retryOutside?: boolean;
}) {
  const { t } = useTheme();
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const was = useRef(online);
  useEffect(() => {
    if (online && !was.current) onRetry();
    was.current = online;
  }, [online, onRetry]);
  return (
    <View
      style={[style as StyleProp<ViewStyle>, styles.failed, { backgroundColor: t.color.surface }]}
      accessibilityLabel={label}
      testID="photo-failed"
    >
      <Text variant="caption" color={t.color.ink}>
        {L.photoFailed}
      </Text>
      {retryOutside ? null : (
        <SmButton kind="s" icon="undo" onPress={onRetry} testID="photo-retry">
          {L.retry}
        </SmButton>
      )}
    </View>
  );
}

export function CrewPhotoImage({
  url,
  style,
  accessibilityLabel,
  resizeMode = "contain",
  onLoaded,
  onFailed,
  onLoading,
  retryOutside,
}: {
  url: string;
  style: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
  /** Lot R5c2 : la bannière du crew (même lecture protégée) remplit son cadre. */
  resizeMode?: "contain" | "cover";
  /** Lot R7f2 (visionneuse de stories) : l'image est lue et prête à s'afficher (la minuterie ne part qu'alors). */
  onLoaded?: () => void;
  /** Lot R7f2 : lecture refusée ou perdue (`status` de l'API, 0 sans réponse) ; l'écran dit « plus disponible » pour 403/404. */
  onFailed?: (status: number) => void;
  /** Lot R7f2 : une lecture (re)part (« Réessayer » compris) : l'écran lève l'état « en panne ». */
  onLoading?: () => void;
  /** Lot R7f2, tour 4 : l'écran pose lui-même « Réessayer » au-dessus de ses zones de geste (le bouton n'est pas dessiné ici). */
  retryOutside?: boolean;
}) {
  const token = getSessionToken();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Chaque « Réessayer » (ou retour du réseau) relance la lecture.
  const [attempt, setAttempt] = useState(0);
  const retry = useRef(() => setAttempt((n) => n + 1)).current;
  const events = useRef({ onLoaded, onFailed, onLoading });
  events.current = { onLoaded, onFailed, onLoading };
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` relance la lecture (Réessayer, retour du réseau).
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    let status = 0;
    setUri(null);
    setFailed(false);
    events.current.onLoading?.();
    void fetch(apiUrl(url), {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
      .then((res) => {
        status = res.status;
        return res.ok ? res.blob() : null;
      })
      .then(async (blob) => {
        if (cancelled) return;
        if (!blob) {
          setFailed(true);
          events.current.onFailed?.(status);
          return;
        }
        if (Platform.OS === "web") {
          objectUrl = URL.createObjectURL(blob);
          setUri(objectUrl);
        } else {
          const data = await asDataUrl(blob);
          if (!cancelled) setUri(data);
        }
        if (!cancelled) events.current.onLoaded?.();
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        events.current.onFailed?.(0);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token, attempt]);
  if (!uri && failed)
    return <PhotoFailed style={style} label={accessibilityLabel} onRetry={retry} retryOutside={retryOutside} />;
  if (!uri) return <View style={style} accessibilityLabel={accessibilityLabel} />;
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} accessibilityLabel={accessibilityLabel} />;
}

const styles = StyleSheet.create({
  failed: { alignItems: "center", justifyContent: "center", gap: 8, padding: 8 },
});
