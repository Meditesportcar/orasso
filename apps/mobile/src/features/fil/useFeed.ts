// Le Fil tel que l'écran le tient (lot R7e2) : la liste du filtre choisi, le curseur (opaque : renvoyé tel quel, jamais
// analysé), les lectures de la première page et des suivantes. Règles :
// - toute lecture passe par `requestGate` : seule la dernière compte, et seulement pour son compte (un changement de
//   filtre ou de compte jette les réponses en cours) ;
// - `reset: true` (le contexte de la personne a changé en plein parcours) : la liste est remplacée, jamais complétée,
//   et l'écran remonte en haut (`applyFeedPage`) ;
// - un curseur refusé (400) : la première page est relue ; une erreur n'est jamais une liste vide (message et « Réessayer ») ;
// - le filtre choisi est mémorisé par compte.
import {
  applyFeedPage,
  emptyFeedList,
  type FeedCard,
  type FeedErrorSource,
  type FeedFilter,
  type FeedListState,
  feedFilters,
  feedRetryAction,
  withMyPublished,
} from "@orasso/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { shouldRevalidate } from "@/features/explorer/usePaged";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { cacheGetJson, cacheScope, cacheSetJson } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";
import { forgetMyPublished, myPublishedCards, takeFeedDirty } from "./feedSignal";

const FILTER_KEY = "fil-filter";

export function useFeed() {
  const [filter, setFilterState] = useState<FeedFilter>("for_you");
  const [list, setList] = useState<FeedListState | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** D'où vient l'erreur affichée : « Réessayer » relance l'actualisation, ou « Voir plus », selon l'échec. */
  const [errorSource, setErrorSource] = useState<FeedErrorSource | null>(null);
  /** Mes publications de cette session, gardées en tête de la liste affichée. */
  const [mine, setMine] = useState<FeedCard[]>(() => myPublishedCards());
  const [loadingMore, setLoadingMore] = useState(false);
  /** Un compteur : change à chaque `reset` de l'API (l'écran remonte en haut). */
  const [scrollTop, setScrollTop] = useState(0);
  const gate = useRef(createRequestGate(cacheScope)).current;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const listRef = useRef(list);
  listRef.current = list;
  const lastOk = useRef(0);
  const busy = useRef(false);
  const errorRef = useRef(error);
  errorRef.current = error;
  // Le filtre mémorisé est lu une fois par compte ; avant, aucune lecture ne part (pas de double lecture au démarrage).
  const [ready, setReady] = useState(false);

  const account = cacheScope();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `account` relance la lecture du filtre mémorisé après un changement de compte.
  useEffect(() => {
    gate.invalidate();
    setList(null);
    setError(null);
    setErrorSource(null);
    forgetMyPublished();
    setMine([]);
    setReady(false);
    let cancelled = false;
    void cacheGetJson<FeedFilter>(FILTER_KEY).then((saved) => {
      if (cancelled) return;
      if (saved && (feedFilters as readonly string[]).includes(saved)) setFilterState(saved);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [account, gate]);

  /** Première page du filtre courant (ou d'un filtre donné). */
  const reload = useCallback(
    async (which?: FeedFilter) => {
      const f = which ?? filterRef.current;
      const ticket = gate.start();
      busy.current = true;
      try {
        const page = await api.feed(f, null);
        if (!ticket.current()) return;
        const applied = applyFeedPage(emptyFeedList(f), page, null);
        if (!applied) return;
        lastOk.current = Date.now();
        setList(applied.state);
        setError(null);
        setErrorSource(null);
      } catch (e) {
        if (ticket.current()) {
          setError(errorMessage(e));
          setErrorSource("reload");
        }
      } finally {
        if (ticket.latest()) busy.current = false;
      }
    },
    [gate],
  );

  const loadMore = useCallback(async () => {
    const current = listRef.current;
    if (!current?.nextCursor) return;
    const sent = current.nextCursor;
    const ticket = gate.follow();
    setLoadingMore(true);
    try {
      const page = await api.feed(current.filter, sent);
      if (!ticket.current()) return;
      const latest = listRef.current;
      // Le curseur a changé entre-temps (une relecture, un autre filtre) : cette page ne vaut plus.
      if (!latest || latest.nextCursor !== sent) return;
      const applied = applyFeedPage(latest, page, sent);
      if (!applied) return;
      lastOk.current = Date.now();
      setList(applied.state);
      if (applied.scrollTop) setScrollTop((n) => n + 1);
      setError(null);
      setErrorSource(null);
    } catch (e) {
      if (!ticket.current()) return;
      // Curseur d'une autre version ou abîmé (400) : la première page est relue.
      if (e instanceof ApiRequestError && e.status === 400) void reload();
      else {
        setError(errorMessage(e));
        setErrorSource("more");
      }
    } finally {
      setLoadingMore(false);
    }
  }, [gate, reload]);

  // Première lecture, et à chaque changement de filtre (la liste de l'ancien filtre ne reste pas affichée).
  // biome-ignore lint/correctness/useExhaustiveDependencies: le filtre et le compte relancent la lecture.
  useEffect(() => {
    if (!ready) return;
    setList(null);
    setError(null);
    setErrorSource(null);
    void reload(filter);
  }, [ready, filter, account, reload]);

  const setFilter = useCallback((next: FeedFilter) => {
    if (next === filterRef.current) return;
    setFilterState(next);
    void cacheSetJson(FILTER_KEY, next);
  }, []);

  // Retour sur l'écran : une liste en échec ou ancienne se relit (« Moins de ce genre » joue à ce parcours-là).
  const revalidate = useCallback(() => {
    const s = {
      busy: busy.current,
      pending: false,
      enabled: ready,
      error: errorRef.current,
      lastOk: lastOk.current,
    };
    // Une publication vient de partir : elle passe en tête, et le Fil se relit tout de suite.
    setMine(myPublishedCards());
    if (takeFeedDirty() || shouldRevalidate(s, Date.now())) void reload();
  }, [ready, reload]);
  useFocusEffect(revalidate);

  const shown: FeedCard[] | null = list && list.filter === filter ? list.items : null;
  const items: FeedCard[] | null = shown ? withMyPublished(shown, mine) : null;
  /** « Réessayer » : relit la première page après un échec d'actualisation, la page suivante après un échec de « Voir plus ». */
  const retry = useCallback(
    () => (feedRetryAction(errorSource) === "loadMore" ? loadMore() : reload()),
    [errorSource, loadMore, reload],
  );
  return {
    filter,
    setFilter,
    items,
    hasMore: Boolean(list?.nextCursor) && list?.filter === filter,
    loadingMore,
    error,
    reload,
    loadMore,
    retry,
    errorSource,
    scrollTop,
    /** Une carte sort de la liste (publication supprimée). */
    drop: (id: string) => {
      forgetMyPublished(id);
      setMine((m) => m.filter((c) => c.id !== id));
      setList((s) => (s ? { ...s, items: s.items.filter((c) => c.id !== id) } : s));
    },
  };
}
