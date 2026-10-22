// Liste paginée par curseur de l'Explorer : recharge quand les réglages changent (avec une pause de frappe), garde la
// dernière réponse valide si une requête plus ancienne revient après coup, et charge la suite à la demande.
// Lot M3 (fluidité) : avec `cacheKey`, cache d'abord : la dernière première page connue (cache du compte, `kv.ts`)
// s'affiche tout de suite, même pendant que la position se résout, puis la réponse fraîche la remplace.
import type { Page } from "@orasso/shared";
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
    try {
      const page = await fetchRef.current(undefined);
      if (id !== request.current) return;
      fresh.current = true;
      if (cacheKey) void cacheSetJson(cacheKey, page, guard.scope);
      setItems(page.items);
      setCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    }
  }, [enabled, cacheKey]);

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
