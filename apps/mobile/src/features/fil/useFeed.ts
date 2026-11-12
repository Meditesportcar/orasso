// Le Fil tel que l'écran le tient (lot R7e2, repris par le lot R8c2) : la liste du filtre choisi, le curseur (opaque : renvoyé
// tel quel, jamais analysé), les lectures de la première page et des suivantes. Règles :
// - toute lecture passe par `requestGate` : seule la dernière compte, et seulement pour son compte (un changement de
//   filtre ou de compte jette les réponses en cours) ;
// - `reset: true` (le contexte de la personne a changé en plein parcours) : la liste est remplacée, jamais complétée,
//   et l'écran remonte en haut (`applyFeedPage`) ;
// - un curseur refusé (400) : la première page est relue ; une erreur n'est jamais une liste vide (message et « Réessayer ») ;
// - le filtre choisi est mémorisé par compte ;
// - (R8c2) ma publication n'est en tête qu'à l'envoi : elle reprend sa place dès que je quitte le Fil ou que j'actualise ;
// - (R8c2) chaque première page reçue est copiée par onglet (40 cartes, sans rendez-vous au spot ni sponsorisé) ; sans réseau,
//   la copie s'affiche, même ancienne, même déjà vue ; le retour du réseau relit la liste ou, si l'on a défilé, propose la pastille ;
// - (R8c2) « Nouvelles publications » : `GET /fil/fresh` toutes les 60 s, Fil au premier plan et appli active.
import {
  applyFeedPage,
  emptyFeedList,
  type FeedCard,
  type FeedErrorSource,
  type FeedFilter,
  type FeedListState,
  feedCopyCards,
  feedCopyKey,
  feedFilters,
  feedRetryAction,
  justPublished,
  parseFeedCopy,
  sponsoredNotBeforeFourth,
  withMyPublished,
  withoutPlacement,
} from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useFocusEffect, useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { shouldRevalidate } from "@/features/explorer/usePaged";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage, NETWORK_MESSAGE } from "@/lib/http";
import { cacheGetJson, cacheScope, cacheSetJson } from "@/lib/kv";
import { readCopy, saveCopy } from "@/lib/offlineCopy";
import { createRequestGate } from "@/lib/requestGate";
import { resetWantedPhotos, setWantedPhotos } from "./copyPhotos";
import { forgetMyPublished, myPublishedCards, takeFeedDirty } from "./feedSignal";

const FILTER_KEY = "fil-filter";
/** « Nouvelles publications » : une lecture par minute. */
const FRESH_EVERY_MS = 60_000;

/** L'appli est-elle au premier plan ? (pas de lecture des nouveautés en arrière-plan) */
function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);
  return active;
}

async function dropFromCopies(id: string): Promise<void> {
  for (const f of feedFilters) {
    const saved = await readCopy<{ filter: FeedFilter; items: FeedCard[] }>(feedCopyKey(f));
    const items = saved?.value.items;
    if (saved && Array.isArray(items) && items.some((c) => c.id === id)) {
      const left = items.filter((c) => c.id !== id);
      setWantedPhotos(f, left);
      await saveCopy(feedCopyKey(f), { ...saved.value, items: left }, new Date(saved.savedAt));
    }
  }
}

export function useFeed() {
  const [filter, setFilterState] = useState<FeedFilter>("for_you");
  const [list, setList] = useState<FeedListState | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** D'où vient l'erreur affichée : « Réessayer » relance l'actualisation, ou « Voir plus », selon l'échec. */
  const [errorSource, setErrorSource] = useState<FeedErrorSource | null>(null);
  /** Mes publications juste envoyées, gardées en tête de la liste affichée tant que je suis sur le Fil. */
  const [mine, setMine] = useState<FeedCard[]>(() => myPublishedCards());
  const [loadingMore, setLoadingMore] = useState(false);
  /** Un compteur : change à chaque `reset` de l'API (l'écran remonte en haut). */
  const [scrollTop, setScrollTop] = useState(0);
  /** Hors ligne : la copie gardée du filtre, montrée à la place de la liste. */
  const [copy, setCopy] = useState<{ filter: FeedFilter; items: FeedCard[]; savedAt: string } | null>(null);
  /** La pastille « Nouvelles publications » : des nouveautés (`count`), ou le retour du réseau pendant qu'on lisait la copie. */
  const [fresh, setFresh] = useState(0);
  /** Change à chaque liste remplacée (première page, actualisation) : repart le suivi des cartes vues. */
  const [round, setRound] = useState(0);
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

  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const focused = useIsFocused();
  const appActive = useAppActive();

  const account = cacheScope();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `account` relance la lecture du filtre mémorisé après un changement de compte.
  useEffect(() => {
    gate.invalidate();
    setList(null);
    setError(null);
    setErrorSource(null);
    setCopy(null);
    setFresh(0);
    forgetMyPublished();
    setMine([]);
    setReady(false);
    // Les photos de la copie : ce que chaque copie garde est relu une fois par compte, puis les photos périmées ou orphelines partent.
    resetWantedPhotos();
    void (async () => {
      for (const f of feedFilters) {
        const saved = await readCopy<unknown>(feedCopyKey(f));
        setWantedPhotos(
          f,
          (saved ? parseFeedCopy(saved.value, f) : null) ?? [],
          f === feedFilters[feedFilters.length - 1],
        );
      }
    })();
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

  /** La copie gardée de ce filtre, si elle existe : vrai quand elle est affichée. */
  const showCopy = useCallback(async (f: FeedFilter, current: () => boolean): Promise<boolean> => {
    const saved = await readCopy<unknown>(feedCopyKey(f));
    if (!current()) return true;
    const items = saved ? parseFeedCopy(saved.value, f) : null;
    if (!saved || !items?.length) return false;
    setCopy({ filter: f, items, savedAt: saved.savedAt });
    setList(null);
    setError(null);
    setErrorSource(null);
    setRound((n) => n + 1);
    return true;
  }, []);

  /** Première page du filtre courant (ou d'un filtre donné). */
  const reload = useCallback(
    async (which?: FeedFilter) => {
      const f = which ?? filterRef.current;
      const ticket = gate.start();
      busy.current = true;
      try {
        // Sans réseau, on ne tente rien : la copie, ou l'erreur avec « Réessayer ».
        if (!onlineRef.current) {
          if (await showCopy(f, ticket.current)) return;
          if (ticket.current()) {
            setError(NETWORK_MESSAGE);
            setErrorSource("reload");
          }
          return;
        }
        const page = await api.feed(f, null);
        if (!ticket.current()) return;
        const applied = applyFeedPage(emptyFeedList(f), page, null);
        if (!applied) return;
        lastOk.current = Date.now();
        setCopy(null);
        setFresh(0);
        setList(applied.state);
        setError(null);
        setErrorSource(null);
        setRound((n) => n + 1);
        // La première page reçue est gardée pour le prochain passage sans réseau (jamais mes cartes épinglées).
        const copyCards = feedCopyCards(applied.state.items);
        setWantedPhotos(f, copyCards);
        void saveCopy(feedCopyKey(f), { filter: f, items: copyCards });
      } catch (e) {
        if (!ticket.current()) return;
        // Pas de réponse (hors ligne, API arrêtée) : la copie, même ancienne, plutôt qu'une erreur plein écran.
        if (e instanceof ApiRequestError && e.isNetwork && (await showCopy(f, ticket.current))) return;
        if (ticket.current()) {
          setError(errorMessage(e));
          setErrorSource("reload");
        }
      } finally {
        if (ticket.latest()) busy.current = false;
      }
    },
    [gate, showCopy],
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
      // Un `reset` en route : la liste est une autre, le suivi des cartes vues et la pastille repartent.
      if (page.reset) {
        setRound((n) => n + 1);
        setFresh(0);
      }
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
    setCopy(null);
    setFresh(0);
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
  // Quitter le Fil : ma publication reprend sa place normale (R8c2, plus de 24 h en tête).
  useFocusEffect(
    useCallback(
      () => () => {
        forgetMyPublished();
        setMine([]);
      },
      [],
    ),
  );

  /** « Actualiser » (tirer vers le bas, pastille) : ma publication reprend sa place, la première page est relue. */
  const refresh = useCallback(async () => {
    forgetMyPublished();
    setMine([]);
    await reload();
  }, [reload]);

  // « Nouvelles publications » : une lecture par minute, seulement Fil affiché, appli active, réseau présent et liste lue.
  const ref = list?.ref;
  useEffect(() => {
    if (!ref || !online || !focused || !appActive || copy) return;
    let stopped = false;
    const timer = setInterval(() => {
      void api.feedFresh(filterRef.current, ref).then(
        (r) => {
          if (!stopped && listRef.current?.ref === ref) setFresh(r.count);
        },
        () => undefined,
      );
    }, FRESH_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [ref, online, focused, appActive, copy]);

  // Le réseau disparaît pendant qu'on regarde le Fil (mode avion, sans quitter l'onglet ni actualiser) : la liste affichée passe à
  // sa copie filtrée (40 cartes, sans rendez-vous au spot ni sponsorisé, sans rail ni pagination) ; le retour du réseau est
  // traité par `FilScreen` (relecture en haut de liste, sinon la pastille).
  useEffect(() => {
    if (online) return;
    const l = listRef.current;
    if (!l || l.filter !== filterRef.current) return;
    const items = feedCopyCards(l.items);
    if (!items.length) return;
    setCopy((c) => c ?? { filter: l.filter, items, savedAt: new Date(lastOk.current || Date.now()).toISOString() });
  }, [online]);

  const showingCopy = Boolean(copy && copy.filter === filter);
  const shown: FeedCard[] | null = showingCopy
    ? (copy?.items ?? null)
    : list && list.filter === filter
      ? list.items
      : null;
  const pinned = showingCopy ? [] : justPublished(mine, Date.now());
  // La carte « Sponsorisé » ne remonte jamais avant la 4e place, même si une des trois premières cartes sort (tour 2).
  const items: FeedCard[] | null = shown ? sponsoredNotBeforeFourth(withMyPublished(shown, pinned)) : null;
  /** « Réessayer » : relit la première page après un échec d'actualisation, la page suivante après un échec de « Voir plus ». */
  const retry = useCallback(
    () => (feedRetryAction(errorSource) === "loadMore" ? loadMore() : reload()),
    [errorSource, loadMore, reload],
  );
  return {
    filter,
    setFilter,
    items,
    hasMore: !showingCopy && Boolean(list?.nextCursor) && list?.filter === filter,
    loadingMore,
    error,
    reload,
    refresh,
    loadMore,
    retry,
    errorSource,
    scrollTop,
    /** Le rail « Ça plaît en ce moment » de la première page (vide hors « Abonnements » et « Autour de moi », et hors ligne). */
    hot: showingCopy ? [] : list?.filter === filter ? (list.hot ?? []) : [],
    /** Sans réseau : la copie gardée est affichée (la date de la copie, ISO). */
    offline: showingCopy,
    copySavedAt: showingCopy ? (copy?.savedAt ?? null) : null,
    /** Au moins une publication juste envoyée est en tête (le bandeau « Publié sur ton profil »). */
    published: pinned.length > 0 ? (pinned[0]?.id ?? null) : null,
    /** Des nouveautés ou le retour du réseau : la pastille « Nouvelles publications ». */
    pill: fresh > 0,
    askPill: () => setFresh((n) => Math.max(1, n)),
    round,
    /** Une carte sort de la liste (publication supprimée). `dropPlacement` : toutes les cartes d'un emplacement refusé. */
    dropPlacement: (placementId: string) =>
      setList((s) => (s ? { ...s, items: withoutPlacement(s.items, placementId) } : s)),
    drop: (id: string) => {
      forgetMyPublished(id);
      // Une publication supprimée sort aussi des copies gardées sur l'appareil (elle ne revient pas hors ligne).
      void dropFromCopies(id);
      setMine((m) => m.filter((c) => c.id !== id));
      setList((s) => (s ? { ...s, items: s.items.filter((c) => c.id !== id) } : s));
      setCopy((c) => (c ? { ...c, items: c.items.filter((x) => x.id !== id) } : c));
    },
  };
}
