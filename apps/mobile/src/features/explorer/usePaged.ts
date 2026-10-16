// Liste paginée par curseur de l'Explorer : recharge quand les réglages changent (avec une pause de frappe), garde la
// dernière réponse valide si une requête plus ancienne revient après coup, et charge la suite à la demande.
import type { Page } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage } from "@/lib/http";

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
): Paged<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const request = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const reload = useCallback(async () => {
    if (!enabled) return;
    const id = ++request.current;
    try {
      const page = await fetchRef.current(undefined);
      if (id !== request.current) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    }
  }, [enabled]);

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
