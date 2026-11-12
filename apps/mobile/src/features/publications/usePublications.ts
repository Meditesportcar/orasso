// La liste des publications d'un auteur (`GET /authors/:key/feed-posts`), page par page (curseur opaque, 20 par page). Ne sait
// rien du profil : une clé d'auteur suffit (les pages de structure, de pro et la fiche d'un événement la reprendront).
// Une panne n'est jamais une liste vide ; une liste restreinte (compte privé non suivi) n'a ni élément ni curseur.
import { type AuthorPostsFilter, applyNextPage, type FeedPostView } from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { readCopy, saveCopy } from "@/lib/offlineCopy";
import { createRequestGate } from "@/lib/requestGate";
import { onPostChanged, onPostRemoved } from "./publicationsSignal";
import { type FailedCall, retryCall } from "./retryCall";

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
  /** La liste vient de la copie gardée sur l'appareil (sans réseau), pas de l'API. */
  stale: boolean;
};

const EMPTY: PublicationsState = {
  items: [],
  nextCursor: null,
  restricted: false,
  loading: true,
  loadingMore: false,
  error: null,
  loaded: false,
  stale: false,
};

/** La copie hors ligne de ma première page (rangée par compte par `offlineCopy`). */
export const MY_PUBLICATIONS_COPY = "publications.mine";
type Copied = { items: FeedPostView[]; restricted: boolean };

/**
 * `offline` : **mon** profil seulement (jamais celui d'un autre) : la première page est gardée dans la copie du compte ; sans
 * réseau elle s'affiche, même ancienne ; au retour du réseau elle se recharge seule.
 */
export function usePublications(authorKey: string, filter?: AuthorPostsFilter, enabled = true, offline = false) {
  const [state, setState] = useState<PublicationsState>(EMPTY);
  const gate = useRef(createRequestGate(cacheScope)).current;
  const cursorRef = useRef<string | null>(null);
  /** Quel appel a échoué en dernier : « Réessayer » relance celui-là (une relecture garde son ancien curseur). */
  const failedRef = useRef<FailedCall | null>(null);

  const reload = useCallback(async () => {
    const ticket = gate.start();
    failedRef.current = null;
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
        stale: false,
      });
      if (offline && !filter)
        void saveCopy(MY_PUBLICATIONS_COPY, { items: page.items, restricted: page.restricted } satisfies Copied, now());
    } catch (e) {
      if (!ticket.current()) return;
      const copy = offline && !filter ? await readCopy<Copied>(MY_PUBLICATIONS_COPY) : null;
      if (!ticket.current()) return;
      if (copy) {
        cursorRef.current = null;
        setState({
          ...EMPTY,
          items: copy.value.items,
          restricted: copy.value.restricted,
          loading: false,
          loaded: true,
          stale: true,
        });
        return;
      }
      failedRef.current = "reload";
      setState((s) => ({ ...s, loading: false, loadingMore: false, error: errorMessage(e) }));
    }
  }, [authorKey, filter, gate, offline]);

  // Retour du réseau : la copie affichée se recharge toute seule.
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const stale = state.stale;
  const wasOnline = useRef(online);
  useEffect(() => {
    // Seulement au passage hors ligne → en ligne : une copie affichée parce que l'API a échoué en ligne ne se relit pas en boucle.
    if (online && !wasOnline.current && stale) void reload();
    wasOnline.current = online;
  }, [online, stale, reload]);

  // Retour sur l'écran (après « Publier ») : ma liste se relit, la nouvelle publication y est. Seulement chez moi.
  const focused = useIsFocused();
  const wasFocused = useRef(true);
  useEffect(() => {
    if (focused && !wasFocused.current && offline && enabled) void reload();
    wasFocused.current = focused;
  }, [focused, offline, enabled, reload]);

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
    failedRef.current = null;
    setState((s) => (s.loadingMore ? s : { ...s, loadingMore: true, error: null }));
    try {
      const page = await api.authorPosts(authorKey, cursor, filter);
      if (!ticket.current()) return;
      cursorRef.current = page.nextCursor;
      // L'accès a disparu entre deux pages : la restriction vaut pour toute la liste (`applyNextPage`).
      cursorRef.current = page.restricted ? null : page.nextCursor;
      setState((s) => ({ ...s, ...applyNextPage(s, page), loadingMore: false, error: null }));
    } catch (e) {
      if (!ticket.current()) return;
      failedRef.current = "more";
      setState((s) => ({ ...s, loadingMore: false, error: errorMessage(e) }));
    }
  }, [authorKey, filter, gate]);

  /** « Réessayer » : relit après l'échec d'une relecture, redemande la page suivante après l'échec d'une page suivante. */
  const retry = useCallback(() => (retryCall(failedRef.current) === "more" ? more() : reload()), [more, reload]);

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

  return { ...state, reload, more, retry, change };
}
