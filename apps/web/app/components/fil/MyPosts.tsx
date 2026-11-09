// « Mes publications » sur le site : `GET /me/feed-posts` (curseur), une carte par publication, « Supprimer » (confirmé).
// Une erreur n'est jamais une liste vide.
import { Button } from "@orasso/design-system/web";
import { type FeedPostView, feedAgo, feedScreenLabels as L, type Page } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import "../../styles/fil.css";
import { apiFetch } from "../../lib/api.client";
import { FicheBar } from "../FicheBar";
import { FeedPhotos } from "./Cards";
import { forgetPublished } from "./mine";

export function MyPosts() {
  const [items, setItems] = useState<FeedPostView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const res = await apiFetch<Page<FeedPostView>>("/me/feed-posts");
    if (mine !== seq.current) return;
    if (!res.ok) return setError(res.error.message);
    setItems(res.data.items);
    setCursor(res.data.nextCursor);
    setError(null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function more() {
    if (!cursor) return;
    const res = await apiFetch<Page<FeedPostView>>(`/me/feed-posts?cursor=${encodeURIComponent(cursor)}`);
    if (!res.ok) return setError(res.error.message);
    setItems((list) => {
      const seen = new Set((list ?? []).map((p) => p.id));
      return [...(list ?? []), ...res.data.items.filter((p) => !seen.has(p.id))];
    });
    setCursor(res.data.nextCursor);
  }

  async function remove(post: FeedPostView) {
    if (!window.confirm(L.removeConfirm)) return;
    const res = await apiFetch(`/me/feed-posts/${post.id}`, { method: "DELETE" });
    if (!res.ok) return setNotice(res.error.message);
    // La copie gardée dans l'onglet part aussi : le Fil ne remet pas en tête une publication qui n'existe plus.
    forgetPublished(post.id);
    setItems((list) => (list ?? []).filter((p) => p.id !== post.id));
    setNotice(L.removeDone);
  }

  return (
    <div className="fil" data-testid="fil-mine">
      <FicheBar title={L.mineTitle} back="/app/moi" />
      {items === null && !error ? <p className="o-t-caption">{L.loadingMore}</p> : null}
      {error && !items?.length ? (
        <div className="fil-error" role="alert" data-testid="load-error">
          <p className="o-t-body">{error}</p>
          <Button variant="secondary" icon="undo" onClick={() => void load()}>
            {L.retry}
          </Button>
        </div>
      ) : null}
      {items && items.length === 0 && !error ? (
        <div className="fil-empty" data-testid="fil-mine-empty">
          <h2 className="s-h2">{L.mineEmpty}</h2>
          <p className="o-t-body">{L.mineEmptyText}</p>
          <a className="fil-publish" href="/app/fil/publier">
            {L.publish}
          </a>
        </div>
      ) : null}
      {notice ? (
        <p className="o-t-caption" role="alert" data-testid="fil-mine-notice">
          {notice}
        </p>
      ) : null}
      {items?.map((post) => (
        <article key={post.id} className="fil-card" data-testid="fil-mine-post">
          <FeedPhotos post={post} />
          {post.caption ? <p className="o-t-body">{post.caption}</p> : null}
          <div className="fil-card__actions">
            <span className="o-t-caption">
              {post.reactionsCount} · {feedAgo(post.createdAt, new Date())}
            </span>
            <Button variant="secondary" icon="trash" onClick={() => void remove(post)} data-testid="fil-mine-remove">
              {L.removePost}
            </Button>
          </div>
        </article>
      ))}
      {cursor ? (
        <Button variant="secondary" icon="down" onClick={() => void more()} data-testid="fil-mine-more">
          {L.loadMore}
        </Button>
      ) : null}
      {items?.length ? <p className="o-t-caption">{L.mineNote}</p> : null}
    </div>
  );
}
