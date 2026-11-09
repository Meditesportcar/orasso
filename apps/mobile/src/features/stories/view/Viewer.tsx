// Le média d'une story, plein écran (maquette R7.7 `.r7svp`). Une photo est déjà le 9:16 complet (1080 x 1920, plaque traitée
// par le serveur : `status ready` seulement) : `cover` sur un écran plus haut, ses bords sont rognés. Le fichier vient de la
// route protégée (`/api/stories/:id/media/:nom`), lu avec le jeton et gardé en mémoire seulement (`CrewPhotoImage`).
//
// Fichier PARTAGÉ avec les lots suivants (une ligne chacun) : R7g2 ajoute la branche `mediaKind === "video"` (lecteur
// `VideoSlide`) à l'endroit marqué ci-dessous. Tant qu'elle n'existe pas, une vidéo (que l'API ne publie pas encore : 501
// « Vidéo bientôt ») n'est jamais lue comme une image.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { storyViewerLabels as L, type StoryView } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";

export function Viewer({
  story,
  authorName,
  width,
  height,
  onLoaded,
  onFailed,
  onLoading,
}: {
  story: StoryView;
  authorName: string;
  width: number;
  height: number;
  onLoaded: () => void;
  onFailed: (status: number) => void;
  onLoading: () => void;
}) {
  const { t } = useTheme();
  // R7g2 : `if (story.mediaKind === "video") return <VideoSlide … />;` ici.
  if (story.mediaKind === "video") {
    return (
      <View style={[styles.fill, { width, height, backgroundColor: t.color.night }]} testID="story-video-soon">
        <Text variant="bodyStrong" color={t.color.nightInk}>
          {L.videoSoon}
        </Text>
        <Text variant="caption" color={t.color.nightInk} style={styles.hint}>
          {L.videoSoonHint}
        </Text>
      </View>
    );
  }
  return (
    <CrewPhotoImage
      url={story.mediaUrl}
      style={{ width, height }}
      resizeMode="cover"
      accessibilityLabel={L.photoAlt(authorName)}
      onLoaded={onLoaded}
      onFailed={onFailed}
      onLoading={onLoading}
      retryOutside
    />
  );
}

const styles = StyleSheet.create({
  fill: { alignItems: "center", justifyContent: "center", gap: tokens.spacing.space2 },
  hint: { opacity: 0.8 },
});
