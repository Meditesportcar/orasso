// La grille de deux (trois colonnes au-delà de 900 px) : photo en 4:5, dessous la date puis le lieu ; **aucune pastille**. Toucher
// une vignette ouvre la publication seule. Les images ne se chargent que près de l'écran (`loading="lazy"` du navigateur).
import { Icon } from "@orasso/design-system/web";
import { type FeedPostView, publicationsLabels as L, publicationPath, tileMeta, withLabel } from "@orasso/shared";

import "../../styles/coauthors.css";

export function PublicationsGrid({ posts, authorKey }: { posts: readonly FeedPostView[]; authorKey?: string }) {
  const now = new Date();
  return (
    <div className="pub-grid" data-testid="publications-grid">
      {posts.map((post) => {
        const meta = tileMeta(post, now);
        const photo = post.photos[0];
        // Collaboration (R8o) : sur le profil de l'un, « Avec <l'autre> ».
        const withName = authorKey ? withLabel(authorKey, post) : null;
        return (
          <div key={post.id} className="pub-tile" data-testid="publication-tile">
            <a
              className="pub-tile__photo"
              href={publicationPath(post.id, { web: true })}
              aria-label={`${L.openPost}, ${L.tileLabel(meta.date, meta.place)}${withName ? `, ${withName}` : ""}`}
              data-testid="publication-tile-open"
            >
              {photo ? (
                <img src={photo.url} alt="" width={photo.width} height={photo.height} loading="lazy" decoding="async" />
              ) : null}
              {withName ? (
                <span className="co-pin" data-testid="publication-tile-with">
                  <Icon name="crew" size={12} />
                  {withName}
                </span>
              ) : null}
            </a>
            <div className="pub-tile__caption">
              <b data-testid="publication-tile-date">{meta.date}</b>
              {meta.place ? (
                <span data-testid="publication-tile-place">
                  <Icon name="place" size={12} />
                  {meta.place}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
