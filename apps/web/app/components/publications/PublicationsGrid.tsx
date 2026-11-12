// La grille de deux (trois colonnes au-delà de 900 px) : photo en 4:5, dessous la date puis le lieu ; **aucune pastille**. Toucher
// une vignette ouvre la publication seule. Les images ne se chargent que près de l'écran (`loading="lazy"` du navigateur).
import { Icon } from "@orasso/design-system/web";
import {
  eventJournalLabels,
  type FeedPostView,
  publicationsLabels as L,
  publicationPath,
  tileMeta,
  withLabel,
} from "@orasso/shared";

import "../../styles/coauthors.css";
import { JournalBadges, type JournalOptions } from "../event-journal/JournalBadges";

export function PublicationsGrid({
  posts,
  authorKey,
  journal,
}: {
  posts: readonly FeedPostView[];
  /** La clé du profil regardé : « Avec <l'autre> » d'une publication co-signée (R8o). */
  authorKey?: string;
  /** Lot R8d (journal d'un événement) : étiquettes, menu « … » de l'organisateur, vignettes sans lien (sans session). */
  journal?: JournalOptions;
}) {
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
            {journal?.readOnly ? (
              <div
                className="pub-tile__photo"
                data-testid="publication-tile-open"
                role="img"
                aria-label={L.tileLabel(meta.date, meta.place)}
              >
                {photo ? (
                  <img
                    src={photo.url}
                    alt=""
                    width={photo.width}
                    height={photo.height}
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
              </div>
            ) : (
              <a
                className="pub-tile__photo"
                href={publicationPath(post.id, { web: true })}
                aria-label={`${L.openPost}, ${L.tileLabel(meta.date, meta.place)}${withName ? `, ${withName}` : ""}`}
                data-testid="publication-tile-open"
              >
                {photo ? (
                  <img
                    src={photo.url}
                    alt=""
                    width={photo.width}
                    height={photo.height}
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
                {withName ? (
                  <span className="co-pin" data-testid="publication-tile-with">
                    <Icon name="crew" size={12} />
                    {withName}
                  </span>
                ) : null}
              </a>
            )}
            {journal ? <JournalBadges post={post} floating /> : null}
            {journal?.onMenu ? (
              <button
                type="button"
                className="evj-dots"
                aria-label={eventJournalLabels.menuOpen}
                onClick={() => journal.onMenu?.(post)}
                data-testid="journal-tile-menu"
              >
                <Icon name="more" size={18} />
              </button>
            ) : null}
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
