// Galerie de photos d'un contenu média (lot 57, relecture) : la grille montre toutes les photos ; un clic ouvre la
// visionneuse (fenêtre modale, précédent / suivant, flèches du clavier, Échap pour fermer). Sans script, les photos
// restent visibles dans la grille.
import { Button } from "@orasso/design-system/web";
import { mediaAppLabels as L } from "@orasso/shared";
import { useRef, useState } from "react";

import "../styles/media.css";

export type GalleryPhotoView = { key: string; url: string };

export function PhotoGallery({ photos }: { photos: readonly GalleryPhotoView[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const total = photos.length;

  const open = (i: number) => {
    setIndex(i);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();
  const go = (delta: number) => setIndex((i) => (i === null ? i : (i + delta + total) % total));

  // Flèches du clavier dans la visionneuse (la fenêtre modale a le focus) ; Échap ferme déjà la fenêtre.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
  };
  const current = index === null ? null : photos[index];
  return (
    <>
      <ul className="md-thumbs" data-testid="media-gallery-grid">
        {photos.map((p, i) => (
          <li key={p.key}>
            <button
              type="button"
              className="md-thumb"
              aria-label={L.galleryOpenPhoto(i + 1, total)}
              onClick={() => open(i)}
              data-testid="media-gallery-photo"
            >
              <img src={p.url} alt="" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={ref}
        className="md-viewer"
        aria-label={L.galleryViewer}
        onClose={() => setIndex(null)}
        onKeyDown={onKeyDown}
        data-testid="media-gallery-viewer"
      >
        {current && (
          <div className="md-viewer__body">
            <img className="md-viewer__img" src={current.url} alt="" data-testid="media-gallery-current" />
            <div className="md-viewer__bar">
              <Button type="button" variant="secondary" icon="back" onClick={() => go(-1)} disabled={total < 2}>
                {L.galleryPrev}
              </Button>
              <span className="o-t-caption" aria-live="polite" data-testid="media-gallery-position">
                {L.galleryPosition((index ?? 0) + 1, total)}
              </span>
              <Button type="button" variant="secondary" icon="next" onClick={() => go(1)} disabled={total < 2}>
                {L.galleryNext}
              </Button>
              <Button variant="close" label={L.galleryClose} onClick={close} />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
