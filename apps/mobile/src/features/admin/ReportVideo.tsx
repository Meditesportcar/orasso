// La vidéo d'une story signalée, dans le dossier du signalement (lot R7g, tour 2) : un lecteur avec ses commandes, pour la
// modération seulement. Le fichier vient de `GET /admin/reports/:id/media/:nom` (droits du modérateur, `Range` : lecture par
// morceaux, jamais chargée en entier sur le téléphone). Tant qu'elle n'est pas prête, ou si elle ne se lit pas, la vignette
// reste affichée.
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { PrivateImage } from "@/features/messages/PrivateImage";
import { openStoryVideo } from "@/lib/protectedMedia";

export function ReportVideo({
  url,
  posterUrl,
  style,
}: {
  url: string;
  posterUrl: string | null;
  /** Largeur et hauteur du cadre (le même pour la vidéo et pour sa vignette). */
  style: { width: "100%"; height: number };
}) {
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let release: (() => void) | null = null;
    setSource(null);
    void openStoryVideo(url, controller.signal).then((res) => {
      if (controller.signal.aborted) {
        if (res.ok) res.release();
        return;
      }
      if (!res.ok) return;
      release = res.release;
      setSource(res.source);
    });
    return () => {
      controller.abort();
      release?.();
    };
  }, [url]);
  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
  });
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
