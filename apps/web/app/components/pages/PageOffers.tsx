// L'onglet « Offres » de la fiche d'un pro, sur le site (lot R9c, maquette R9.3 `n-page`, cas `off`) : l'en-tête « N offres en
// cours » (et, pour le propriétaire, « Publier une offre »), une ligne par offre non terminée (vignette, étiquette, titre qui passe à
// la ligne, légende sur deux lignes, dates) qui ouvre la publication, « Pas d'offre en cours. » sans offre, puis « Anciennes
// offres » (les `pro_posts` d'avant, déplacées ici et non dupliquées : réservées aux abonnés). Lu dans le navigateur
// (`GET /authors/p:<fiche>/feed-posts?filter=offer`, cookie de session), page par page. Une panne n'est jamais « Pas d'offre ».
import { Button, Icon, OLoader } from "@orasso/design-system/web";
import {
  type AuthorPostsPage,
  type FeedPostView,
  offerDatesLabel,
  PRO_POSTS_PER_MONTH,
  type ProPublic,
  publicationPath,
  proOffersLabels as T,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import "../../styles/pages.css";
import "../../styles/pro-offers.css";
import { apiFetch } from "../../lib/api.client";

type State = { items: FeedPostView[]; next: string | null; loading: boolean; loaded: boolean; error: boolean };

const merge = (list: FeedPostView[], page: FeedPostView[]) => {
  const seen = new Set(list.map((p) => p.id));
  return [...list, ...page.filter((p) => !seen.has(p.id))];
};

const pathOf = (key: string, cursor: string | null) => {
  const q = new URLSearchParams({ filter: "offer" });
  if (cursor) q.set("cursor", cursor);
  return `/authors/${encodeURIComponent(key)}/feed-posts?${q.toString()}`;
};

/** Les offres non terminées d'une fiche, page par page. */
export function useOffers(authorKey: string) {
  const [state, setState] = useState<State>({ items: [], next: null, loading: true, loaded: false, error: false });
  const cursor = useRef<string | null>(null);
  const seq = useRef(0);
  const read = useCallback(
    async (first: boolean) => {
      const mine = first ? ++seq.current : seq.current;
      setState((s) => ({ ...s, loading: true, error: false }));
      const res = await apiFetch<AuthorPostsPage>(pathOf(authorKey, first ? null : cursor.current));
      if (mine !== seq.current) return;
      if (!res.ok) return setState((s) => ({ ...s, loading: false, error: true }));
      cursor.current = res.data.nextCursor;
      setState((s) => ({
        items: first ? res.data.items : merge(s.items, res.data.items),
        next: res.data.nextCursor,
        loading: false,
        loaded: true,
        error: false,
      }));
    },
    [authorKey],
  );
  useEffect(() => {
    cursor.current = null;
    setState({ items: [], next: null, loading: true, loaded: false, error: false });
    void read(true);
    return () => {
      seq.current++;
    };
  }, [read]);
  return { ...state, reload: () => read(true), more: () => read(false) };
}

/** Une offre : vignette, étiquette, titre (jamais tronqué), légende sur deux lignes, dates. */
function Row({ post }: { post: FeedPostView }) {
  const offer = post.offer;
  const photo = post.photos[0];
  if (!offer) return null;
  const href = publicationPath(post.id, { web: true });
  return (
    <li className="po-row" data-testid="offer-row">
      <a className="po-row__thumb" href={href} aria-label={`${T.openOffer} : ${offer.title}`}>
        {photo ? <img src={photo.url} alt="" loading="lazy" decoding="async" /> : null}
      </a>
      <div className="po-row__text">
        <span className="po-tag">
          <Icon name="ticket" size={13} /> {T.tag}
        </span>
        <a className="po-row__title" href={href} data-testid="offer-title">
          {offer.title}
        </a>
        {post.caption ? (
          <p className="po-row__caption" data-testid="offer-caption">
            {post.caption}
          </p>
        ) : null}
        <span className="po-dates">
          <Icon name="calendar" size={14} />
          <span data-testid="offer-dates">{offerDatesLabel(offer)}</span>
        </span>
      </div>
    </li>
  );
}

/** Les lignes d'offres (la liste seule : l'espace du pro la rend côté serveur). */
export function OfferList({ items }: { items: readonly FeedPostView[] }) {
  return (
    <ul className="po-list" data-testid="offers-list">
      {items.map((post) => (
        <Row key={post.id} post={post} />
      ))}
    </ul>
  );
}

/** Les offres en cours (lignes, vide, panne, « Voir plus »), sans en-tête. */
export function OfferRows({ list }: { list: ReturnType<typeof useOffers> }) {
  if (list.loading && !list.loaded)
    return (
      <div className="pub-state pub-state--wait" role="status">
        <OLoader size={64} label={T.loading} />
      </div>
    );
  if (list.error && !list.loaded)
    return (
      <div className="pub-state" role="alert" data-testid="load-error">
        <p className="o-t-body">{T.loadError}</p>
        <Button variant="secondary" icon="undo" onClick={() => void list.reload()}>
          Réessayer
        </Button>
      </div>
    );
  if (list.items.length === 0)
    return (
      <p className="s-notice" data-testid="offers-empty">
        {T.empty}
      </p>
    );
  return (
    <>
      <OfferList items={list.items} />
      {list.error ? (
        <p className="s-error" role="alert">
          {T.loadError}
        </p>
      ) : null}
      {list.next ? (
        <Button
          variant="secondary"
          icon="down"
          disabled={list.loading}
          onClick={() => void list.more()}
          data-testid="offers-more"
        >
          {T.more}
        </Button>
      ) : null}
    </>
  );
}

/** Les offres en cours de la fiche, lues dans le navigateur page par page (« Voir plus » au-delà de 20) : l'espace du pro. */
export function CurrentOffers({ authorKey }: { authorKey: string }) {
  return <OfferRows list={useOffers(authorKey)} />;
}

/** « Anciennes offres » : les `pro_posts` d'avant, lisibles de l'abonné et du propriétaire ; un message pour les autres. */
export function OldOffers({ pro }: { pro: ProPublic }) {
  if (pro.posts === null) {
    if (pro.postsCount <= 0) return null;
    return (
      <section className="po-old" aria-labelledby="po-old" data-testid="old-offers">
        <h2 id="po-old" className="s-h2">
          {T.oldTitle}
        </h2>
        <p className="s-notice" data-testid="old-offers-locked">
          {T.oldLocked(pro.postsCount)}
        </p>
      </section>
    );
  }
  if (pro.posts.length === 0) return null;
  return (
    <section className="po-old" aria-labelledby="po-old" data-testid="old-offers">
      <h2 id="po-old" className="s-h2">
        {T.oldTitle}
      </h2>
      {pro.posts.map((post) => (
        <div key={post.id} className="po-old__row" data-testid="old-offer">
          <strong>{post.title}</strong>
          <p>{post.body}</p>
          <span className="o-t-caption s-muted">
            {new Date(post.createdAt).toLocaleString("fr-FR", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Paris",
            })}
          </span>
        </div>
      ))}
    </section>
  );
}

export function PageOffers({
  authorKey,
  pro,
  owner,
  publishHref,
}: {
  /** `p:<fiche pro>`. */
  authorKey: string;
  pro: ProPublic;
  /** Le propriétaire de la fiche : « Publier une offre ». */
  owner: boolean;
  publishHref: string;
}) {
  const list = useOffers(authorKey);
  // Le nombre de la liste fait foi une fois lue en entier ; sinon celui que la fiche sert.
  const count = list.loaded && !list.next ? list.items.length : (pro.offers?.current ?? list.items.length);
  // Jamais un bouton principal grisé sans sa ligne : fiche non publiée, limite du mois atteinte.
  const blocked = !pro.published
    ? T.blockedUnpublishedSite
    : pro.offers?.remaining === 0
      ? T.blockedLimit(PRO_POSTS_PER_MONTH)
      : null;
  return (
    <div className="po-page" data-testid="page-offers">
      <div className="po-head">
        <b data-testid="offers-count">{T.count(count)}</b>
        {owner ? (
          blocked ? (
            <Button type="button" variant="primary" icon="ticket" disabled data-testid="offers-publish">
              {T.publishOffer}
            </Button>
          ) : (
            <Button variant="primary" icon="ticket" href={publishHref} data-testid="offers-publish">
              {T.publishOffer}
            </Button>
          )
        ) : null}
      </div>
      {owner && blocked ? (
        <p className="s-notice" data-testid="offers-publish-blocked">
          {blocked}
        </p>
      ) : null}
      <OfferRows list={list} />
      <OldOffers pro={pro} />
    </div>
  );
}
