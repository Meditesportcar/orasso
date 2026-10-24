// Liste paginée par curseur de l'Explorer : recharge quand les réglages changent (avec une pause de frappe), garde la
// dernière réponse valide si une requête plus ancienne revient après coup, et charge la suite à la demande.
// Lot M3 (fluidité) : avec `cacheKey`, cache d'abord : la dernière première page connue (cache du compte, `kv.ts`)
// s'affiche tout de suite, même pendant que la position se résout, puis la réponse fraîche la remplace.
// Lot M3, tour 2 : un onglet préchargé se revalide au retour sur l'écran si sa lecture a échoué ou date (`STALE_MS`),
// et au retour du réseau ; une réponse arrivée après un changement de compte est jetée.
import type { Page } from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage } from "@/lib/http";
import { cacheGetJson, cacheScope, cacheSetJson } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";

export type Paged<T> = {
  items: T[] | null;
  /** Lot R2 : le nombre en tout, quand la première page le donne (`withTotal`). */
  total: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
};

/** Au-delà, la liste affichée est revalidée au retour sur l'écran. */
export const STALE_MS = 60_000;

/**
 * Retour sur l'écran ou du réseau : relire une liste en échec ou ancienne, jamais pendant une lecture en cours ni
 * pendant le délai de frappe d'un changement de filtre (qui lancera sa propre lecture : une seule requête).
 */
export function shouldRevalidate(
  s: { busy: boolean; pending: boolean; enabled: boolean; error: string | null; lastOk: number },
  now: number,
): boolean {
  if (s.busy || s.pending || !s.enabled) return false;
  return s.error !== null || (s.lastOk > 0 && now - s.lastOk > STALE_MS);
}

/**
 * Lot M4, tour 2 : la page suivante s'ajoute sans doublon (même `id`). Un tri dont la valeur bouge (« Places
 * restantes ») peut renvoyer un événement déjà vu dont la valeur a baissé entre deux pages.
 */
export function appendUnique<T>(current: readonly T[], next: readonly T[]): T[] {
  const idOf = (x: T) => (x as { id?: unknown } | null)?.id;
  const seen = new Set<unknown>(current.map(idOf).filter((id) => id !== undefined));
  return [...current, ...next.filter((x) => idOf(x) === undefined || !seen.has(idOf(x)))];
}

export function usePaged<T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
  deps: readonly unknown[],
  debounceMs = 0,
  enabled = true,
  cacheKey?: string,
): Paged<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Tour 3 : seule la dernière lecture compte, et seulement pour le compte qui l'a lancée (page suivante comprise).
  const gate = useRef(createRequestGate(cacheScope)).current;
  // Debounce en attente : le retour sur l'écran ne double pas la lecture d'un changement de filtre.
  const pending = useRef(false);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  // La réponse fraîche est arrivée pour ces réglages : le cache ne la remplace plus.
  const fresh = useRef(false);
  // Dernière réponse reçue (0 = jamais) et lecture en cours.
  const lastOk = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (!cacheKey) return;
    fresh.current = false;
    let cancelled = false;
    void cacheGetJson<Page<T>>(cacheKey).then((cached) => {
      if (cancelled || fresh.current || !cached) return;
      setItems(cached.items);
      setTotal(cached.total ?? null);
      setCursor(cached.nextCursor);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  // Changement de compte : la liste de l'ancien compte disparaît, ses lectures en cours sont jetées.
  const account = cacheScope();
  const previousAccount = useRef(account);
  useEffect(() => {
    if (previousAccount.current === account) return;
    previousAccount.current = account;
    gate.invalidate();
    setItems(null);
    setTotal(null);
    setCursor(null);
    setError(null);
  }, [account, gate]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const ticket = gate.start();
    const scope = cacheScope();
    busy.current = true;
    try {
      const page = await fetchRef.current(undefined);
      if (!ticket.current()) return;
      fresh.current = true;
      lastOk.current = Date.now();
      if (cacheKey) void cacheSetJson(cacheKey, page, scope);
      setItems(page.items);
      setTotal(page.total ?? null);
      setCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      if (ticket.current()) setError(errorMessage(e));
    } finally {
      if (ticket.latest()) busy.current = false;
    }
  }, [enabled, cacheKey, gate]);

  // Retour sur l'écran : revalide une lecture en échec ou ancienne (jamais pendant une lecture en cours).
  const revalidate = useCallback(() => {
    const state = { busy: busy.current, pending: pending.current, enabled, error, lastOk: lastOk.current };
    if (shouldRevalidate(state, Date.now())) void reload();
  }, [enabled, error, reload]);
  // Tour 3 : seulement à l'arrivée sur l'écran (pas à chaque nouvelle `reload` d'un changement de filtre).
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;
  useFocusEffect(useCallback(() => revalidateRef.current(), []));
  // Retour du réseau : même règle.
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) revalidate();
    wasOnline.current = online;
  }, [online, revalidate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `account` relance la lecture après un changement de compte.
  useEffect(() => {
    pending.current = true;
    const timer = setTimeout(() => {
      pending.current = false;
      void reload();
    }, debounceMs);
    return () => {
      pending.current = false;
      clearTimeout(timer);
    };
  }, [reload, debounceMs, account, ...deps]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const ticket = gate.follow();
    setLoadingMore(true);
    try {
      const page = await fetchRef.current(cursor);
      if (!ticket.current()) return;
      setItems((current) => appendUnique(current ?? [], page.items));
      setCursor(page.nextCursor);
    } catch (e) {
      if (ticket.current()) setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, gate]);

  return { items, total, hasMore: cursor !== null, loadingMore, error, reload, loadMore };
}
