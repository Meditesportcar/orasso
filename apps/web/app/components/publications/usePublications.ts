// La liste des publications d'un auteur sur le site (`GET /authors/:key/feed-posts`, lue dans le navigateur avec le cookie de
// session), page par page (curseur opaque). Ne sait rien du profil : une clé d'auteur suffit. Seule la dernière lecture compte ;
// une panne n'est jamais une liste vide ; une liste restreinte (compte privé non suivi) n'a ni élément ni curseur.
import { type AuthorPostsFilter, type AuthorPostsPage, appendUnique, type FeedPostView } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { onPostRemoved } from "./signal";

export type PublicationsState = {
  items: FeedPostView[];
  nextCursor: string | null;
  restricted: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loaded: boolean;
};

const EMPTY: PublicationsState = {
  items: [],
  nextCursor: null,
  restricted: false,
  loading: true,
  loadingMore: false,
  error: null,
  loaded: false,
};

const pathOf = (key: string, cursor: string | null, filter?: AuthorPostsFilter) => {
  const q = new URLSearchParams();
  if (cursor) q.set("cursor", cursor);
  if (filter) q.set("filter", filter);
  const qs = q.toString();
  return `/authors/${encodeURIComponent(key)}/feed-posts${qs ? `?${qs}` : ""}`;
};

export function usePublications(authorKey: string, filter?: AuthorPostsFilter, enabled = true) {
  const [state, setState] = useState<PublicationsState>(EMPTY);
  const seq = useRef(0);
  const cursorRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: !s.loaded, error: null }));
    const res = await apiFetch<AuthorPostsPage>(pathOf(authorKey, null, filter));
    if (mine !== seq.current) return;
    if (!res.ok) return setState((s) => ({ ...s, loading: false, loadingMore: false, error: res.error.message }));
    cursorRef.current = res.data.nextCursor;
    setState({
      items: res.data.items,
      nextCursor: res.data.nextCursor,
      restricted: res.data.restricted,
      loading: false,
      loadingMore: false,
      error: null,
      loaded: true,
    });
  }, [authorKey, filter]);

  // Une autre clé ou un autre filtre : la liste repart de zéro (jamais les publications de l'auteur précédent).
  useEffect(() => {
    if (!enabled) return;
    cursorRef.current = null;
    setState(EMPTY);
    void reload();
    return () => {
      seq.current++;
    };
  }, [enabled, reload]);

  const more = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    const mine = seq.current;
    setState((s) => (s.loadingMore ? s : { ...s, loadingMore: true, error: null }));
    const res = await apiFetch<AuthorPostsPage>(pathOf(authorKey, cursor, filter));
    if (mine !== seq.current) return;
    if (!res.ok) return setState((s) => ({ ...s, loadingMore: false, error: res.error.message }));
    cursorRef.current = res.data.nextCursor;
    setState((s) => ({
      ...s,
      items: appendUnique(s.items, res.data.items),
      nextCursor: res.data.nextCursor,
      loadingMore: false,
      error: null,
    }));
  }, [authorKey, filter]);

  // Une publication supprimée (menu d'une carte, page seule) : elle sort de la liste sans relecture.
  useEffect(
    () =>
      onPostRemoved((id) =>
        setState((s) => (s.items.some((p) => p.id === id) ? { ...s, items: s.items.filter((p) => p.id !== id) } : s)),
      ),
    [],
  );

  return { ...state, reload, more };
}
