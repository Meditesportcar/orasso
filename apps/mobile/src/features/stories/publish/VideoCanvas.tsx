// L'aperçu d'une vidéo de story (lot R7g, maquette R7.8 `ps_4_md_video`) : le cadre 9:16 tel que les autres le verront, la
// vidéo muette en boucle (`expo-video`). Une vidéo qui n'est pas en 9:16 est posée au centre sur sa vignette floutée : à
// l'affichage, jamais dans le fichier. Légende et autocollants par-dessus (`children`). Aucun floutage de plaque : une vidéo
// est publiée telle quelle.
import { tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { STORY_H, STORY_W, storyVideoLayout } from "@orasso/shared";
import { useVideoPlayer, VideoView } from "expo-video";
import type { ReactNode } from "react";
import { Image, type ImageStyle, Platform, StyleSheet, View } from "react-native";

import type { PickedVideo } from "@/lib/storyVideo";

/** Un fond flou : `blurRadius` sur téléphone, le filtre CSS dans le navigateur (où `blurRadius` n'existe pas). */
const WEB_BLUR = Platform.OS === "web" ? ({ filter: "blur(28px)" } as unknown as ImageStyle) : null;

export function VideoCanvas({
  video,
  viewWidth,
  children,
  testID,
}: {
  video: PickedVideo;
  /** Largeur du cadre à l'écran ; la hauteur suit (9:16). */
  viewWidth: number;
  children?: ReactNode;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const player = useVideoPlayer(video.uri, (p) => {
    p.muted = true;
    p.loop = true;
    p.play();
  });
  const layout = storyVideoLayout(video.width, video.height);
  const viewHeight = Math.round((viewWidth * STORY_H) / STORY_W);
  return (
    <View
      style={[
        styles.canvas,
        { width: viewWidth, height: viewHeight, backgroundColor: c.night, borderRadius: tokens.radius.radiusLg },
      ]}
      testID={testID}
    >
      <Image
        source={{ uri: video.posterUri }}
        blurRadius={layout === "full" ? 0 : 40}
        resizeMode="cover"
        style={[StyleSheet.absoluteFill, layout === "full" ? null : [styles.back, WEB_BLUR]]}
        accessibilityIgnoresInvertColors
      />
      {layout === "full" ? null : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(c.night, 0.2) }]} />
      )}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={layout === "full" ? "cover" : "contain"}
        nativeControls={false}
        allowsPictureInPicture={false}
        testID="story-preview-video"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { overflow: "hidden" },
  back: { transform: [{ scale: 1.12 }] },
});
