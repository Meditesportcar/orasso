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
import { accountGuard, cacheGetJson, cacheSetJson } from "@/lib/kv";

export type Paged<T> = {
  items: T[] | null;
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
};

/** Au-delà, la liste affichée est revalidée au retour sur l'écran. */
export const STALE_MS = 60_000;

export function usePaged<T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
  deps: readonly unknown[],
  debounceMs = 0,
  enabled = true,
  cacheKey?: string,
): Paged<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);
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
      setCursor(cached.nextCursor);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const id = ++request.current;
    const guard = accountGuard();
    busy.current = true;
    try {
      const page = await fetchRef.current(undefined);
      if (id !== request.current || !guard.current()) return;
      fresh.current = true;
      lastOk.current = Date.now();
      if (cacheKey) void cacheSetJson(cacheKey, page, guard.scope);
      setItems(page.items);
      setCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    } finally {
      if (id === request.current) busy.current = false;
    }
  }, [enabled, cacheKey]);

  // Retour sur l'écran : revalide une lecture en échec ou ancienne (jamais pendant une lecture en cours).
  const revalidate = useCallback(() => {
    if (busy.current || !enabled) return;
    if (error || (lastOk.current > 0 && Date.now() - lastOk.current > STALE_MS)) void reload();
  }, [enabled, error, reload]);
  useFocusEffect(revalidate);
  // Retour du réseau : même règle.
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) revalidate();
    wasOnline.current = online;
  }, [online, revalidate]);

  useEffect(() => {
    const timer = setTimeout(() => void reload(), debounceMs);
    return () => clearTimeout(timer);
  }, [reload, debounceMs, ...deps]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const id = request.current;
    setLoadingMore(true);
    try {
      const page = await fetchRef.current(cursor);
      if (id !== request.current) return;
      setItems((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor]);

  return { items, hasMore: cursor !== null, loadingMore, error, reload, loadMore };
}
