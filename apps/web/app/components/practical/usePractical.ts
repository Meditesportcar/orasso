// Les lieux de « Pratique » pour le bloc de l'Accueil et la page « Voir tout » du site (lot R8q) : près de moi (la position donnée à
// l'instant, sinon ma ville) et près de ma sortie. Chaque lecture est un `POST /practical` fait par le navigateur quand le bloc est
// affiché (il n'est pas dans `GET /me/home`). Rien n'est écrit dans le navigateur : la dernière réponse de la séance reste en mémoire.
// Réponse partielle : une seule relecture, après 3 secondes.
import {
  createSessionGuard,
  createSingleTimer,
  type PracticalChoice,
  type PracticalData,
  type PracticalFilter,
  practicalPendingDelay,
  practicalRetryDelay,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { apiFetch } from "../../lib/api.client";
import { currentSession, listenSession } from "../../lib/sessionChannel";
import { refreshPracticalPosition, useFollowWeatherPosition, usePracticalPosition } from "./position";

/** Les derniers choix de la séance (page chargée) : « Près de moi | Près de ma sortie », les puces, « Liste | Carte ». */
export const practicalSession: { choice: PracticalChoice; filter: PracticalFilter; view: "list" | "map" } = {
  choice: "me",
  filter: "all",
  view: "list",
};

/** Dernière réponse de la séance, par compte : en mémoire seulement. */
const memory = new Map<string, PracticalData>();
/** La clé de mémoire d'un compte : `null` tant que la session n'est pas annoncée (rien n'est gardé ni relu sous un compte inconnu). */
const keyOf = (near: string): string | null => {
  const who = currentSession();
  return who ? `${who}|${near}` : null;
};
const remembered = (near: string): PracticalData | null => {
  const key = keyOf(near);
  return key ? (memory.get(key) ?? null) : null;
};

type Read = { data: PracticalData | null; loading: boolean; offline: boolean; retry: () => void };

/** Le compte et la génération de session sont capturés au départ d'une lecture et revérifiés à son arrivée (lot R8q, tour 2). */
const guard = createSessionGuard(currentSession);

/** Le compte annoncé par la mise en page : `null` tant qu'il ne l'est pas (le rendu serveur part de la même valeur vide). */
function useSessionId(): string | null {
  return useSyncExternalStore(
    (notify) =>
      listenSession((userId) => {
        if (userId === null) guard.invalidate();
        else guard.sync();
        notify();
      }),
    currentSession,
    () => null,
  );
}

function useRead(near: "city" | "outing", enabled: boolean): Read {
  // Le rendu serveur et l'hydratation partent de la même valeur vide ; la mémoire de la séance est reprise après.
  const who = useSessionId();
  const [state, setState] = useState<Omit<Read, "retry">>({ data: null, loading: enabled, offline: false });
  // Une nouvelle lecture sur demande (« Réessayer », retour en ligne) : le chargement repart, le compteur de relance aussi.
  const reload = useRef<() => void>(() => undefined);
  const retry = useCallback(() => reload.current(), []);
  const failed = useRef(false);
  const retried = useRef(0);
  // Le composant est monté : plus aucune lecture ni relance après son démontage (tour 2 de la suite).
  const alive = useRef(true);
  // Une seule lecture à la fois (reprises, « Réessayer », minuteries).
  const reading = useRef(false);
  // Une seule relance de lieux partiels, annulée au démontage (tour 3).
  const partialTimer = useRef(createSingleTimer()).current;
  const retryTimer = useRef(createSingleTimer()).current;
  const attempts = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      partialTimer.cancel();
      retryTimer.cancel();
    };
  }, [partialTimer, retryTimer]);

  // Sans identité connue, rien ne part (la lecture attend l'annonce de la session, `who` change alors et relance l'effet).
  const load = useCallback(async () => {
    if (!enabled || !who || !alive.current || reading.current) return;
    const ticket = guard.begin();
    if (!ticket) return;
    reading.current = true;
    let res: Awaited<ReturnType<typeof apiFetch<PracticalData>>>;
    try {
      res = await apiFetch<PracticalData>("/practical", { method: "POST", json: { near } });
    } finally {
      reading.current = false;
    }
    // Une réponse devenue étrangère (autre compte, autre génération de session) ou arrivée après le démontage est jetée.
    if (!alive.current || !guard.valid(ticket)) return;
    if (!res.ok) {
      failed.current = true;
      setState((s) => ({ data: s.data ?? remembered(near), loading: false, offline: true }));
      // Panne réseau (statut 0) : relance espacée, seulement page visible ; sans données, le retour en ligne la reprend aussi.
      if (res.status === 0) {
        retryTimer.schedule(
          () => {
            if (alive.current && (typeof document === "undefined" || document.visibilityState === "visible"))
              void load();
          },
          practicalRetryDelay(attempts.current++),
        );
      }
      return;
    }
    attempts.current = 0;
    failed.current = false;
    memory.set(`${ticket.who}|${near}`, res.data);
    setState({ data: res.data, loading: false, offline: false });
    // Des chargements sont en cours côté API : relectures espacées (3, 6, 12, 24 s), puis arrêt ; jamais après le démontage.
    const pending = res.data.partial ? practicalPendingDelay(retried.current) : null;
    if (pending !== null) {
      retried.current += 1;
      partialTimer.schedule(() => {
        if (alive.current) void load();
      }, pending);
    }
  }, [enabled, near, who, partialTimer, retryTimer]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: une lecture par changement de `load` (entrées ou compte).
  useEffect(() => {
    retried.current = 0;
    attempts.current = 0;
    retryTimer.cancel();
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }
    // Un autre compte (ou aucun) : les données de l'ancien disparaissent tout de suite.
    setState({ data: who ? remembered(near) : null, loading: true, offline: false });
    void load();
    reload.current = () => {
      attempts.current = 0;
      setState((s) => ({ ...s, loading: s.data === null }));
      void load();
    };
    // Retour en ligne et retour sur la page : une lecture qui n'a jamais réussi est reprise tout de suite.
    const resume = () => {
      if (!failed.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      reload.current();
    };
    // Retour en ligne et page redevenue visible (une relance tombée dans un onglet masqué n'est pas perdue).
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [load]);
  return { ...state, retry };
}

export type PracticalSources = {
  me: Read & { exact: { lat: number; lng: number } | null; onPosition: boolean };
  outing: Read;
  busy: boolean;
};

export function usePracticalSources(): PracticalSources {
  useFollowWeatherPosition();
  const { at, busy } = usePracticalPosition();
  const city = useRead("city", at === null);
  const outing = useRead("outing", true);
  const partial = at?.data.partial === true;
  const partialAttempts = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque nouvelle réponse (`at`) programme la relecture suivante du calendrier.
  useEffect(() => {
    if (!partial) {
      partialAttempts.current = 0;
      return undefined;
    }
    const delay = practicalPendingDelay(partialAttempts.current);
    if (delay === null) return undefined;
    partialAttempts.current += 1;
    const timer = setTimeout(() => void refreshPracticalPosition(true), delay);
    return () => clearTimeout(timer);
  }, [partial, at]);
  return {
    me: at
      ? { data: at.data, loading: false, offline: false, retry: city.retry, exact: at.exact, onPosition: true }
      : { ...city, exact: null, onPosition: false },
    outing,
    busy,
  };
}
