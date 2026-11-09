// Chargement d'une donnée de l'API : affiche tout de suite la dernière valeur connue (mémoire, ou cache du trousseau
// si `cacheKey` est donné), recharge au retour sur l'écran, garde la valeur en cas de panne réseau.
// Lot M3 (fluidité) : charge dès le montage, même hors focus (onglets voisins préchargés par la barre de pages) ; le
// retour sur l'écran recharge en arrière-plan, sauf si une lecture est encore en cours et qu'aucune modification n'a
// été envoyée depuis son départ (tour 2 : jamais d'état périmé après une suppression, une candidature…).
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRequestError, mutationCount } from "./http";
import { accountGuard, cacheGetJson, cacheScope, cacheSetJson } from "./kv";
import { createRequestGate } from "./requestGate";

type Options<T> = {
  /** Mémorise la réponse dans le trousseau (profil, candidatures) : visible hors ligne. */
  cacheKey?: string;
  /** Ne charge pas tant que c'est faux (donnée qui dépend d'un identifiant pas encore connu). */
  enabled?: boolean;
  /** Recharge à intervalle régulier tant que l'écran est affiché (ms). */
  refreshMs?: number;
  /**
   * Lot R7i, tour 4 : reçoit la réponse brute, seulement si elle passe les mêmes contrôles que `data` (écran vivant, même
   * compte, dernière lecture). Pour ce qui ne doit pas entrer dans la valeur gardée (lieu d'un rendez-vous, sponsorisé).
   */
  onFresh?: (fresh: T) => void;
  /** Ce qui est gardé (état et cache) à partir de la réponse brute ; par défaut, la réponse telle quelle. */
  keep?: (fresh: T) => T;
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

/**
 * Retour sur l'écran : recharger, sauf si une lecture est en cours (`inFlight` = modifications comptées à son départ)
 * et qu'aucune modification n'est partie depuis.
 */
export function shouldReloadOnFocus(inFlight: number | null, mutations: number): boolean {
  return inFlight === null || inFlight !== mutations;
}

/** Une réponse n'est appliquée que si l'écran est vivant, que le compte n'a pas changé et qu'aucune lecture plus récente n'est partie. */
export function acceptRead(alive: boolean, accountSame: boolean, latest: boolean): boolean {
  return alive && accountSame && latest;
}

export function useApi<T>(fetcher: () => Promise<T>, deps: readonly unknown[], options: Options<T> = {}): ApiState<T> {
  const { cacheKey, enabled = true, refreshMs } = options;
  const onFreshRef = useRef(options.onFresh);
  onFreshRef.current = options.onFresh;
  const keepRef = useRef(options.keep);
  keepRef.current = options.keep;
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

  // Lecture en cours : le nombre de modifications envoyées à son départ (`null` = aucune lecture en cours).
  const inFlight = useRef<number | null>(null);
  // Tour 3 : seule la dernière lecture met à jour le résultat et le cache (une réponse d'avant une suppression, arrivée
  // après la relecture, est ignorée).
  const gate = useRef(createRequestGate(cacheScope)).current;
  const reload = useCallback(async (): Promise<T | null> => {
    if (!enabled) return null;
    const started = mutationCount();
    inFlight.current = started;
    // Compte du départ : une réponse qui arrive après un changement de compte est jetée (état, cache), même si
    // l'écran est resté monté d'un compte à l'autre.
    const guard = accountGuard();
    const ticket = gate.start();
    try {
      const fresh = await fetcherRef.current();
      if (!alive.current) return fresh;
      if (!acceptRead(alive.current, guard.current(), ticket.latest())) return null;
      const kept = keepRef.current ? keepRef.current(fresh) : fresh;
      onFreshRef.current?.(fresh);
      setData(kept);
      setError(null);
      setOffline(false);
      if (cacheKey) void cacheSetJson(cacheKey, kept, guard.scope);
      return kept;
    } catch (e) {
      if (!alive.current || !guard.current() || !ticket.latest()) return null;
      const err = e instanceof ApiRequestError ? e : new ApiRequestError(0, "network", "Pas de connexion");
      setError(err);
      if (err.isNetwork) setOffline(true);
      return null;
    } finally {
      if (inFlight.current === started) inFlight.current = null;
      if (alive.current && ticket.latest()) setLoading(false);
    }
  }, [enabled, cacheKey, gate, ...deps]);

  // Premier chargement au montage (et à chaque changement de dépendances), focus ou pas.
  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      if (shouldReloadOnFocus(inFlight.current, mutationCount())) void reload();
      if (!refreshMs) return undefined;
      const timer = setInterval(() => void reload(), refreshMs);
      return () => clearInterval(timer);
    }, [reload, refreshMs]),
  );

  return { data, error, loading, offline, reload, setData };
}
