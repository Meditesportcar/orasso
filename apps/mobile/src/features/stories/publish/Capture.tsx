// L'appareil de la story (lot R7f3, maquette R7.22 `sf_cam` ; la vidéo vient avec le lot R7g) : plein écran 9:16, retourner,
// flash, obturateur, et la galerie en bas à gauche. L'appareil de l'appli photographie en 9:16 : rien à recadrer ensuite
// (`fitStory` recadre au centre ce que le capteur rend en 3:4 ou 16:9). Le bouton « Vidéo » bascule l'appareil en prise de
// vue : 720p, environ 3,5 Mb/s (la vidéo sort déjà compressée), 30 s au plus avec un compteur et un arrêt automatique, le son
// est enregistré (micro demandé à ce moment-là seulement). Seulement sur téléphone : le navigateur n'a pas cet écran (la
// galerie, `Pick`, le remplace).
import { Icon, type IconName, Tag, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import {
  clock,
  storyPublishLabels as L,
  STORY_H,
  STORY_VIDEO_BITRATE,
  STORY_VIDEO_MAX_MS,
  STORY_W,
  storyVideoLabels as V,
} from "@orasso/shared";
import { CameraView, type FlashMode, useMicrophonePermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PickedPhoto } from "@/lib/photos";
import { noteRawShot } from "./shotFiles";

const { space2, space3, space4 } = tokens.spacing;

export type CaptureMode = "photo" | "video";

export function Capture({
  onShot,
  onVideo,
  onGallery,
  onClose,
  busy,
}: {
  onShot: (photo: PickedPhoto) => void;
  /** Une vidéo vient d'être filmée (fichier brut, à compresser et vérifier par l'écran parent). */
  onVideo: (uri: string) => void;
  onGallery: (mode: CaptureMode) => void;
  onClose: () => void;
  /** Un média se prépare (recadrage, réduction, compression) : l'obturateur attend. */
  busy: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [mode, setMode] = useState<CaptureMode>("photo");
  const [taking, setTaking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micPermission, requestMic] = useMicrophonePermissions();
  // L'écran est quitté pendant la prise : la photo brute qui arrive ensuite n'est jamais gardée.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Quitter pendant la prise la coupe : le fichier ne servira pas, l'appareil se libère.
      camera.current?.stopRecording();
    };
  }, []);

  // Le compteur de la prise de vue : un tic toutes les 250 ms (JS : un simple texte, aucune animation).
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.min(STORY_VIDEO_MAX_MS, Date.now() - started)), 250);
    return () => clearInterval(timer);
  }, [recording]);

  // Le plus grand 9:16 qui tient entre l'en-tête et le bas de l'écran.
  const maxH = win.height - insets.top - insets.bottom - 64;
  const width = Math.min(win.width, Math.floor((maxH * STORY_W) / STORY_H));
  const height = Math.round((width * STORY_H) / STORY_W);

  async function shoot() {
    if (taking || busy || !camera.current) return;
    setTaking(true);
    setFailed(null);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 1 });
      // La photo brute de l'appareil (non recadrée, non floutée) est notée tout de suite : effacée au départ de l'écran.
      if (!noteRawShot(picture.uri, () => mounted.current)) return;
      onShot({ uri: picture.uri, width: picture.width, height: picture.height });
    } catch {
      setFailed(L.cameraFailed);
    } finally {
      setTaking(false);
    }
  }

  /** Vidéo : un toucher démarre, un second arrête ; à 30 s la prise s'arrête seule. */
  async function film() {
    if (busy || !camera.current) return;
    if (recording) {
      camera.current.stopRecording();
      return;
    }
    setFailed(null);
    setRecording(true);
    try {
      const video = await camera.current.recordAsync({ maxDuration: STORY_VIDEO_MAX_MS / 1000 });
      // La prise brute (non compressée) est notée par l'écran parent ; une prise abandonnée avec l'écran n'est jamais envoyée.
      if (video?.uri && mounted.current) onVideo(video.uri);
    } catch {
      if (mounted.current) setFailed(V.recordFailed);
    } finally {
      if (mounted.current) setRecording(false);
    }
  }

  async function chooseMode(next: CaptureMode) {
    if (recording || taking || next === mode) return;
    setFailed(null);
    if (next === "video" && !micPermission?.granted) {
      const asked = await requestMic();
      // Sans micro, la vidéo se filmerait muette sans qu'on le sache : on dit pourquoi et on reste en photo.
      if (!asked.granted) return setFailed(V.recordDenied);
    }
    setMode(next);
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
            enableTorch={mode === "video" && flash === "on"}
            mode={mode === "video" ? "video" : "picture"}
            videoQuality="720p"
            videoBitrate={STORY_VIDEO_BITRATE}
            ratio="16:9"
            accessibilityLabel={L.cameraTitle}
          />
          <View style={styles.top} pointerEvents="box-none">
            <Tag tone="acc">{L.badge916}</Tag>
            {recording ? (
              <Tag tone="acc" testID="story-camera-timer">
                {`${clock(elapsed)} / ${clock(STORY_VIDEO_MAX_MS)}`}
              </Tag>
            ) : null}
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
                {failed}
              </Text>
            </View>
          ) : null}
          <View style={styles.bottom} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mode === "video" ? V.gallery : L.gallery}
              onPress={() => onGallery(mode)}
              disabled={disabled || recording}
              style={[styles.gallery, { borderColor: c.nightInk, backgroundColor: withAlpha(c.night, 0.5) }]}
              testID="story-camera-gallery"
            >
              <Icon name="gallery" size={24} color={c.nightInk} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mode === "video" ? (recording ? V.stop : V.record) : L.shutter}
              onPress={() => void (mode === "video" ? film() : shoot())}
              disabled={disabled && !recording}
              style={[styles.shutter, { borderColor: c.nightInk, opacity: disabled && !recording ? 0.5 : 1 }]}
              testID={mode === "video" ? "story-camera-record" : "story-camera-shutter"}
            >
              <View
                style={[
                  styles.shutterCore,
                  { backgroundColor: mode === "video" ? c.accent : c.nightInk },
                  recording && styles.shutterStop,
                ]}
              />
            </Pressable>
            <View style={styles.mode}>
              <ModeButton
                icon="camera"
                label={L.modePhoto}
                on={mode === "photo"}
                onPress={() => void chooseMode("photo")}
                testID="story-camera-mode-photo"
              />
              <ModeButton
                icon="video"
                label={V.mode}
                on={mode === "video"}
                onPress={() => void chooseMode("video")}
                testID="story-camera-mode-video"
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/** « Photo » / « Vidéo » : le mode actif est plein, l'autre se touche pour basculer. */
function ModeButton({
  icon,
  label,
  on,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  on: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      hitSlop={6}
      style={styles.modeButton}
      testID={testID}
    >
      <Icon name={icon} size={16} color={on ? c.accent : c.nightInk} />
      <Text variant="bodyStrong" color={on ? c.accent : c.nightInk} style={on ? null : styles.dim}>
        {label}
      </Text>
    </Pressable>
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
  shutterStop: { width: 30, height: 30, borderRadius: 6 },
  mode: { width: 84, alignItems: "flex-start", gap: 2 },
  modeButton: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 28 },
  dim: { opacity: 0.8 },
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
