// La mosaïque d'un album (lot R9e, maquette R9.5 `mosH`) : jusqu'à quatre photos, la première en grand, les autres en colonne. Les photos
// viennent d'une route protégée (`/api/albums/:id/photos/:nom`) : le navigateur envoie le cookie de session.
import type { AlbumPhotoView } from "@orasso/shared";

import "../../styles/albums.css";

export function AlbumCover({
  photos,
  label,
  className = "",
  testId = "album-cover",
}: {
  photos: readonly AlbumPhotoView[];
  label?: string;
  className?: string;
  testId?: string;
}) {
  const [first, ...rest] = photos.slice(0, 4);
  return (
    <div className={`alb-cover ${className}`.trim()} role="img" aria-label={label} data-testid={testId}>
      <div className="alb-cover__big">
        {first ? <img src={first.url} alt="" loading="lazy" decoding="async" /> : null}
      </div>
      {rest.length > 0 ? (
        <div className="alb-cover__col">
          {rest.map((p) => (
            <div key={p.id} className="alb-cover__small">
              <img src={p.url} alt="" loading="lazy" decoding="async" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
