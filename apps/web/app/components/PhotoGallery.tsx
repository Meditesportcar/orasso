// Galerie de photos d'un contenu média, partagée par la fiche événement (lot 56) et la fiche média (lot 57) : la grille
// montre toutes les photos ; un clic ouvre la visionneuse (fenêtre modale, précédent / suivant, flèches du clavier,
// Échap pour fermer). Sans script, les vignettes restent des liens vers la photo.
// Avec `contentId` (fiche événement), l'ouverture compte une consultation du contenu, comme l'appli.
import { Button } from "@orasso/design-system/web";
import { mediaAppLabels as L } from "@orasso/shared";
import { useRef, useState } from "react";

import "../styles/media.css";

export type GalleryPhotoView = { key: string; url: string };

export function PhotoGallery({
  photos,
  title,
  contentId,
}: {
  photos: readonly GalleryPhotoView[];
  /** Titre du contenu, affiché en tête de la visionneuse. */
  title?: string;
  /** Identifiant du contenu média : l'ouverture de la galerie compte une consultation. */
  contentId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const counted = useRef<"idle" | "pending" | "done">("idle");
  const total = photos.length;

  const countView = () => {
    // Une consultation par ouverture de page ; l'API déduplique par session et par heure et ignore le média lui-même.
    if (!contentId || counted.current !== "idle") return;
    counted.current = "pending";
    fetch(`/api/media-contents/${encodeURIComponent(contentId)}/view`, {
      method: "POST",
      credentials: "same-origin",
    })
      .then((r) => {
        // Confirmée seulement sur une réponse réussie : après une coupure ou un 503, la réouverture réessaie.
        counted.current = r.ok ? "done" : "idle";
      })
      .catch(() => {
        counted.current = "idle";
      });
  };
  const open = (i: number) => {
    setIndex(i);
    countView();
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
      <ul className="md-thumbs" data-testid="media-gallery">
        {photos.map((p, i) => (
          <li key={p.key}>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="md-thumb"
              aria-label={L.galleryOpenPhoto(i + 1, total)}
              onClick={(e) => {
                e.preventDefault();
                open(i);
              }}
              data-testid="media-gallery-photo"
            >
              <img src={p.url} alt="" loading="lazy" decoding="async" />
            </a>
          </li>
        ))}
      </ul>
      <dialog
        ref={ref}
        className="md-viewer"
        aria-label={title ?? L.galleryViewer}
        onClose={() => setIndex(null)}
        onKeyDown={onKeyDown}
        data-testid="media-gallery-viewer"
      >
        {current && (
          <div className="md-viewer__body">
            {title && <h2 className="o-t-poster-s o-never-truncate">{title}</h2>}
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
