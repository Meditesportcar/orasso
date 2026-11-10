// La vidéo d'une story sur le site (lot R7g, maquette R7.7 `sk_video`) : une balise `<video playsInline>`, sans contrôles du
// navigateur, muette par défaut (un navigateur n'accepte pas de lancer un son sans geste) ; le bouton du son est dans
// `VideoBar`. Lue par la route protégée (cookie de session, `Range` géré par l'API). Pleine si elle est en 9:16 ; sinon
// posée au centre sur sa vignette floutée **à l'affichage** (le fichier n'est jamais modifié). Pause et reprise suivent
// `running` (appui long, menu, onglet masqué…) ; la barre de la visionneuse suit `currentTime / duration` ; la fin de la
// vidéo passe à la story suivante. Mouvement réduit : la vidéo joue quand même.
import { type StoryView, storyVideoLayout, videoProgress } from "@orasso/shared";
import { useEffect, useRef } from "react";

export function VideoSlide({
  story,
  running,
  muted,
  onLoaded,
  onError,
  onProgress,
  onEnded,
}: {
  story: StoryView;
  /** La lecture avance (sinon pause, à la même place). */
  running: boolean;
  muted: boolean;
  /** La première image est prête : la visionneuse peut compter la vue et lancer la lecture. */
  onLoaded: () => void;
  onError: () => void;
  /** Part jouée (0 à 1) et seconde entière atteinte. */
  onProgress: (ratio: number, seconds: number) => void;
  onEnded: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const layout = storyVideoLayout(story.width, story.height);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.muted = muted;
  }, [muted]);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (running) {
      // Une lecture refusée par le navigateur (rare : la vidéo est muette) n'est pas une panne : « Réessayer » reste au toucher.
      void el.play().catch(() => undefined);
    } else el.pause();
  }, [running]);

  return (
    <div className="story-video" data-layout={layout} data-testid="story-video">
      {story.posterUrl && layout === "blurred" ? (
        <img
          className="story-video__back"
          src={story.posterUrl}
          alt=""
          draggable={false}
          data-testid="story-video-poster"
        />
      ) : null}
      <video
        ref={video}
        className="story-video__media"
        src={story.mediaUrl}
        poster={story.posterUrl ?? undefined}
        playsInline
        muted={muted}
        preload="auto"
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        onLoadedData={onLoaded}
        onError={onError}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          const length = el.duration > 0 && Number.isFinite(el.duration) ? el.duration : (story.durationMs ?? 0) / 1000;
          onProgress(videoProgress(el.currentTime, length), Math.floor(el.currentTime));
        }}
        onEnded={onEnded}
        data-testid="story-media"
      />
    </div>
  );
}
