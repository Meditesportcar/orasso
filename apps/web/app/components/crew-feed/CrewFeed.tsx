// Le fil du crew sur le site (lot R5c1, maquette R5.7 onglet Fil) : une colonne centrale, les mêmes composants et les
// mêmes mots que l'appli. Lu dans le navigateur (`/api/crews/:id/feed`, cookie de session), 20 par page ; une erreur
// n'est jamais montrée comme un fil vide. Composant autonome, monté par la page du crew (onglet Fil, lot R5c2).
// Lot R6a, tour 2 : en direct, avec les règles communes de l'appli (`crewLive.ts`) : le fil affiché, son curseur et les
// nouveautés de la pastille dans un seul état ; rien de ce qui est intégré ne disparaît, les pages intermédiaires
// manquées sont lues, la reconnexion revalide toutes les pages chargées, une sortie se relit où qu'elle soit. Une
// relecture en échec est rejetée (le besoin reste et repart), et une ligne discrète le dit.
import { Button, Icon } from "@orasso/design-system/web";
import {
  acceptCrewFeedPending,
  applyCrewFeedRead,
  type CrewFeedItem,
  type CrewFeedOuting,
  type CrewFeedPage,
  type CrewFeedState,
  type CrewFireState,
  type CrewOutingView,
  type CrewPostOptions,
  type CrewPostView,
  crewFeedLabels,
  crewLivePillLabel,
  crewPageLabels,
  readCrewFeedTop,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import "../../styles/crew-feed.css";
import { apiFetch } from "../../lib/api.client";
import { PersonAvatar } from "../People";
import { CommentsDialog } from "./CommentsDialog";
import { useCrewLiveNeeds, useCrewLiveStale } from "./CrewLive";
import { AutoCard, PostCard } from "./PostCard";
import { PublishDialog } from "./PublishDialog";

export type CrewFeedCrew = { id: string; slug: string; archived?: boolean };

/** Une page suivante s'ajoute sans doublon (une entrée relue en direct peut déjà être là). */
function appendByKey(current: readonly CrewFeedItem[], next: readonly CrewFeedItem[]): CrewFeedItem[] {
  const seen = new Set(current.map((i) => i.key));
  return [...current, ...next.filter((i) => !seen.has(i.key))];
}

/** Ses propres publications ne vont jamais à la pastille (l'onglet du geste les montre déjà). */
const isMine = (i: CrewFeedItem) => i.type === "post" && i.post.mine;

type Mapper = (item: CrewFeedItem) => CrewFeedItem | null;
const mapAll = (s: CrewFeedState<CrewFeedItem>, fn: Mapper): CrewFeedState<CrewFeedItem> => ({
  ...s,
  items: s.items.flatMap((i) => fn(i) ?? []),
  pending: s.pending.flatMap((i) => fn(i) ?? []),
});

/** Une lecture en direct en échec : rejetée, pour que le besoin reste et reparte. */
class LiveReadError extends Error {}

export function CrewFeed({ crew }: { crew: CrewFeedCrew }) {
  const [feed, setFeed] = useState<CrewFeedState<CrewFeedItem> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [options, setOptions] = useState<CrewPostOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [comments, setComments] = useState<CrewPostView | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Seule la dernière lecture complète compte (une relecture en direct partie avant elle est jetée).
  const seq = useRef(0);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const listRef = useRef<HTMLDivElement>(null);
  const stale = useCrewLiveStale();
  const items = feed?.items ?? null;
  const cursor = feed?.cursor ?? null;
  const pending = feed?.pending ?? [];

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const res = await apiFetch<CrewFeedPage>(`/crews/${crew.id}/feed`);
    if (mine !== seq.current) return;
    if (!res.ok) {
      setLoadError(res.error.message);
      return;
    }
    setFeed({ items: res.data.items, cursor: res.data.nextCursor, pending: [] });
    setLoadError(null);
  }, [crew.id]);

  const loadMore = async (from: string) => {
    const mine = seq.current;
    setLoadingMore(true);
    const res = await apiFetch<CrewFeedPage>(`/crews/${crew.id}/feed?cursor=${encodeURIComponent(from)}`);
    setLoadingMore(false);
    if (mine !== seq.current) return;
    if (!res.ok) {
      setLoadError(res.error.message);
      return;
    }
    // Une relecture en direct a pu changer le curseur entre-temps : la page lue ne vaut plus, on la jette.
    setFeed((s) =>
      s && s.cursor === from ? { ...s, items: appendByKey(s.items, res.data.items), cursor: res.data.nextCursor } : s,
    );
    setLoadError(null);
  };

  /** Le haut du fil est à l'écran (ou plus bas) : une nouvelle entrée s'insère sans faire sauter la liste. */
  const atTop = () => (listRef.current?.getBoundingClientRect().top ?? 0) >= -8;

  /** Une publication relue ou changée sur place (`null` : retirée), partout où elle est (affichée, en attente). */
  const put = (id: string, next: CrewPostView | null | ((p: CrewPostView) => CrewPostView)) =>
    setFeed((s) =>
      s
        ? mapAll(s, (i) => {
            if (i.type !== "post" || i.post.id !== id) return i;
            if (next === null) return null;
            return { ...i, post: typeof next === "function" ? next(i.post) : next };
          })
        : s,
    );
  /** Une sortie relue (`null` : annulée, sa carte quitte le fil). */
  const putOuting = (id: string, next: ((o: CrewFeedOuting) => CrewFeedOuting) | null) =>
    setFeed((s) =>
      s
        ? mapAll(s, (i) =>
            i.type === "crew_outing" && i.outing.id === id ? (next ? { ...i, outing: next(i.outing) } : null) : i,
          )
        : s,
    );

  useCrewLiveNeeds(async (needs) => {
    for (const id of needs.removedPosts) put(id, null);
    for (const id of needs.removedOutings) putOuting(id, null);
    if (comments && needs.removedPosts.includes(comments.id)) setComments(null);
    const shown = feedRef.current;
    if (!shown) return; // Fil pas encore lu : sa première lecture suffit.
    let read: CrewFeedItem[] = [];
    if (needs.head || needs.full) {
      const ticket = seq.current;
      const result = await readCrewFeedTop(
        async (from) => {
          const res = await apiFetch<CrewFeedPage>(
            `/crews/${crew.id}/feed${from ? `?cursor=${encodeURIComponent(from)}` : ""}`,
          );
          if (!res.ok) throw new LiveReadError(res.error.message);
          return res.data;
        },
        shown.items,
        needs.full ? "full" : "head",
      );
      if (ticket === seq.current) {
        const insert = atTop();
        setFeed((s) => (s ? applyCrewFeedRead(s, result, { insert, mine: isMine }) : s));
        read = result.items;
      }
    }
    const everything = [...shown.items, ...shown.pending];
    const shownPosts = new Set(everything.flatMap((i) => (i.type === "post" ? [i.post.id] : [])));
    const shownOutings = new Set(everything.flatMap((i) => (i.type === "crew_outing" ? [i.outing.id] : [])));
    const readPosts = new Set(read.flatMap((i) => (i.type === "post" ? [i.post.id] : [])));
    const readOutings = new Set(read.flatMap((i) => (i.type === "crew_outing" ? [i.outing.id] : [])));
    for (const id of needs.posts) {
      if (needs.removedPosts.includes(id) || readPosts.has(id) || !shownPosts.has(id)) continue;
      const res = await apiFetch<CrewPostView>(`/crews/${crew.id}/posts/${id}`);
      if (res.ok) put(id, res.data);
      else if (res.status === 404) put(id, null);
      else throw new LiveReadError(res.error.message);
    }
    // Tour 2 : la carte d'une sortie modifiée ou répondue se relit, où qu'elle soit dans le fil.
    for (const id of needs.outings) {
      if (needs.removedOutings.includes(id) || readOutings.has(id) || !shownOutings.has(id)) continue;
      const res = await apiFetch<CrewOutingView>(`/crews/${crew.id}/outings/${id}`);
      if (res.ok) {
        const o = res.data;
        putOuting(id, (cur) => ({
          ...cur,
          title: o.title,
          startsAt: o.startsAt,
          place: o.place,
          yes: o.yes,
          maybe: o.maybe,
          mine: o.mine,
          open: o.open,
        }));
      } else if (res.status === 404) putOuting(id, null);
      else throw new LiveReadError(res.error.message);
    }
  }, !crew.archived);

  /** La pastille : les nouvelles entrées s'affichent, la page remonte au haut du fil. */
  const showFresh = () => {
    setFeed((s) => (s?.pending.length ? { ...s, items: acceptCrewFeedPending(s.items, s.pending), pending: [] } : s));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    listRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const pill = crewLivePillLabel(pending);
  // Tour 2 : un échec des réglages du composeur se dit (message et « Réessayer »), le brouillon reste.
  const loadOptions = useCallback(async () => {
    setOptionsError(null);
    const res = await apiFetch<CrewPostOptions>(`/crews/${crew.id}/post-options`);
    if (res.ok) setOptions(res.data);
    else setOptionsError(res.error.message);
  }, [crew.id]);

  useEffect(() => {
    void load();
    void loadOptions();
  }, [load, loadOptions]);

  async function act(id: string, action: () => Promise<string | null>) {
    setBusy(id);
    setError(null);
    setOk(null);
    const failure = await action();
    setBusy(null);
    if (failure) setError(failure);
  }

  // Lot R5c2 : « Je viens » sur une sortie proposée, depuis le fil.
  const going = (o: CrewFeedOuting) =>
    act(o.id, async () => {
      const res = await apiFetch<CrewOutingView>(`/crews/${crew.id}/outings/${o.id}/rsvp`, {
        method: "PUT",
        json: { answer: "yes" },
      });
      if (!res.ok) return res.error.message;
      putOuting(o.id, (cur) => ({ ...cur, yes: res.data.yes, maybe: res.data.maybe, mine: res.data.mine }));
      setOk(crewPageLabels.feedOutingYesToast(o.title));
      return null;
    });
  const fire = (p: CrewPostView) =>
    act(p.id, async () => {
      const on = !p.firedByMe;
      put(p.id, { ...p, firedByMe: on, firesCount: p.firesCount + (on ? 1 : -1) });
      const res = await apiFetch<CrewFireState>(`/crews/${crew.id}/posts/${p.id}/reaction`, {
        method: on ? "PUT" : "DELETE",
      });
      if (res.ok) put(p.id, (cur) => ({ ...cur, ...res.data }));
      else put(p.id, p);
      return res.ok ? null : res.error.message;
    });
  const vote = (p: CrewPostView, optionId: string) =>
    act(p.id, async () => {
      const res = await apiFetch<CrewPostView>(`/crews/${crew.id}/posts/${p.id}/vote`, {
        method: "PUT",
        json: { optionId },
      });
      if (res.ok) put(p.id, res.data);
      return res.ok ? null : res.error.message;
    });
  const closePoll = (p: CrewPostView) =>
    act(p.id, async () => {
      const res = await apiFetch<CrewPostView>(`/crews/${crew.id}/posts/${p.id}/close`, { method: "POST" });
      if (res.ok) {
        put(p.id, res.data);
        setOk(crewFeedLabels.pollClosedToast);
      }
      return res.ok ? null : res.error.message;
    });
  const remove = (p: CrewPostView) => {
    if (!window.confirm(crewFeedLabels.removePostConfirm)) return;
    void act(p.id, async () => {
      const res = await apiFetch(`/crews/${crew.id}/posts/${p.id}`, { method: "DELETE" });
      if (res.ok) {
        put(p.id, null);
        setOk(crewFeedLabels.removed);
      }
      return res.ok ? null : res.error.message;
    });
  };

  return (
    <section className="cf" aria-label={crewFeedLabels.feed} data-testid="crew-feed">
      {!crew.archived && (
        <div className="cf-comp">
          <PersonAvatar url={options?.me.avatarUrl ?? null} pseudo={options?.me.pseudo ?? "?"} size={38} />
          <span className="o-t-caption s-muted">{crewFeedLabels.composerHint}</span>
          <Button icon="camera" onClick={() => setPublishing(true)} data-testid="crew-feed-publish">
            {crewFeedLabels.publish}
          </Button>
        </div>
      )}
      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
      {ok && (
        <p className="s-notice s-notice--ok" role="status">
          {ok}
        </p>
      )}
      {stale ? (
        <p className="o-t-caption s-muted" role="status" data-testid="crew-feed-stale">
          {crewFeedLabels.liveStale}
        </p>
      ) : null}
      {pill ? (
        <div className="cf-new">
          <button
            type="button"
            className="cf-new__pill o-t-button"
            onClick={showFresh}
            aria-label={crewFeedLabels.newA11y(pill)}
            data-testid="crew-feed-new"
          >
            <Icon name="up" size={16} />
            {pill}
          </button>
        </div>
      ) : null}
      <div ref={listRef} className="cf-list">
        {loadError && !items?.length ? (
          <div className="s-stack" data-testid="crew-feed-error">
            <p className="s-error" role="alert">
              {loadError || crewFeedLabels.loadError}
            </p>
            <Button variant="secondary" icon="undo" onClick={() => void load()}>
              {crewFeedLabels.retry}
            </Button>
          </div>
        ) : items === null ? (
          <p className="s-muted">…</p>
        ) : items.length === 0 ? (
          <p className="s-muted" data-testid="crew-feed-empty">
            {crewFeedLabels.empty}
          </p>
        ) : (
          items.map((item) =>
            item.type === "post" ? (
              <PostCard
                key={item.key}
                post={item.post}
                busy={busy === item.post.id}
                onFire={() => void fire(item.post)}
                onComments={() => setComments(item.post)}
                onVote={(optionId) => void vote(item.post, optionId)}
                onRemove={() => remove(item.post)}
                onClosePoll={() => void closePoll(item.post)}
              />
            ) : (
              <AutoCard
                key={item.key}
                item={item}
                busy={item.type === "crew_outing" && busy === item.outing.id}
                onGoing={item.type === "crew_outing" && !crew.archived ? () => void going(item.outing) : undefined}
              />
            ),
          )
        )}
      </div>
      {cursor && (
        <Button
          variant="secondary"
          icon="down"
          loading={loadingMore}
          onClick={() => void loadMore(cursor)}
          data-testid="crew-feed-more"
        >
          {crewFeedLabels.loadMore}
        </Button>
      )}
      {loadError && items?.length ? (
        <p className="s-error" role="alert">
          {loadError}
        </p>
      ) : null}
      <CommentsDialog
        crewId={crew.id}
        post={comments}
        onClose={() => setComments(null)}
        onCount={(id, delta) => put(id, (cur) => ({ ...cur, commentsCount: Math.max(0, cur.commentsCount + delta) }))}
      />
      <PublishDialog
        open={publishing}
        options={options}
        optionsError={optionsError}
        onRetryOptions={() => void loadOptions()}
        onClose={() => setPublishing(false)}
        onPublished={() => {
          setPublishing(false);
          setOk(crewFeedLabels.published);
          void load();
        }}
      />
    </section>
  );
}
