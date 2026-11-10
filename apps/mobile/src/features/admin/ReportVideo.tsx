// La vidéo d'une story signalée, dans le dossier du signalement (lot R7g, tour 2) : un lecteur avec ses commandes, pour la
// modération seulement. Le fichier vient de `GET /admin/reports/:id/media/:nom` (droits du modérateur, `Range` : lecture par
// morceaux, jamais chargée en entier sur le téléphone). Tant qu'elle n'est pas prête, la vignette reste affichée ; si la sonde
// ou le lecteur échoue, le dossier le dit (« La vidéo n'a pas pu être lue ») et propose « Réessayer » (tour 3) : un modérateur ne
// juge jamais un dossier incomplet sans le savoir. Rafraîchir le dossier (`refresh` change) relance la lecture d'une vidéo en échec.
import { moderationLabels } from "@orasso/shared";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { PrivateImage } from "@/features/messages/PrivateImage";
import { SmallButton } from "@/features/sorties/bits";
import { openStoryVideo } from "@/lib/protectedMedia";
import { Notice } from "@/ui/Notice";

export function ReportVideo({
  url,
  posterUrl,
  style,
  refresh,
}: {
  url: string;
  posterUrl: string | null;
  /** Largeur et hauteur du cadre (le même pour la vidéo et pour sa vignette). */
  style: { width: "100%"; height: number };
  /** Change quand le dossier est rechargé : une vidéo en échec est alors relue. */
  refresh?: unknown;
}) {
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` relance la lecture (« Réessayer »)
  useEffect(() => {
    const controller = new AbortController();
    let release: (() => void) | null = null;
    setSource(null);
    setFailed(false);
    void openStoryVideo(url, controller.signal).then((res) => {
      if (controller.signal.aborted) {
        if (res.ok) res.release();
        return;
      }
      if (!res.ok) return setFailed(true);
      release = res.release;
      setSource(res.source);
    });
    return () => {
      controller.abort();
      release?.();
    };
  }, [url, attempt]);
  // Dossier rechargé : une lecture en échec repart (une lecture qui marche n'est pas interrompue).
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le rechargement du dossier relance
  useEffect(() => {
    if (failed) setAttempt((n) => n + 1);
  }, [refresh]);
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "error") setFailed(true);
    });
    return () => sub.remove();
  }, [player]);
  if (failed) {
    return (
      <View testID="report-video-failed">
        {posterUrl ? <PrivateImage url={posterUrl} style={style} /> : null}
        <Notice tone="error">{moderationLabels.videoFailed}</Notice>
        <SmallButton icon="undo" onPress={() => setAttempt((n) => n + 1)} testID="report-video-retry">
          {moderationLabels.videoRetry}
        </SmallButton>
      </View>
    );
  }
  return source ? (
    <View style={style} testID="report-video">
      <VideoView
        player={player}
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
        nativeControls
        allowsPictureInPicture={false}
      />
    </View>
  ) : posterUrl ? (
    <PrivateImage url={posterUrl} style={style} />
  ) : null;
}
