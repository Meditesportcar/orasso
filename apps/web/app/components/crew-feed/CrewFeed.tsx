// Le fil du crew sur le site (lot R5c1, maquette R5.7 onglet Fil) : une colonne centrale, les mêmes composants et les
// mêmes mots que l'appli. Lu dans le navigateur (`/api/crews/:id/feed`, cookie de session), 20 par page ; une erreur
// n'est jamais montrée comme un fil vide. Composant autonome, monté par la page du crew (onglet Fil, lot R5c2).
import { Button } from "@orasso/design-system/web";
import {
  type CrewFeedItem,
  type CrewFeedOuting,
  type CrewFeedPage,
  type CrewFireState,
  type CrewOutingView,
  type CrewPostOptions,
  type CrewPostView,
  crewFeedLabels,
  crewPageLabels,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import "../../styles/crew-feed.css";
import { apiFetch } from "../../lib/api.client";
import { PersonAvatar } from "../People";
import { CommentsDialog } from "./CommentsDialog";
import { AutoCard, PostCard } from "./PostCard";
import { PublishDialog } from "./PublishDialog";

export type CrewFeedCrew = { id: string; slug: string; archived?: boolean };

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
      setItems((current) => (from ? [...(current ?? []), ...res.data.items] : res.data.items));
      setCursor(res.data.nextCursor);
      setLoadError(null);
    },
    [crew.id],
  );

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

  const put = (post: CrewPostView | null, id: string) =>
    setItems((list) =>
      (list ?? []).flatMap((x) => {
        if (x.type !== "post" || x.post.id !== id) return [x];
        return post ? [{ ...x, post }] : [];
      }),
    );

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
