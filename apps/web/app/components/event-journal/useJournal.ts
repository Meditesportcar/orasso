// Le journal d'un événement sur le site (`GET /events/:id/feed-posts`, lu dans le navigateur avec le cookie de session s'il y en a
// une). La première page vient du chargeur de la page (rendu serveur) ; la suite par curseur et les relectures (après une
// épingle) se font ici. Avec une session, des `FeedPostView` ; sans, des `PublicPostView` mis au même format. Seule la dernière
// lecture compte ; une panne n'est jamais une liste vide.
import { appendUnique, type FeedPostView, type PublicPostView, publicToFeedPost } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { onPostRemoved } from "../publications/signal";

export type JournalPage = { items: (FeedPostView | PublicPostView)[]; nextCursor: string | null };
export const isPublic = (p: FeedPostView | PublicPostView): p is PublicPostView => !("mine" in p);
export const toFeedPosts = (items: JournalPage["items"]): FeedPostView[] =>
  items.map((p) => (isPublic(p) ? publicToFeedPost(p) : p));

const pathOf = (eventId: string, cursor: string | null) =>
  `/events/${encodeURIComponent(eventId)}/feed-posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;

export function useJournal(eventId: string, initial: { items: FeedPostView[]; nextCursor: string | null }) {
  const [items, setItems] = useState<FeedPostView[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setError(null);
    const res = await apiFetch<JournalPage>(pathOf(eventId, null));
    if (mine !== seq.current) return;
    if (!res.ok) return setError(res.error.message);
    setItems(toFeedPosts(res.data.items));
    setNextCursor(res.data.nextCursor);
  }, [eventId]);

  const more = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const mine = ++seq.current;
    setLoadingMore(true);
    setError(null);
    const res = await apiFetch<JournalPage>(pathOf(eventId, nextCursor));
    if (mine !== seq.current) return;
    setLoadingMore(false);
    if (!res.ok) return setError(res.error.message);
    setItems((s) => appendUnique(s, toFeedPosts(res.data.items)));
    setNextCursor(res.data.nextCursor);
  }, [eventId, nextCursor, loadingMore]);

  // Une publication supprimée ailleurs (sa page seule) : elle sort de la liste sans relecture.
  useEffect(
    () => onPostRemoved((id) => setItems((s) => (s.some((p) => p.id === id) ? s.filter((p) => p.id !== id) : s))),
    [],
  );

  return { items, nextCursor, loadingMore, error, reload, more };
}
