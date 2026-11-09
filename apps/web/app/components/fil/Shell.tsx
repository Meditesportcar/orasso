// La coque d'une carte du Fil sur le site (maquette R7.6 `.r7c`) : en-tête (rond, titre, raison, « ⋯ »), contenu, actions.
import { Icon } from "@orasso/design-system/web";
import { type FeedCard, type FeedCardKind, feedAgo, feedScreenLabels as L } from "@orasso/shared";

export type CardProps<K extends FeedCardKind = FeedCardKind> = {
  card: FeedCard<K>;
  onMenu: (card: FeedCard) => void;
  faded: boolean;
  /** Une carte que l'API refuse d'afficher (publicité arrêtée, plafond atteint) sort de la liste. */
  onRemoved?: (card: FeedCard) => void;
};

export const reasonLine = (card: FeedCard) => `${card.reason.label} · ${feedAgo(card.at, new Date())}`;

export function OrgLogo({ url, name }: { url: string | null; name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className="fil-logo" aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span>{initials}</span>}
    </span>
  );
}

export function Shell({
  card,
  head,
  title,
  href,
  tag,
  onMenu,
  faded,
  children,
  actions,
}: {
  card: FeedCard;
  head: React.ReactNode;
  title: string;
  href?: string;
  /** Une étiquette en contour à la place de la ligne de raison (carte « Sponsorisé » : toujours visible). */
  tag?: string;
  onMenu: (card: FeedCard) => void;
  faded: boolean;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <article className={faded ? "fil-card is-faded" : "fil-card"} data-testid={`feed-card-${card.kind}`}>
      <header className="fil-card__head">
        {head}
        <div className="fil-card__titles">
          {href ? (
            <a className="fil-card__title o-t-strong" href={href}>
              {title}
            </a>
          ) : (
            <span className="fil-card__title o-t-strong">{title}</span>
          )}
          {tag ? (
            <span className="fil-card__reason" data-testid="feed-card-reason">
              <span className="fil-tag" data-testid="feed-sponsored-tag">
                <span>{tag}</span>
              </span>
            </span>
          ) : (
            <span className="o-t-caption fil-card__reason" data-testid="feed-card-reason">
              {reasonLine(card)}
            </span>
          )}
        </div>
        <button
          type="button"
          className="fil-card__more"
          aria-label={L.moreFor(title)}
          onClick={() => onMenu(card)}
          data-testid="feed-card-more"
        >
          <Icon name="more" size={20} />
        </button>
      </header>
      {children ? <div className="fil-card__body">{children}</div> : null}
      {actions ? <div className="fil-card__actions">{actions}</div> : null}
    </article>
  );
}
