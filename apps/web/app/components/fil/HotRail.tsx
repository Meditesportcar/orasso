// Le rail « Ça plaît en ce moment » sur le site (lot R8c2, maquette R8.3 `hotRail`) : en tête d'« Abonnements » et d'« Autour de
// moi », des vignettes qui défilent à la souris, au doigt et au clavier (la liste prend le focus, flèches gauche et droite) ;
// chaque vignette ouvre la publication. Jamais dans « Pour toi ».
import { Icon } from "@orasso/design-system/web";
import { type FeedCard, feedScreenLabels as L } from "@orasso/shared";

export function HotRail({
  cards,
  scope,
  scopeLabel,
  onOpen,
}: {
  cards: readonly FeedCard<"feed_post">[];
  scope: "nearby" | "following";
  /** Lot R9h : « chez ceux que <la page> suit · 7 jours » quand on lit en casquette. */
  scopeLabel?: string;
  onOpen?: (card: FeedCard<"feed_post">) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <section className="fil-hot" aria-labelledby="fil-hot-title" data-testid="fil-hot">
      <div className="fil-hot__head">
        <Icon name="fire" size={16} />
        <h2 id="fil-hot-title" className="fil-hot__title">
          {L.hotTitle}
        </h2>
        <span className="o-t-caption fil-hot__scope">{scopeLabel ?? L.hotScope[scope]}</span>
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: la zone défile au clavier (flèches), comme un rail de vignettes. */}
      <ul className="fil-hot__rail" tabIndex={0} aria-label={L.hotTitle} data-testid="fil-hot-rail">
        {cards.map((card) => {
          const post = card.payload.post;
          const photo = post.photos[0];
          return (
            <li key={card.id}>
              <a
                className="fil-hot__tile"
                href={`/app/publication/${post.id}`}
                aria-label={L.hotOpen(post.author.pseudo, post.reactionsCount)}
                onClick={() => onOpen?.(card)}
                data-testid="fil-hot-tile"
              >
                {photo ? <img src={photo.url} alt="" loading="lazy" /> : null}
                <span className="fil-hot__who">{post.author.pseudo}</span>
                <span className="fil-hot__flames">
                  <Icon name="fire" size={13} />
                  {post.reactionsCount}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
