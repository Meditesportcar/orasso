// Le journal d'un événement (`GET /events/:id/feed-posts`), page par page (curseur opaque, 20 par page, l'épinglée en tête de la
// première). Avec une session, des `FeedPostView` ; sans, des `PublicPostView` mis au même format (`publicToFeedPost`). Une panne
// n'est jamais une liste vide. Les réponses d'un ancien compte ou d'une ancienne fiche sont ignorées (`requestGate`).
import { appendUnique, type FeedPostView, type PublicPostView, publicToFeedPost } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { onPostRemoved } from "@/features/publications/publicationsSignal";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";

export type JournalState = {
  items: FeedPostView[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loaded: boolean;
};

const EMPTY: JournalState = {
  items: [],
  nextCursor: null,
  loading: true,
  loadingMore: false,
  error: null,
  loaded: false,
};

/** Une ligne de la réponse : `PublicPostView` (sans session) n'a ni `mine` ni `reactedByMe`. */
const isPublic = (p: FeedPostView | PublicPostView): p is PublicPostView => !("mine" in p);

export function useJournal(eventId: string | null, enabled = true, refreshKey = 0) {
  const [state, setState] = useState<JournalState>(EMPTY);
  const gate = useRef(createRequestGate(cacheScope)).current;
  const cursorRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (!eventId) return;
    const ticket = gate.start();
    setState((s) => ({ ...s, loading: !s.loaded, error: null }));
    try {
      const page = await api.eventJournal(eventId, null);
      if (!ticket.current()) return;
      cursorRef.current = page.nextCursor;
      setState({
        items: page.items.map((p) => (isPublic(p) ? publicToFeedPost(p) : p)),
        nextCursor: page.nextCursor,
        loading: false,
        loadingMore: false,
        error: null,
        loaded: true,
      });
    } catch (e) {
      if (!ticket.current()) return;
      setState((s) => ({ ...s, loading: false, loadingMore: false, error: errorMessage(e) }));
    }
  }, [eventId, gate]);

  useEffect(() => {
    if (!enabled || !eventId) return;
    cursorRef.current = null;
    setState(EMPTY);
    void reload();
    return () => gate.invalidate();
  }, [enabled, eventId, reload, gate]);

  // Actualisation manuelle de la fiche : la liste se relit.
  const firstKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey !== firstKey.current && enabled) void reload();
  }, [refreshKey, enabled, reload]);

  const more = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor || !eventId) return;
    const ticket = gate.follow();
    setState((s) => (s.loadingMore ? s : { ...s, loadingMore: true, error: null }));
    try {
      const page = await api.eventJournal(eventId, cursor);
      if (!ticket.current()) return;
      cursorRef.current = page.nextCursor;
      setState((s) => ({
        ...s,
        items: appendUnique(
          s.items,
          page.items.map((p) => (isPublic(p) ? publicToFeedPost(p) : p)),
        ),
        nextCursor: page.nextCursor,
        loadingMore: false,
        error: null,
      }));
    } catch (e) {
      if (!ticket.current()) return;
      setState((s) => ({ ...s, loadingMore: false, error: errorMessage(e) }));
    }
  }, [eventId, gate]);

  // Une publication supprimée ailleurs (sa page seule) : elle sort de la liste sans relecture.
  useEffect(
    () =>
      onPostRemoved((id) =>
        setState((s) => (s.items.some((p) => p.id === id) ? { ...s, items: s.items.filter((p) => p.id !== id) } : s)),
      ),
    [],
  );

  return { ...state, reload, more };
}
