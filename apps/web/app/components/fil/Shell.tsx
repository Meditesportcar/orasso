// La coque d'une carte du Fil sur le site (maquette R7.6 `.r7c`) : en-tête (rond, titre, raison, « ⋯ »), contenu, actions.
import "../../styles/pro-offers.css";
import { Icon } from "@orasso/design-system/web";
import { type FeedCard, type FeedCardKind, feedAgo, feedScreenLabels as L } from "@orasso/shared";
import { Link } from "react-router";

export type CardProps<K extends FeedCardKind = FeedCardKind> = {
  card: FeedCard<K>;
  onMenu: (card: FeedCard) => void;
  faded: boolean;
  /** Une carte que l'API refuse d'afficher (publicité arrêtée, plafond atteint) sort de la liste. */
  onRemoved?: (card: FeedCard) => void;
  /** Le compte affiché : le comptage d'une publicité est par compte (lot R7k2, tour 2). */
  userId?: string;
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
  titleNode,
  reasonText,
  href,
  onTitle,
  clientNav,
  tag,
  onMenu,
  faded,
  banner,
  headTag,
  children,
  actions,
}: {
  card: FeedCard;
  head: React.ReactNode;
  title: string;
  /** Le titre composé par la carte (R8o : la signature à deux noms, chacun son lien) ; `title` reste le nom accessible. */
  titleNode?: React.ReactNode;
  /** La petite ligne sous le titre à la place de la raison du Fil (R8o : « Collaboration · il y a 1 h »). */
  reasonText?: string;
  href?: string;
  /** Appelé au clic sur le titre (la carte « Sponsorisé » compte le clic vers la fiche du pro). */
  onTitle?: () => void;
  /** Le titre s'ouvre par une navigation côté client (la page n'est pas rechargée : un envoi différé aboutit). */
  clientNav?: boolean;
  /** Une étiquette en contour à la place de la ligne de raison (carte « Sponsorisé » : toujours visible). */
  tag?: string;
  onMenu: (card: FeedCard) => void;
  faded: boolean;
  /** Bandeau en tête de la carte, avant l'en-tête (« Collaboration commerciale », lot R7m2). */
  banner?: React.ReactNode;
  /** Une étiquette à droite du nom, dans l'en-tête (R9c : « Offre »). Absente : l'en-tête ne change pas. */
  headTag?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const moreButton = (
    <button
      type="button"
      className="fil-card__more"
      aria-label={L.moreFor(title)}
      onClick={() => onMenu(card)}
      data-testid="feed-card-more"
    >
      <Icon name="more" size={20} />
    </button>
  );
  return (
    <article className={faded ? "fil-card is-faded" : "fil-card"} data-testid={`feed-card-${card.kind}`}>
      {banner}
      <header className="fil-card__head">
        {head}
        <div className="fil-card__titles">
          {titleNode ? (
            titleNode
          ) : href && clientNav ? (
            <Link className="fil-card__title o-t-strong" to={href} onClick={onTitle}>
              {title}
            </Link>
          ) : href ? (
            <a className="fil-card__title o-t-strong" href={href} onClick={onTitle}>
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
              {reasonText ?? reasonLine(card)}
            </span>
          )}
        </div>
        {headTag ? (
          <div className="po-end">
            {headTag}
            {moreButton}
          </div>
        ) : (
          moreButton
        )}
      </header>
      {children ? <div className="fil-card__body">{children}</div> : null}
      {actions ? <div className="fil-card__actions">{actions}</div> : null}
    </article>
  );
}
