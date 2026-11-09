// Le Fil sur le site (lot R7e2, D38, maquette R7.6) : colonne de 600 px, publier, filtres (« Pour toi », « Autour de moi »,
// « Abonnements », dans l'adresse : `?filtre=`), cartes par genre avec raison et « ⋯ ». Lu dans le navigateur (`/api/fil`,
// cookie de session) : seule la dernière lecture compte, `reset` remplace la liste, le curseur est renvoyé tel quel, une
// erreur n'est jamais une liste vide. Mêmes règles et mêmes mots que l'appli (`@orasso/shared`).
import { Button, Icon } from "@orasso/design-system/web";
import {
  applyFeedPage,
  CONTACT_EMAIL,
  emptyFeedList,
  type FeedCard,
  type FeedErrorSource,
  type FeedFilter,
  type FeedListState,
  type FeedPage,
  feedCardKindLabels,
  feedFilters,
  feedRetryAction,
  feedScreenFilters,
  feedWhyText,
  isFeedSponsoredTargeted,
  feedScreenLabels as L,
  pinnedPublished,
  storyPublishLabels as S,
  sponsoredNotBeforeFourth,
  withMyPublished,
  withoutPlacement,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import "../../styles/fil.css";
import { apiFetch } from "../../lib/api.client";
import { ReportDialog } from "../ReportDialog";
import { cardFor } from "./Cards";
import { forgetPublished, readPublished } from "./mine";

const asFilter = (v: string | null): FeedFilter =>
  (feedFilters as readonly string[]).includes(v ?? "") ? (v as FeedFilter) : "for_you";

export function Fil({ userId }: { userId: string }) {
  const [filter, setFilter] = useState<FeedFilter>("for_you");
  // Le filtre de l'adresse est lu une seule fois, au premier affichage : aucune lecture ne part avant.
  const [ready, setReady] = useState(false);
  // Mes publications de cette session, gardées en tête de la liste affichée (`mine.ts`).
  const [mineCards, setMineCards] = useState<FeedCard[]>([]);
  const [errorSource, setErrorSource] = useState<FeedErrorSource | null>(null);
  const [list, setList] = useState<FeedListState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [menu, setMenu] = useState<FeedCard | null>(null);
  const [why, setWhy] = useState<FeedCard | null>(null);
  const [faded, setFaded] = useState<Record<string, FeedCard>>({});
  const [lessNote, setLessNote] = useState<{ card: FeedCard; error: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const seq = useRef(0);
  const listRef = useRef(list);
  listRef.current = list;
  const topRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDialogElement>(null);
  const whyRef = useRef<HTMLDialogElement>(null);

  const load = useCallback(async (f: FeedFilter) => {
    const mine = ++seq.current;
    const res = await apiFetch<FeedPage>(`/fil?filter=${f}`);
    if (mine !== seq.current) return;
    if (!res.ok) {
      setError(res.status === 429 ? L.tooManyRequests : res.error.message || L.loadError);
      setErrorSource("reload");
      return;
    }
    const applied = applyFeedPage(emptyFeedList(f), res.data, null);
    if (applied) {
      setList(applied.state);
      setError(null);
      setErrorSource(null);
    }
  }, []);

  // Le filtre vient de l'adresse au premier affichage (après l'hydratation : jamais de décalage serveur/navigateur).
  useEffect(() => {
    setFilter(asFilter(new URLSearchParams(window.location.search).get("filtre")));
    setMineCards(readPublished(userId));
    setReady(true);
  }, [userId]);
  useEffect(() => {
    if (!ready) return;
    setList(null);
    setError(null);
    setErrorSource(null);
    setFaded({});
    setLessNote(null);
    void load(filter);
  }, [ready, filter, load]);

  const choose = (f: FeedFilter) => {
    if (f === filter) return;
    const url = new URL(window.location.href);
    url.searchParams.set("filtre", f);
    window.history.replaceState(null, "", url);
    setFilter(f);
  };

  async function more() {
    const current = listRef.current;
    if (!current?.nextCursor || loadingMore) return;
    const sent = current.nextCursor;
    const mine = seq.current;
    setLoadingMore(true);
    const res = await apiFetch<FeedPage>(`/fil?filter=${current.filter}&cursor=${encodeURIComponent(sent)}`);
    setLoadingMore(false);
    if (mine !== seq.current) return;
    if (!res.ok) {
      // Curseur refusé (400) : la première page est relue.
      if (res.status === 400) void load(current.filter);
      else {
        setError(res.status === 429 ? L.tooManyRequests : res.error.message || L.moreError);
        setErrorSource("more");
      }
      return;
    }
    const latest = listRef.current;
    if (!latest || latest.nextCursor !== sent) return;
    const applied = applyFeedPage(latest, res.data, sent);
    if (!applied) return;
    setList(applied.state);
    setError(null);
    setErrorSource(null);
    if (applied.scrollTop) topRef.current?.scrollIntoView();
  }

  useEffect(() => {
    if (menu) menuRef.current?.showModal();
    else menuRef.current?.close();
  }, [menu]);
  useEffect(() => {
    if (why) whyRef.current?.showModal();
    else whyRef.current?.close();
  }, [why]);

  async function less(card: FeedCard) {
    setMenu(null);
    setFaded((f) => ({ ...f, [card.id]: card }));
    setLessNote({ card, error: null });
    const res = await apiFetch("/me/feed/less", { method: "POST", json: { kind: card.kind } });
    if (!res.ok) {
      setFaded((f) => {
        const { [card.id]: _gone, ...rest } = f;
        return rest;
      });
      setLessNote({ card, error: res.error.message });
    }
  }
  async function undoLess(card: FeedCard) {
    setFaded((f) => {
      const { [card.id]: _gone, ...rest } = f;
      return rest;
    });
    setLessNote(null);
    const res = await apiFetch(`/me/feed/less/${card.kind}`, { method: "DELETE" });
    if (!res.ok) setNotice(res.error.message);
  }
  async function remove(card: FeedCard) {
    if (card.kind !== "feed_post") return;
    setMenu(null);
    if (!window.confirm(L.removeConfirm)) return;
    const res = await apiFetch(`/me/feed-posts/${card.payload.post.id}`, { method: "DELETE" });
    if (!res.ok) return setNotice(res.error.message);
    forgetPublished(card.id);
    setMineCards((m) => m.filter((c) => c.id !== card.id));
    setList((s) => (s ? { ...s, items: s.items.filter((c) => c.id !== card.id) } : s));
    setNotice(L.removeDone);
  }

  const shown = list && list.filter === filter ? list.items : null;
  // La carte « Sponsorisé » ne remonte jamais avant la 4e place, même si une des trois premières cartes sort (tour 2).
  const items = shown ? sponsoredNotBeforeFourth(withMyPublished(shown, pinnedPublished(mineCards))) : null;
  /** « Réessayer » : relit la première page après un échec d'actualisation, la page suivante après un échec de « Voir plus ». */
  const retry = () => (feedRetryAction(errorSource) === "loadMore" ? more() : load(filter));
  const empty = L.empty[filter];
  const menuTitle = menu ? feedCardKindLabels[menu.kind] : "";
  const mine = menu?.kind === "feed_post" && menu.payload.post.mine;
  const whoOf = (c: FeedCard) =>
    c.kind === "feed_post" ? c.payload.post.author.pseudo : c.kind === "vehicle_public" ? c.payload.owner.pseudo : null;

  return (
    <div className="fil" data-testid="fil" ref={topRef}>
      {/* Emplacement de la barre de stories : RÉSERVÉ au lot R7f2. */}
      {/* Lot R7f3 : « Publier » demande où (en story, dans le Fil) ; sans JavaScript aussi (`details`). */}
      <details className="fil-choose">
        <summary className="fil-publish" data-testid="fil-publish-open">
          <Icon name="camera" size={20} /> {L.publish}
        </summary>
        <div className="fil-choose__list">
          <a className="fil-choose__option" href="/app/story/publier" data-testid="fil-publish-choose-story">
            <Icon name="camera" size={20} />
            <span>
              <strong>{S.chooseStory}</strong>
              <small>{S.chooseStoryHint}</small>
            </span>
          </a>
          <a className="fil-choose__option" href="/app/fil/publier" data-testid="fil-publish-choose-post">
            <Icon name="feed" size={20} />
            <span>
              <strong>{S.choosePost}</strong>
              <small>{S.choosePostHint}</small>
            </span>
          </a>
        </div>
      </details>
      <div className="fil-filters" role="tablist" aria-label="Filtres du Fil" data-testid="fil-filters">
        {feedScreenFilters.map((o) => (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={filter === o.value}
            className={filter === o.value ? "is-on" : undefined}
            onClick={() => choose(o.value)}
            data-testid={`fil-filters-${o.value}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {notice ? (
        <p className="o-t-caption" role="alert" data-testid="fil-notice">
          {notice}
        </p>
      ) : null}
      {lessNote ? (
        <div className="fil-less" data-testid="fil-less-note">
          <span className="o-t-caption">{lessNote.error ?? L.lessKind(feedCardKindLabels[lessNote.card.kind])}</span>
          {lessNote.error ? null : (
            <button
              type="button"
              className="fil-link"
              onClick={() => void undoLess(lessNote.card)}
              data-testid="fil-less-undo"
            >
              <Icon name="undo" size={16} /> {L.lessUndo}
            </button>
          )}
        </div>
      ) : null}
      {items === null && !error ? (
        <p className="o-t-caption" role="status" data-testid="fil-waiting">
          {L.loadingMore}
        </p>
      ) : null}
      {error && !items?.length ? (
        <div className="fil-error" role="alert" data-testid="load-error">
          <p className="o-t-body">{error}</p>
          <Button variant="secondary" icon="undo" onClick={() => void retry()}>
            {L.retry}
          </Button>
        </div>
      ) : null}
      {items && items.length === 0 && !error ? (
        <div className="fil-empty" data-testid="fil-empty">
          <h2 className="s-h2">{empty.title}</h2>
          <p className="o-t-body">{empty.text}</p>
          {filter === "following" ? (
            <a className="fil-link" href="/app/explorer" data-testid="fil-empty-search">
              <Icon name="search" size={16} /> {L.searchPeople}
            </a>
          ) : null}
        </div>
      ) : null}
      {items?.length ? (
        <div className="fil-list" data-testid="fil-list">
          {items.map((card) => {
            const Card = cardFor(card.kind);
            return (
              <Card
                key={card.id}
                card={card}
                onMenu={setMenu}
                faded={Boolean(faded[card.id])}
                userId={userId}
                onRemoved={(c) =>
                  setList((s) =>
                    s
                      ? {
                          ...s,
                          items:
                            c.kind === "sponsored"
                              ? withoutPlacement(s.items, c.payload.id)
                              : s.items.filter((x) => x.id !== c.id),
                        }
                      : s,
                  )
                }
              />
            );
          })}
        </div>
      ) : null}
      {list?.nextCursor && list.filter === filter ? (
        <Button
          variant="secondary"
          icon="down"
          disabled={loadingMore}
          onClick={() => void more()}
          data-testid="fil-more"
        >
          {loadingMore ? L.loadingMore : L.loadMore}
        </Button>
      ) : null}
      {error && items?.length ? (
        <div className="fil-error" role="alert" data-testid="load-error">
          <p className="o-t-body">{error}</p>
          <Button variant="secondary" icon="undo" onClick={() => void retry()}>
            {L.retry}
          </Button>
        </div>
      ) : null}
      {items?.length && !list?.nextCursor && !error ? (
        <p className="o-t-caption fil-end" data-testid="fil-end">
          {L.end}
        </p>
      ) : null}

      <dialog
        ref={menuRef}
        className="mod-dialog"
        aria-label={L.more}
        onClose={() => setMenu(null)}
        data-testid="feed-menu"
      >
        {menu ? (
          <div className="s-stack">
            <h2 className="s-h2">{menuTitle}</h2>
            <button
              type="button"
              className="fil-menu__row"
              onClick={() => {
                const c = menu;
                setMenu(null);
                setWhy(c);
              }}
              data-testid="feed-menu-why"
            >
              <Icon name="help" size={20} />
              <span>
                <strong>{L.whyTitle}</strong>
                <small>{L.menuWhyHint}</small>
              </span>
            </button>
            {mine ? (
              <button
                type="button"
                className="fil-menu__row"
                onClick={() => void remove(menu)}
                data-testid="feed-menu-remove"
              >
                <Icon name="trash" size={20} />
                <span>
                  <strong>{L.removePost}</strong>
                </span>
              </button>
            ) : (
              <>
                {menu.kind === "sponsored" ? null : (
                  <button
                    type="button"
                    className="fil-menu__row"
                    onClick={() => void less(menu)}
                    data-testid="feed-menu-less"
                  >
                    <Icon name="eyeOff" size={20} />
                    <span>
                      <strong>{L.lessFaded}</strong>
                      <small>{L.menuLessHint}</small>
                    </span>
                  </button>
                )}
                {menu.kind === "sponsored" ? (
                  <a
                    className="fil-menu__row"
                    href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(L.reportAdSubject)}&body=${encodeURIComponent(
                      L.reportAdBody(menu.payload.advertiserName, menu.payload.id),
                    )}`}
                    data-testid="feed-menu-report"
                  >
                    <Icon name="flag" size={20} />
                    <span>
                      <strong>{L.report}</strong>
                      <small>{L.reportAdHint}</small>
                    </span>
                  </a>
                ) : null}
                {menu.kind === "sponsored" ? (
                  <p className="o-t-caption fil-menu__address" data-testid="feed-menu-report-address">
                    {L.reportAdAddress(CONTACT_EMAIL)}
                  </p>
                ) : null}
                {menu.kind === "feed_post" ? (
                  <div className="fil-menu__report" data-testid="feed-menu-report">
                    <ReportDialog targetType="feed_post" targetId={menu.payload.post.id} label={L.report} look="link" />
                  </div>
                ) : null}
              </>
            )}
            <Button variant="plate" icon="close" fullWidth onClick={() => setMenu(null)} data-testid="feed-menu-close">
              Fermer
            </Button>
          </div>
        ) : null}
      </dialog>

      <dialog ref={whyRef} className="mod-dialog" aria-label={L.whyTitle} onClose={() => setWhy(null)}>
        {why ? (
          <div className="s-stack">
            <h2 className="s-h2">{L.whyTitle}</h2>
            <p className="o-t-body" data-testid="feed-why-text">
              <strong>
                {feedWhyText(
                  why.reason.code,
                  whoOf(why),
                  why.kind === "feed_post" && why.payload.post.mine,
                  isFeedSponsoredTargeted(why.reason.label),
                )}
              </strong>
            </p>
            {why.kind === "sponsored" ? null : <p className="o-t-caption">{L.whyNote}</p>}
            <Button variant="secondary" icon="check" fullWidth onClick={() => setWhy(null)} data-testid="feed-why-ok">
              {L.whyClose}
            </Button>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
