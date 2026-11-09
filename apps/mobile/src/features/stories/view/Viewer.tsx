// Le média d'une story, plein écran (maquette R7.7 `.r7svp`). Une photo est déjà le 9:16 complet (1080 x 1920, plaque traitée
// par le serveur : `status ready` seulement) : `cover` sur un écran plus haut, ses bords sont rognés. Le fichier vient de la
// route protégée (`/api/stories/:id/media/:nom`), lu avec le jeton et gardé en mémoire seulement (`CrewPhotoImage`).
//
// Fichier PARTAGÉ avec les lots suivants (une ligne chacun) : la branche vidéo (lot R7g) renvoie `VideoSlide`.
import { storyViewerLabels as L, type StoryView } from "@orasso/shared";
import type { SharedValue } from "react-native-reanimated";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { VideoSlide } from "./VideoSlide";

export function Viewer({
  story,
  authorName,
  width,
  height,
  onLoaded,
  onFailed,
  onLoading,
  running,
  progress,
  onTime,
  onEnded,
}: {
  story: StoryView;
  authorName: string;
  width: number;
  height: number;
  onLoaded: () => void;
  onFailed: (status: number) => void;
  onLoading: () => void;
  /** Vidéo seulement (lot R7g) : lecture en marche, barre de progression, seconde atteinte, fin de la vidéo. */
  running: boolean;
  progress: SharedValue<number>;
  onTime: (seconds: number) => void;
  onEnded: () => void;
}) {
  if (story.mediaKind === "video") {
    return (
      <VideoSlide
        story={story}
        width={width}
        height={height}
        running={running}
        progress={progress}
        onLoaded={onLoaded}
        onFailed={onFailed}
        onLoading={onLoading}
        onTime={onTime}
        onEnded={onEnded}
      />
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
