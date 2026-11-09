// La vidéo d'une story, plein écran (lot R7g, maquette R7.7 `sk_video`) : `expo-video` (seul lecteur maintenu d'Expo), sans
// contrôles natifs ni image dans l'image. Pleine si elle est en 9:16 ; sinon posée au centre sur sa vignette floutée (**à
// l'affichage** : le fichier n'est jamais modifié). La barre du haut suit `currentTime / duration` (valeur partagée écrite
// depuis les événements du lecteur : aucun travail pendant que la barre se dessine) ; la fin de la vidéo passe à la story
// suivante. Pause et reprise suivent `running` (appui long, feuille ouverte, écran quitté…) ; le son suit `videoSession`.
// Une seule vidéo vit à la fois : la visionneuse ne monte que la story courante. Mouvement réduit : la vidéo joue quand même.
import { tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { type StoryView, storyVideoLayout, videoProgress } from "@orasso/shared";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { Image, type ImageStyle, Platform, StyleSheet, View } from "react-native";
import { type SharedValue, withTiming } from "react-native-reanimated";

import { loadPoster, openStoryVideo } from "@/lib/protectedMedia";
import { useVideoMuted } from "./videoSession";

/** Un fond flou : `blurRadius` sur téléphone, le filtre CSS dans le navigateur (où `blurRadius` n'existe pas). */
const WEB_BLUR = Platform.OS === "web" ? ({ filter: "blur(28px)" } as unknown as ImageStyle) : null;

export function VideoSlide({
  story,
  width,
  height,
  running,
  progress,
  onLoaded,
  onFailed,
  onLoading,
  onTime,
  onEnded,
}: {
  story: StoryView;
  width: number;
  height: number;
  /** La lecture avance (sinon pause, à la même place). */
  running: boolean;
  /** La barre de progression de la visionneuse (0 à 1). */
  progress: SharedValue<number>;
  onLoaded: () => void;
  onFailed: (status: number) => void;
  onLoading: () => void;
  /** Seconde entière atteinte (le compteur « 0:07 / 0:24 »). */
  onTime: (seconds: number) => void;
  onEnded: () => void;
}) {
  const { t } = useTheme();
  const muted = useVideoMuted();
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const [poster, setPoster] = useState<string | null>(null);
  const events = useRef({ onLoaded, onFailed, onLoading, onTime, onEnded });
  events.current = { onLoaded, onFailed, onLoading, onTime, onEnded };

  // La vignette d'abord (affichée pendant le chargement et en fond d'une vidéo qui n'est pas en 9:16).
  useEffect(() => {
    let alive = true;
    setPoster(null);
    void loadPoster(story.posterUrl).then((data) => alive && setPoster(data));
    return () => {
      alive = false;
    };
  }, [story.posterUrl]);

  // La vidéo : sonde (403 et 404 = plus disponible), puis la source du lecteur.
  useEffect(() => {
    const controller = new AbortController();
    let release: (() => void) | null = null;
    setSource(null);
    events.current.onLoading();
    void openStoryVideo(story.mediaUrl, controller.signal).then((res) => {
      if (controller.signal.aborted) {
        if (res.ok) res.release();
        return;
      }
      if (!res.ok) return events.current.onFailed(res.status);
      release = res.release;
      setSource(res.source);
    });
    return () => {
      controller.abort();
      release?.();
    };
  }, [story.mediaUrl]);

  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
    p.keepScreenOnWhilePlaying = true;
  });
  const total = (story.durationMs ?? 0) / 1000;

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    const status = player.addListener("statusChange", ({ status: s }) => {
      if (s === "readyToPlay") events.current.onLoaded();
      else if (s === "error") events.current.onFailed(0);
    });
    let shown = -1;
    const time = player.addListener("timeUpdate", ({ currentTime }) => {
      const length = player.duration > 0 ? player.duration : total;
      progress.value = withTiming(videoProgress(currentTime, length), { duration: 110 });
      const second = Math.floor(currentTime);
      if (second !== shown) {
        shown = second;
        events.current.onTime(second);
      }
    });
    const end = player.addListener("playToEnd", () => {
      progress.value = 1;
      events.current.onEnded();
    });
    return () => {
      status.remove();
      time.remove();
      end.remove();
    };
  }, [player, progress, total]);

  // Pause et reprise : la lecture ne part qu'une fois la vidéo prête (la visionneuse passe `running` quand `onLoaded` a eu lieu).
  useEffect(() => {
    if (!source) return;
    if (running) player.play();
    else player.pause();
  }, [player, source, running]);

  const layout = storyVideoLayout(story.width, story.height);
  return (
    <View style={[styles.fill, { width, height, backgroundColor: t.color.night }]} testID="story-video">
      {poster ? (
        <>
          <Image
            source={{ uri: poster }}
            blurRadius={layout === "full" ? 0 : 40}
            resizeMode="cover"
            style={[
              StyleSheet.absoluteFill,
              layout === "full" ? null : styles.back,
              layout === "full" ? null : WEB_BLUR,
            ]}
            accessibilityIgnoresInvertColors
            testID="story-video-poster"
          />
          {layout === "full" ? null : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(t.color.night, 0.2) }]} />
          )}
        </>
      ) : null}
      {source ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit={layout === "full" ? "cover" : "contain"}
          nativeControls={false}
          allowsPictureInPicture={false}
          testID="story-video-view"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { overflow: "hidden" },
  back: { transform: [{ scale: 1.12 }] },
});
