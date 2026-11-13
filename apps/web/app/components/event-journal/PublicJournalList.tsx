// Le journal d'un événement **sans session** (T4) : une lecture complète, sans interaction. Chaque publication montre son visuel,
// sa légende **entière** (une annonce reprise en publication ne se lit que là), sa date et son lieu, avec ses étiquettes ; ni flamme,
// ni commentaires, ni menu, ni lien (la page d'une publication seule exige une session).
import { Icon } from "@orasso/design-system/web";
import { creditLine, type FeedPostView, publicationsLabels as L, tileMeta } from "@orasso/shared";

import { JournalBadges } from "./JournalBadges";

export function PublicJournalList({ posts }: { posts: readonly FeedPostView[] }) {
  const now = new Date();
  return (
    <div className="evj-public" data-testid="journal-public-list">
      {posts.map((post) => {
        const meta = tileMeta(post, now);
        const photo = post.photos[0];
        return (
          <article key={post.id} className="evj-public__item" data-testid="journal-public-item">
            <JournalBadges post={post} />
            {photo ? (
              <img src={photo.url} alt="" width={photo.width} height={photo.height} loading="lazy" decoding="async" />
            ) : null}
            {post.caption ? (
              <p className="s-prewrap" data-testid="journal-public-caption">
                {post.caption}
              </p>
            ) : null}
            <small className="s-muted">
              {meta.date}
              {meta.place ? (
                <>
                  {" · "}
                  <Icon name="place" size={12} />
                  {meta.place}
                </>
              ) : null}
              {creditLine(photo?.credit) ? (
                <>
                  {" · "}
                  <span data-testid="journal-public-credit">{creditLine(photo?.credit)}</span>
                </>
              ) : null}
            </small>
            <span hidden>{L.tileLabel(meta.date, meta.place)}</span>
          </article>
        );
      })}
    </div>
  );
}
