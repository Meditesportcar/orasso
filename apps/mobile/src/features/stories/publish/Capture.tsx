// L'appareil photo de la story (lot R7f3, maquette R7.22 `sf_cam`) : plein écran 9:16, retourner, flash, obturateur, et la
// galerie en bas à gauche. L'appareil de l'appli photographie en 9:16 : rien à recadrer ensuite (`fitStory` recadre au centre
// ce que le capteur rend en 3:4 ou 16:9). Le bouton « Vidéo » est un emplacement réservé au lot R7g (`VideoSlot`). Seulement
// sur téléphone : le navigateur n'a pas cet écran (la galerie, `Pick`, le remplace).
import { Icon, type IconName, Tag, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { storyPublishLabels as L, STORY_H, STORY_W } from "@orasso/shared";
import { CameraView, type FlashMode } from "expo-camera";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PickedPhoto } from "@/lib/photos";
import { VideoSlot } from "./VideoSlot";

const { space2, space3, space4 } = tokens.spacing;

export function Capture({
  onShot,
  onGallery,
  onClose,
  busy,
}: {
  onShot: (photo: PickedPhoto) => void;
  onGallery: () => void;
  onClose: () => void;
  /** Une photo se prépare (recadrage, réduction) : l'obturateur attend. */
  busy: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [taking, setTaking] = useState(false);
  const [failed, setFailed] = useState(false);

  // Le plus grand 9:16 qui tient entre l'en-tête et le bas de l'écran.
  const maxH = win.height - insets.top - insets.bottom - 64;
  const width = Math.min(win.width, Math.floor((maxH * STORY_W) / STORY_H));
  const height = Math.round((width * STORY_H) / STORY_W);

  async function shoot() {
    if (taking || busy || !camera.current) return;
    setTaking(true);
    setFailed(false);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 1 });
      onShot({ uri: picture.uri, width: picture.width, height: picture.height });
    } catch {
      setFailed(true);
    } finally {
      setTaking(false);
    }
  }

  const disabled = taking || busy;
  return (
    <View style={[styles.fill, { backgroundColor: c.night, paddingTop: insets.top }]} testID="story-camera">
      <View style={styles.head}>
        <Text variant="posterM" color={c.nightInk} accessibilityRole="header" style={styles.grow}>
          {L.title}
        </Text>
        <Round icon="close" label={L.close} onPress={onClose} testID="story-camera-close" />
      </View>
      <View style={styles.stageWrap}>
        <View style={[styles.stage, { width, height, borderRadius: tokens.radius.radiusLg }]}>
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing={facing}
            flash={flash}
            mode="picture"
            ratio="16:9"
            accessibilityLabel={L.cameraTitle}
          />
          <View style={styles.top} pointerEvents="box-none">
            <Tag tone="acc">{L.badge916}</Tag>
            <View style={styles.grow} />
            <Round
              icon="spark"
              label={flash === "on" ? L.flashOn : L.flashOff}
              pressed={flash === "on"}
              onPress={() => setFlash(flash === "on" ? "off" : "on")}
              testID="story-camera-flash"
            />
            <Round
              icon="undo"
              label={L.flip}
              onPress={() => setFacing(facing === "back" ? "front" : "back")}
              testID="story-camera-flip"
            />
          </View>
          {failed ? (
            <View style={[styles.failed, { backgroundColor: withAlpha(c.night, 0.78) }]}>
              <Text variant="caption" color={c.nightInk} testID="story-camera-failed">
                {L.cameraFailed}
              </Text>
            </View>
          ) : null}
          <View style={styles.bottom} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={L.gallery}
              onPress={onGallery}
              disabled={disabled}
              style={[styles.gallery, { borderColor: c.nightInk, backgroundColor: withAlpha(c.night, 0.5) }]}
              testID="story-camera-gallery"
            >
              <Icon name="gallery" size={24} color={c.nightInk} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={L.shutter}
              onPress={() => void shoot()}
              disabled={disabled}
              style={[styles.shutter, { borderColor: c.nightInk, opacity: disabled ? 0.5 : 1 }]}
              testID="story-camera-shutter"
            >
              <View style={[styles.shutterCore, { backgroundColor: c.nightInk }]} />
            </Pressable>
            <View style={styles.mode}>
              <Text variant="bodyStrong" color={c.nightInk}>
                {L.modePhoto}
              </Text>
              <VideoSlot mode="photo" />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function Round({
  icon,
  label,
  onPress,
  pressed,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  pressed?: boolean;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: pressed }}
      onPress={onPress}
      hitSlop={6}
      style={[styles.round, { backgroundColor: pressed ? t.color.accent : withAlpha(t.color.night, 0.5) }]}
      testID={testID}
    >
      <Icon name={icon} size={20} color={pressed ? t.color.accentInk : t.color.nightInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: space2, paddingHorizontal: space3, paddingVertical: space2 },
  stageWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  stage: { overflow: "hidden" },
  top: {
    position: "absolute",
    left: space2,
    right: space2,
    top: space2,
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
  },
  bottom: {
    position: "absolute",
    left: space3,
    right: space3,
    bottom: space4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gallery: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, alignItems: "center", justifyContent: "center" },
  shutterCore: { width: 54, height: 54, borderRadius: 27 },
  mode: { width: 56, alignItems: "flex-end", gap: 2 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  failed: {
    position: "absolute",
    left: space2,
    right: space2,
    bottom: 120,
    padding: space2,
    borderRadius: tokens.radius.radiusMd,
  },
});
