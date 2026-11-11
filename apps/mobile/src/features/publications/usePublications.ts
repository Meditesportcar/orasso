// La liste des publications d'un auteur (`GET /authors/:key/feed-posts`), page par page (curseur opaque, 20 par page). Ne sait
// rien du profil : une clé d'auteur suffit (les pages de structure, de pro et la fiche d'un événement la reprendront).
// Une panne n'est jamais une liste vide ; une liste restreinte (compte privé non suivi) n'a ni élément ni curseur.
import { type AuthorPostsFilter, appendUnique, type FeedPostView } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";
import { onPostChanged, onPostRemoved } from "./publicationsSignal";

export type PublicationsState = {
  items: FeedPostView[];
  nextCursor: string | null;
  /** Liste restreinte : compte privé que je ne suis pas (même réponse qu'il ait publié ou non). */
  restricted: boolean;
  /** Première lecture en cours (rien à montrer encore). */
  loading: boolean;
  /** La suite est en cours de lecture. */
  loadingMore: boolean;
  /** La dernière lecture a échoué (la liste déjà lue reste affichée). */
  error: string | null;
  /** La première lecture a abouti au moins une fois. */
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

export function usePublications(authorKey: string, filter?: AuthorPostsFilter, enabled = true) {
  const [state, setState] = useState<PublicationsState>(EMPTY);
  const gate = useRef(createRequestGate(cacheScope)).current;
  const cursorRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const ticket = gate.start();
    setState((s) => ({ ...s, loading: !s.loaded, error: null }));
    try {
      const page = await api.authorPosts(authorKey, null, filter);
      if (!ticket.current()) return;
      cursorRef.current = page.nextCursor;
      setState({
        items: page.items,
        nextCursor: page.nextCursor,
        restricted: page.restricted,
        loading: false,
        loadingMore: false,
        error: null,
        loaded: true,
      });
    } catch (e) {
      if (!ticket.current()) return;
      setState((s) => ({ ...s, loading: false, loadingMore: false, error: errorMessage(e) }));
    }
  }, [authorKey, filter, gate]);

  // Une autre clé ou un autre filtre : la liste repart de zéro (jamais les publications de l'auteur précédent).
  useEffect(() => {
    if (!enabled) return;
    cursorRef.current = null;
    setState(EMPTY);
    void reload();
    return () => gate.invalidate();
  }, [enabled, reload, gate]);

  // Collaboration (R8o) : un co-auteur retiré ou une invitation annulée change les deux listes de la publication.
  useEffect(() => {
    if (!enabled) return;
    return onPostChanged(() => void reload());
  }, [enabled, reload]);

  const more = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    const ticket = gate.follow();
    setState((s) => (s.loadingMore ? s : { ...s, loadingMore: true, error: null }));
    try {
      const page = await api.authorPosts(authorKey, cursor, filter);
      if (!ticket.current()) return;
      cursorRef.current = page.nextCursor;
      setState((s) => ({
        ...s,
        items: appendUnique(s.items, page.items),
        nextCursor: page.nextCursor,
        loadingMore: false,
        error: null,
      }));
    } catch (e) {
      if (!ticket.current()) return;
      setState((s) => ({ ...s, loadingMore: false, error: errorMessage(e) }));
    }
  }, [authorKey, filter, gate]);

  // Une publication supprimée ailleurs (sa page seule) : elle sort de la liste sans relecture.
  useEffect(
    () =>
      onPostRemoved((id) =>
        setState((s) => (s.items.some((p) => p.id === id) ? { ...s, items: s.items.filter((p) => p.id !== id) } : s)),
      ),
    [],
  );

  const change = useCallback((post: FeedPostView) => {
    setState((s) => ({ ...s, items: s.items.map((p) => (p.id === post.id ? post : p)) }));
  }, []);

  return { ...state, reload, more, change };
}
