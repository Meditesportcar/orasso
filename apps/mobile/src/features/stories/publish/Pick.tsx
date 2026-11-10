// Choisir la photo de la story quand l'appareil n'est pas (encore) là (lot R7f3, maquette R7.8 étape 1) : « Galerie »
// (une photo, le sélecteur du système) et « Appareil » (demande l'accès, puis l'appareil plein écran). Dans le navigateur de
// recette, ou quand l'accès à l'appareil est refusé, la galerie reste possible : la story ne dépend jamais de la caméra.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { storyPublishLabels as L, storyVideoLabels as V } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space2, space3 } = tokens.spacing;

export type CameraAccess = "unknown" | "granted" | "denied" | "unavailable";

export function Pick({
  camera,
  busy,
  error,
  onGallery,
  onCamera,
  onVideo,
  status,
}: {
  /** L'appareil : `unavailable` dans le navigateur, `denied` si l'accès est refusé pour de bon. */
  camera: CameraAccess;
  busy: boolean;
  error: string | null;
  onGallery: () => void;
  onCamera: () => void;
  /** Une vidéo de la galerie (lot R7g) : 30 s au plus, publiée telle quelle. */
  onVideo: () => void;
  /** Lecture ou compression d'une vidéo en cours. */
  status?: string | null;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.block} testID="story-pick">
      <View style={[styles.hero, { backgroundColor: c.surface }]}>
        <Icon name="camera" size={30} color={c.accentText} />
        <Text variant="posterM" color={c.ink}>
          {L.pickTitle}
        </Text>
        <Muted variant="body">{L.pickHint}</Muted>
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {status ? (
        <Muted variant="caption" testID="story-pick-status">
          {status}
        </Muted>
      ) : null}
      {camera === "denied" ? <Notice testID="story-pick-denied">{L.cameraDenied}</Notice> : null}
      {camera === "unavailable" ? <Muted variant="caption">{L.cameraNone}</Muted> : null}
      <SmButton kind="p" big wide icon="gallery" disabled={busy} onPress={onGallery} testID="story-pick-gallery">
        {L.gallery}
      </SmButton>
      {camera === "unknown" || camera === "denied" ? (
        <SmButton kind="s" big wide icon="camera" disabled={busy} onPress={onCamera} testID="story-pick-camera">
          {camera === "denied" ? L.cameraAsk : L.camera}
        </SmButton>
      ) : null}
      <SmButton kind="s" big wide icon="video" disabled={busy} onPress={onVideo} testID="story-pick-video">
        {V.gallery}
      </SmButton>
      <Muted variant="caption">{V.pickHint}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space3 },
  hero: { gap: space2, padding: space3, borderRadius: tokens.radius.radiusLg, alignItems: "flex-start" },
});
