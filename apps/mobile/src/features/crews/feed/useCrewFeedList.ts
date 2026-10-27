// Le fil du crew tel que l'écran le tient (lot R6a, tour 2) : ce qui est affiché, le curseur de « Voir la suite » et
// les nouveautés en attente de la pastille, dans un seul état. Les relectures en direct s'y intègrent (règles communes
// `crewLive.ts`) : rien de ce qui est déjà intégré ne disparaît, les pages intermédiaires manquées sont lues, la
// reconnexion revalide toutes les pages chargées, et « Voir la suite » reprend au bon endroit.
// Comme `usePaged` (qu'il remplace ici) : seule la dernière lecture compte, et seulement pour son compte ; un changement
// de compte vide tout ; au retour sur l'écran, une liste en échec ou ancienne se relit.
import {
  applyCrewFeedRead,
  type CrewFeedItem,
  type CrewFeedOuting,
  type CrewFeedState,
  type CrewPostView,
  readCrewFeedTop,
} from "@orasso/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { shouldRevalidate } from "@/features/explorer/usePaged";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";

/** Une page suivante s'ajoute sans doublon (une entrée relue en direct peut déjà être là). */
function appendByKey(current: readonly CrewFeedItem[], next: readonly CrewFeedItem[]): CrewFeedItem[] {
  const seen = new Set(current.map((i) => i.key));
  return [...current, ...next.filter((i) => !seen.has(i.key))];
}

/** Ses propres publications ne vont jamais à la pastille (l'écran du geste les montre déjà). */
const mine = (i: CrewFeedItem) => i.type === "post" && i.post.mine;

type Mapper = (item: CrewFeedItem) => CrewFeedItem | null;
const mapAll = (s: CrewFeedState<CrewFeedItem>, fn: Mapper): CrewFeedState<CrewFeedItem> => ({
  ...s,
  items: s.items.flatMap((i) => fn(i) ?? []),
  pending: s.pending.flatMap((i) => fn(i) ?? []),
});

export function useCrewFeedList(crewId: string) {
  const [state, setState] = useState<CrewFeedState<CrewFeedItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const gate = useRef(createRequestGate(cacheScope)).current;
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastOk = useRef(0);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    const ticket = gate.start();
    busy.current = true;
    try {
      const page = await api.crewFeed(crewId);
      if (!ticket.current()) return;
      lastOk.current = Date.now();
      setState({ items: page.items, cursor: page.nextCursor, pending: [] });
      setError(null);
    } catch (e) {
      if (ticket.current()) setError(errorMessage(e));
    } finally {
      if (ticket.latest()) busy.current = false;
    }
  }, [crewId, gate]);

  const loadMore = useCallback(async () => {
    const from = stateRef.current?.cursor;
    if (!from) return;
    const ticket = gate.follow();
    setLoadingMore(true);
    try {
      const page = await api.crewFeed(crewId, from);
      if (!ticket.current()) return;
      // Une relecture en direct a pu changer le curseur entre-temps : la page lue ne vaut plus, on la jette.
      setState((s) =>
        s && s.cursor === from ? { ...s, items: appendByKey(s.items, page.items), cursor: page.nextCursor } : s,
      );
      setError(null);
    } catch (e) {
      if (ticket.current()) setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [crewId, gate]);

  /**
   * Relecture en direct depuis le haut : `head` (un signal) jusqu'à retrouver l'affiché, `full` (reconnexion) toutes
   * les pages chargées. `atTop` dit si les nouveautés s'insèrent ou attendent la pastille. Rejette sur un échec (le
   * besoin reste, la relecture est retentée). Rend les entrées relues (rien à relire de plus pour elles).
   */
  const live = useCallback(
    async (mode: "head" | "full", atTop: () => Promise<boolean>): Promise<CrewFeedItem[]> => {
      const shown = stateRef.current;
      if (!shown) return []; // Fil pas encore lu : sa première lecture suffit.
      const ticket = gate.follow();
      const read = await readCrewFeedTop((cursor) => api.crewFeed(crewId, cursor ?? undefined), shown.items, mode);
      if (!ticket.current()) return [];
      const insert = await atTop();
      if (!ticket.current()) return [];
      lastOk.current = Date.now();
      setState((s) => (s ? applyCrewFeedRead(s, read, { insert, mine }) : s));
      return read.items;
    },
    [crewId, gate],
  );

  /** Une publication relue ou changée sur place (`null` : retirée), partout où elle est (affichée, en attente). */
  const putPost = useCallback((id: string, next: CrewPostView | null | ((p: CrewPostView) => CrewPostView)) => {
    setState((s) =>
      s
        ? mapAll(s, (i) => {
            if (i.type !== "post" || i.post.id !== id) return i;
            if (next === null) return null;
            return { ...i, post: typeof next === "function" ? next(i.post) : next };
          })
        : s,
    );
  }, []);

  /** Une sortie relue (`null` : annulée, sa carte quitte le fil). */
  const putOuting = useCallback((id: string, next: ((o: CrewFeedOuting) => CrewFeedOuting) | null) => {
    setState((s) =>
      s
        ? mapAll(s, (i) =>
            i.type === "crew_outing" && i.outing.id === id ? (next ? { ...i, outing: next(i.outing) } : null) : i,
          )
        : s,
    );
  }, []);

  /** La pastille touchée : les nouveautés s'affichent en haut. */
  const acceptPending = useCallback((accept: (items: CrewFeedItem[], pending: CrewFeedItem[]) => CrewFeedItem[]) => {
    setState((s) => (s?.pending.length ? { ...s, items: accept(s.items, s.pending), pending: [] } : s));
  }, []);

  // Changement de compte : rien de l'ancien compte ne reste ; puis la première lecture (et à chaque nouveau crew).
  const account = cacheScope();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `account` relance la lecture après un changement de compte.
  useEffect(() => {
    gate.invalidate();
    setState(null);
    setError(null);
    void reload();
  }, [reload, account, gate]);

  // Retour sur l'écran : une liste en échec ou ancienne se relit (comme `usePaged`).
  const errorRef = useRef(error);
  errorRef.current = error;
  const revalidate = useCallback(() => {
    const s = { busy: busy.current, pending: false, enabled: true, error: errorRef.current, lastOk: lastOk.current };
    if (shouldRevalidate(s, Date.now())) void reload();
  }, [reload]);
  useFocusEffect(revalidate);

  return {
    items: state?.items ?? null,
    pending: state?.pending ?? [],
    hasMore: Boolean(state?.cursor),
    loadingMore,
    error,
    reload,
    loadMore,
    live,
    putPost,
    putOuting,
    acceptPending,
  };
}
