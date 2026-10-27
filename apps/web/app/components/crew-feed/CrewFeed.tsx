// Le fil du crew sur le site (lot R5c1, maquette R5.7 onglet Fil) : une colonne centrale, les mêmes composants et les
// mêmes mots que l'appli. Lu dans le navigateur (`/api/crews/:id/feed`, cookie de session), 20 par page ; une erreur
// n'est jamais montrée comme un fil vide. Composant autonome, monté par la page du crew (onglet Fil, lot R5c2).
import { Button, Icon } from "@orasso/design-system/web";
import {
  type CrewFeedItem,
  type CrewFeedOuting,
  type CrewFeedPage,
  type CrewFireState,
  type CrewOutingView,
  type CrewPostOptions,
  type CrewPostView,
  crewFeedLabels,
  crewLivePillLabel,
  crewPageLabels,
  mergeCrewFeedHead,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import "../../styles/crew-feed.css";
import { apiFetch } from "../../lib/api.client";
import { PersonAvatar } from "../People";
import { CommentsDialog } from "./CommentsDialog";
import { useCrewLiveNeeds } from "./CrewLive";
import { AutoCard, PostCard } from "./PostCard";
import { PublishDialog } from "./PublishDialog";

export type CrewFeedCrew = { id: string; slug: string; archived?: boolean };

/** Une page suivante s'ajoute sans doublon (une entrée relue en direct peut déjà être là). */
function appendByKey(current: readonly CrewFeedItem[], next: readonly CrewFeedItem[]): CrewFeedItem[] {
  const seen = new Set(current.map((i) => i.key));
  return [...current, ...next.filter((i) => !seen.has(i.key))];
}

export function CrewFeed({ crew }: { crew: CrewFeedCrew }) {
  const [items, setItems] = useState<CrewFeedItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [options, setOptions] = useState<CrewPostOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [comments, setComments] = useState<CrewPostView | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Seule la dernière lecture compte.
  const seq = useRef(0);

  // Lot R6a : la première page relue en direct dont les nouvelles entrées attendent (loin du haut du fil : la pastille).
  const [held, setHeld] = useState<CrewFeedPage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (from?: string) => {
      const mine = from ? seq.current : ++seq.current;
      if (from) setLoadingMore(true);
      const res = await apiFetch<CrewFeedPage>(
        `/crews/${crew.id}/feed${from ? `?cursor=${encodeURIComponent(from)}` : ""}`,
      );
      setLoadingMore(false);
      if (mine !== seq.current) return;
      if (!res.ok) {
        setLoadError(res.error.message);
        return;
      }
      setItems((current) => (from ? appendByKey(current ?? [], res.data.items) : res.data.items));
      setCursor(res.data.nextCursor);
      setLoadError(null);
      if (!from) setHeld(null);
    },
    [crew.id],
  );

  /** Le haut du fil est à l'écran (ou plus bas) : une nouvelle entrée s'insère sans faire sauter la liste. */
  const atTop = () => (listRef.current?.getBoundingClientRect().top ?? 0) >= -8;

  /** Applique une première page relue : nombres à jour, retraits ; les nouvelles entrées en haut, ou à la pastille. */
  const applyHead = (head: CrewFeedPage, insert: boolean) => {
    setItems((current) =>
      current ? mergeCrewFeedHead(current, head.items, { complete: head.nextCursor === null, insert }).items : current,
    );
    setHeld(insert ? null : head);
  };
  const known = new Set((items ?? []).map((i) => i.key));
  const fresh = held ? held.items.filter((i) => !known.has(i.key)) : [];

  useCrewLiveNeeds(async (needs) => {
    for (const id of needs.removedPosts) put(null, id);
    if (comments && needs.removedPosts.includes(comments.id)) setComments(null);
    if (needs.head && items !== null) {
      const mine = seq.current;
      const res = await apiFetch<CrewFeedPage>(`/crews/${crew.id}/feed`);
      if (res.ok && mine === seq.current) applyHead(res.data, atTop());
    }
    const shown = new Set((items ?? []).flatMap((i) => (i.type === "post" ? [i.post.id] : [])));
    for (const id of needs.posts) {
      if (needs.removedPosts.includes(id) || !shown.has(id)) continue;
      const res = await apiFetch<CrewPostView>(`/crews/${crew.id}/posts/${id}`);
      if (res.ok) put(res.data, id);
      else if (res.status === 404) put(null, id);
    }
  }, !crew.archived);

  /** La pastille : les nouvelles entrées s'affichent, la page remonte au haut du fil. */
  const showFresh = () => {
    if (held) applyHead(held, true);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    listRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const pill = crewLivePillLabel(fresh);

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

  const put = (post: CrewPostView | null, id: string) => {
    // Lot R6a : rien à changer tant que le fil n'est pas lu (un signal ne fait pas croire à un fil vide).
    setItems((list) =>
      list
        ? list.flatMap((x) => {
            if (x.type !== "post" || x.post.id !== id) return [x];
            return post ? [{ ...x, post }] : [];
          })
        : list,
    );
    // Une publication retirée n'est plus une nouveauté de la pastille.
    if (!post) setHeld((h) => h && { ...h, items: h.items.filter((i) => i.type !== "post" || i.post.id !== id) });
  };

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
      const next = { ...o, yes: res.data.yes, maybe: res.data.maybe, mine: res.data.mine };
      setItems((current) =>
        (current ?? []).map((x) => (x.type === "crew_outing" && x.outing.id === o.id ? { ...x, outing: next } : x)),
      );
      setOk(crewPageLabels.feedOutingYesToast(o.title));
      return null;
    });
  const fire = (p: CrewPostView) =>
    act(p.id, async () => {
      const on = !p.firedByMe;
      put({ ...p, firedByMe: on, firesCount: p.firesCount + (on ? 1 : -1) }, p.id);
      const res = await apiFetch<CrewFireState>(`/crews/${crew.id}/posts/${p.id}/reaction`, {
        method: on ? "PUT" : "DELETE",
      });
      put(res.ok ? { ...p, ...res.data } : p, p.id);
      return res.ok ? null : res.error.message;
    });
  const vote = (p: CrewPostView, optionId: string) =>
    act(p.id, async () => {
      const res = await apiFetch<CrewPostView>(`/crews/${crew.id}/posts/${p.id}/vote`, {
        method: "PUT",
        json: { optionId },
      });
      if (res.ok) put(res.data, p.id);
      return res.ok ? null : res.error.message;
    });
  const closePoll = (p: CrewPostView) =>
    act(p.id, async () => {
      const res = await apiFetch<CrewPostView>(`/crews/${crew.id}/posts/${p.id}/close`, { method: "POST" });
      if (res.ok) {
        put(res.data, p.id);
        setOk(crewFeedLabels.pollClosedToast);
      }
      return res.ok ? null : res.error.message;
    });
  const remove = (p: CrewPostView) => {
    if (!window.confirm(crewFeedLabels.removePostConfirm)) return;
    void act(p.id, async () => {
      const res = await apiFetch(`/crews/${crew.id}/posts/${p.id}`, { method: "DELETE" });
      if (res.ok) {
        put(null, p.id);
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
          onClick={() => void load(cursor)}
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
        onCount={(id, delta) =>
          setItems((list) =>
            (list ?? []).map((x) =>
              x.type === "post" && x.post.id === id
                ? { ...x, post: { ...x.post, commentsCount: Math.max(0, x.post.commentsCount + delta) } }
                : x,
            ),
          )
        }
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
