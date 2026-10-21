// Galerie de photos d'un contenu média (page d'un événement) : une grille de vignettes, et une visionneuse (feuille
// modale) qui ouvre la photo choisie, avec précédente / suivante. Sans JavaScript les vignettes restent des liens.
import { Button } from "@orasso/design-system/web";
import { useRef, useState } from "react";

export function EventPhotoGallery({
  contentId,
  title,
  photos,
}: {
  /** Identifiant du contenu média : l'ouverture de la galerie compte une consultation (comme l'appli). */
  contentId: string;
  title: string;
  photos: { key: string; url: string }[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const counted = useRef<"idle" | "pending" | "done">("idle");
  const open = (i: number) => {
    setIndex(i);
    // Une consultation par ouverture de page ; l'API déduplique par session et par heure et ignore le média lui-même.
    if (counted.current === "idle") {
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
    }
    dialog.current?.showModal();
  };
  const current = photos[index];
  return (
    <>
      <ul className="w-gallery" data-testid="media-gallery">
        {photos.map((p, i) => (
          <li key={p.key}>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${title} · photo ${i + 1} sur ${photos.length}`}
              onClick={(e) => {
                e.preventDefault();
                open(i);
              }}
            >
              <img src={p.url} alt="" loading="lazy" decoding="async" />
            </a>
          </li>
        ))}
      </ul>
      <dialog ref={dialog} className="w-dialog w-dialog--photo" aria-label={title} data-testid="gallery-viewer">
        <div className="w-dialog__head">
          <h2 className="o-t-poster-s o-never-truncate">{title}</h2>
          <Button variant="close" label="Fermer" icon="close" onClick={() => dialog.current?.close()} />
        </div>
        {current && <img className="w-gallery__big" src={current.url} alt="" />}
        {photos.length > 1 && (
          <div className="w-gallery__nav">
            <Button
              variant="secondary"
              icon="back"
              onClick={() => setIndex((i) => (i + photos.length - 1) % photos.length)}
            >
              Précédente
            </Button>
            <span className="o-t-meta">
              {index + 1} / {photos.length}
            </span>
            <Button variant="secondary" icon="next" onClick={() => setIndex((i) => (i + 1) % photos.length)}>
              Suivante
            </Button>
          </div>
        )}
      </dialog>
    </>
  );
}
