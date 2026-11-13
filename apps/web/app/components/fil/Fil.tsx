// Le Fil sur le site (lot R7e2, D38, maquette R7.6) : colonne de 600 px, publier, filtres (« Pour toi », « Autour de moi »,
// « Abonnements », dans l'adresse : `?filtre=`), cartes par genre avec raison et « ⋯ ». Lu dans le navigateur (`/api/fil`,
// cookie de session) : seule la dernière lecture compte, `reset` remplace la liste, le curseur est renvoyé tel quel, une
// erreur n'est jamais une liste vide. Mêmes règles et mêmes mots que l'appli (`@orasso/shared`).
// Lot R8c2 (maquette R8.3) : la phrase de l'onglet et « Comment le Fil choisit », le rail « Ça plaît en ce moment », le bandeau de
// ma publication (en tête à l'envoi seulement), « Tu es à jour » puis « Déjà vu », la pastille « Nouvelles publications » et les
// cartes vues envoyées à l'API. Pas de mode hors ligne sur le site.
import { Button, Icon } from "@orasso/design-system/web";
import {
  applyFeedPage,
  CONTACT_EMAIL,
  caughtUpIndex,
  emptyFeedList,
  type FeedCard,
  type FeedErrorSource,
  type FeedFilter,
  type FeedListState,
  type FeedPage,
  feedCardKindLabels,
  feedFilters,
  feedPhrases,
  feedRetryAction,
  feedScreenFilters,
  feedWhyText,
  isFeedSponsoredTargeted,
  justPublished,
  feedScreenLabels as L,
  storyPublishLabels as S,
  sponsoredNotBeforeFourth,
  withMyPublished,
  withoutPlacement,
} from "@orasso/shared";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import "../../styles/fil.css";
import { apiFetch } from "../../lib/api.client";
import { ReportDialog } from "../ReportDialog";
import { cardFor } from "./Cards";
import { HotRail } from "./HotRail";
import { HowFeedDialog } from "./HowFeedDialog";
import { forgetPublished, readPublished } from "./mine";
import { isTrackable, noteSeenAction, useSeenObserver } from "./seenTracker";

/** « Nouvelles publications » : une lecture par minute, onglet affiché. */
const FRESH_EVERY_MS = 60_000;

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
  // Lot R8c2 : « Comment le Fil choisit », le bandeau de ma publication, la pastille, le suivi des cartes vues.
  const [how, setHow] = useState(false);
  const [bannerClosed, setBannerClosed] = useState<string | null>(null);
  const [fresh, setFresh] = useState(0);
  const [round, setRound] = useState(0);
  const listBox = useRef<HTMLDivElement>(null);
  const mineRead = useRef(false);
  const seq = useRef(0);
  const listRef = useRef(list);
  listRef.current = list;
  const topRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const menuRef = useRef<HTMLDialogElement>(null);
  const whyRef = useRef<HTMLDialogElement>(null);

  const load = useCallback(async (f: FeedFilter) => {
    const mine = ++seq.current;
    const res = await apiFetch<FeedPage>(`/fil?filter=${f}&cards=album`);
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
      setFresh(0);
      setRound((n) => n + 1);
    }
  }, []);

  // Le filtre vient de l'adresse au premier affichage (après l'hydratation : jamais de décalage serveur/navigateur).
  useEffect(() => {
    setFilter(asFilter(new URLSearchParams(window.location.search).get("filtre")));
    // Ma publication juste envoyée est en tête **cette fois seulement** : l'onglet l'oublie aussitôt lue, un rechargement ou
    // un départ du Fil la remet à sa place (R8c2). `mineRead` : le mode strict de développement rejoue l'effet.
    if (!mineRead.current) {
      mineRead.current = true;
      const found = justPublished(readPublished(userId), Date.now());
      for (const c of found) forgetPublished(c.id);
      setMineCards(found);
    }
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

  // Lot R8f1 : la liste des choix « Publier » se ferme au clic ailleurs, à Échap et au changement de filtre.
  const chooseRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const el = chooseRef.current;
      if (!el?.open) return;
      if (e.type === "keydown") {
        if ((e as KeyboardEvent).key !== "Escape") return;
        el.removeAttribute("open");
        el.querySelector("summary")?.focus();
      } else if (!el.contains(e.target as Node)) el.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const choose = (f: FeedFilter) => {
    if (f === filter) return;
    const url = new URL(window.location.href);
    url.searchParams.set("filtre", f);
    window.history.replaceState(null, "", url);
    chooseRef.current?.removeAttribute("open");
    setFilter(f);
  };

  async function more() {
    const current = listRef.current;
    if (!current?.nextCursor || loadingMore) return;
    const sent = current.nextCursor;
    const mine = seq.current;
    setLoadingMore(true);
    const res = await apiFetch<FeedPage>(
      `/fil?filter=${current.filter}&cursor=${encodeURIComponent(sent)}&cards=album`,
    );
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
    if (res.data.reset) {
      setFresh(0);
      setRound((n) => n + 1);
    }
    if (applied.scrollTop) topRef.current?.scrollIntoView();
  }

  /** La pastille « Nouvelles publications » : ma publication reprend sa place, la première page est relue, on remonte. */
  async function refresh() {
    setMineCards([]);
    topRef.current?.scrollIntoView();
    await load(filterRef.current);
  }

  // Les nouveautés : une lecture par minute, seulement onglet affiché et liste lue.
  const ref = list?.ref;
  useEffect(() => {
    if (!ref) return;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const res = await apiFetch<{ count: number }>(
        `/fil/fresh?filter=${filterRef.current}&since=${encodeURIComponent(ref)}&cards=album`,
      );
      if (res.ok && listRef.current?.ref === ref) setFresh(res.data.count);
    }, FRESH_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [ref]);

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
  const pinned = justPublished(mineCards, Date.now());
  const items = shown ? sponsoredNotBeforeFourth(withMyPublished(shown, pinned)) : null;
  // « Tu es à jour » : avant la première carte déjà vue. Le bandeau : ma publication juste envoyée est en tête.
  const frontier = items ? caughtUpIndex(items) : -1;
  const hot = list && list.filter === filter ? (list.hot ?? []) : [];
  const publishedId = pinned[0]?.id ?? null;
  useSeenObserver({ userId, root: listBox, cards: items ?? [], reset: `${filter}:${round}` });
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
      {/* Lot R8f1 (variante A1, maquette R8.2) : une seule rangée, les trois filtres et, à droite, le bouton icône « Publier » ;
          la liste des choix s'ouvre sous la rangée, alignée à droite, par-dessus le Fil (rien ne descend). */}
      {fresh > 0 ? (
        <button type="button" className="fil-fresh" onClick={() => void refresh()} data-testid="fil-fresh">
          <Icon name="up" size={16} /> {L.freshPill}
        </button>
      ) : null}
      <div className="fil-top">
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
        <details className="fil-choose" ref={chooseRef}>
          <summary className="fil-publish fil-publish--icon" data-testid="fil-publish-open" aria-label={L.publish}>
            <Icon name="camera" size={20} />
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
      </div>
      <div className="fil-phrase">
        <p className="o-t-caption" data-testid="fil-phrase">
          {feedPhrases[filter]}
        </p>
        <button
          type="button"
          className="fil-info"
          aria-label={L.howOpen}
          onClick={() => setHow(true)}
          data-testid="fil-how-open"
        >
          <Icon name="info" size={20} />
        </button>
      </div>
      {publishedId && bannerClosed !== publishedId ? (
        <div className="fil-banner" data-testid="fil-banner">
          <Icon name="check" size={20} />
          <div className="fil-banner__body">
            <p className="o-t-caption">
              <strong>{L.bannerTitle}</strong>
              {L.bannerText}
            </p>
            <a className="fil-link" href="/app/moi?onglet=publications" data-testid="fil-banner-profile">
              <Icon name="profile" size={16} /> {L.bannerProfile}
            </a>
          </div>
          <button
            type="button"
            className="fil-banner__close"
            aria-label={L.bannerClose}
            onClick={() => setBannerClosed(publishedId)}
            data-testid="fil-banner-close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      ) : null}
      {hot.length > 0 && filter !== "for_you" ? (
        <HotRail
          cards={hot}
          scope={filter === "nearby" ? "nearby" : "following"}
          onOpen={(card) => noteSeenAction(userId, card.id, "open")}
        />
      ) : null}
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
        <div className="fil-list" data-testid="fil-list" ref={listBox}>
          {items.map((card, i) => {
            const Card = cardFor(card.kind);
            return (
              <Fragment key={card.id}>
                {i === frontier ? (
                  <>
                    <div className="fil-uptodate" data-testid="fil-uptodate">
                      <Icon name="check" size={26} />
                      <div>
                        <strong>{L.upToDate}</strong>
                        <small>{L.upToDateText}</small>
                      </div>
                    </div>
                    <h2 className="fil-seen-heading" data-testid="fil-seen-heading">
                      {L.seenHeading}
                    </h2>
                  </>
                ) : null}
                {/* Un clic sur un lien de la carte = elle a été ouverte ; sur le bouton « partager » = partagée (R8c2). */}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: l'enveloppe ne fait qu'observer les clics de la carte. */}
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: les liens et boutons de la carte portent déjà le clavier. */}
                <div
                  className={frontier >= 0 && i >= frontier ? "fil-item is-seen" : "fil-item"}
                  data-seen-id={isTrackable(card) ? card.id : undefined}
                  onClickCapture={(e) => {
                    const target = e.target as Element;
                    if (target.closest('[data-testid="feed-post-share"]')) noteSeenAction(userId, card.id, "share");
                    else if (target.closest("a[href]")) noteSeenAction(userId, card.id, "open");
                  }}
                >
                  <Card
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
                </div>
              </Fragment>
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

      <HowFeedDialog open={how} onClose={() => setHow(false)} />

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
