// Chargement d'une donnée de l'API : affiche tout de suite la dernière valeur connue (mémoire, ou cache du trousseau
// si `cacheKey` est donné), recharge au retour sur l'écran, garde la valeur en cas de panne réseau.
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRequestError } from "./http";
import { kvGetJson, kvSetJson } from "./kv";

type Options = {
  /** Mémorise la réponse dans le trousseau (profil, candidatures) : visible hors ligne. */
  cacheKey?: string;
  /** Ne charge pas tant que c'est faux (donnée qui dépend d'un identifiant pas encore connu). */
  enabled?: boolean;
  /** Recharge à intervalle régulier tant que l'écran est affiché (ms). */
  refreshMs?: number;
};

export type ApiState<T> = {
  data: T | null;
  error: ApiRequestError | null;
  loading: boolean;
  /** La valeur affichée vient du cache : l'API n'a pas répondu. */
  offline: boolean;
  reload: () => Promise<T | null>;
  setData: (value: T | null) => void;
};

export function useApi<T>(fetcher: () => Promise<T>, deps: readonly unknown[], options: Options = {}): ApiState<T> {
  const { cacheKey, enabled = true, refreshMs } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [offline, setOffline] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Valeur du cache, affichée avant la réponse de l'API.
  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    kvGetJson<T>(cacheKey).then((cached) => {
      if (!cancelled && cached) setData((current) => current ?? cached);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `deps` est la liste voulue par l'appelant
  const reload = useCallback(async (): Promise<T | null> => {
    if (!enabled) return null;
    try {
      const fresh = await fetcherRef.current();
      if (!alive.current) return fresh;
      setData(fresh);
      setError(null);
      setOffline(false);
      if (cacheKey) void kvSetJson(cacheKey, fresh);
      return fresh;
    } catch (e) {
      if (!alive.current) return null;
      const err = e instanceof ApiRequestError ? e : new ApiRequestError(0, "network", "Pas de connexion");
      setError(err);
      if (err.isNetwork) setOffline(true);
      return null;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [enabled, cacheKey, ...deps]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      if (!refreshMs) return undefined;
      const timer = setInterval(() => void reload(), refreshMs);
      return () => clearInterval(timer);
    }, [reload, refreshMs]),
  );

  return { data, error, loading, offline, reload, setData };
}
