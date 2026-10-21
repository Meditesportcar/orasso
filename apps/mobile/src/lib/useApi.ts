// Chargement d'une donnée de l'API : affiche tout de suite la dernière valeur connue (mémoire, ou cache du trousseau
// si `cacheKey` est donné), recharge au retour sur l'écran, garde la valeur en cas de panne réseau.
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRequestError } from "./http";
import { accountGuard, cacheGetJson, cacheScope, cacheSetJson } from "./kv";

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
  // Le cache est rangé sous le compte connecté (`kv.ts`) : un autre compte ne le lit jamais.
  const account = cacheScope();
  // Écran resté monté d'un compte à l'autre : la valeur de l'ancien compte ne reste pas affichée.
  const previousAccount = useRef(account);
  useEffect(() => {
    if (previousAccount.current && previousAccount.current !== account) {
      setData(null);
      setError(null);
      setOffline(false);
    }
    previousAccount.current = account;
  }, [account]);
  useEffect(() => {
    if (!cacheKey || !account) return;
    let cancelled = false;
    cacheGetJson<T>(cacheKey).then((cached) => {
      if (!cancelled && cached) setData((current) => current ?? cached);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, account]);

  const reload = useCallback(async (): Promise<T | null> => {
    if (!enabled) return null;
    // Compte du départ : une réponse qui arrive après un changement de compte est jetée (état, cache), même si
    // l'écran est resté monté d'un compte à l'autre.
    const guard = accountGuard();
    try {
      const fresh = await fetcherRef.current();
      if (!alive.current) return fresh;
      if (!guard.current()) return null;
      setData(fresh);
      setError(null);
      setOffline(false);
      if (cacheKey) void cacheSetJson(cacheKey, fresh, guard.scope);
      return fresh;
    } catch (e) {
      if (!alive.current || !guard.current()) return null;
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
