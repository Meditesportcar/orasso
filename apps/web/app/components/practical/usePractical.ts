// Les lieux de « Pratique » pour le bloc de l'Accueil et la page « Voir tout » du site (lot R8q) : près de moi (la position donnée à
// l'instant, sinon ma ville) et près de ma sortie. Chaque lecture est un `POST /practical` fait par le navigateur quand le bloc est
// affiché (il n'est pas dans `GET /me/home`). Rien n'est écrit dans le navigateur : la dernière réponse de la séance reste en mémoire.
// Réponse partielle : une seule relecture, après 3 secondes.
import {
  createReadGate,
  createSessionGuard,
  createSingleTimer,
  nextPracticalRead,
  type PracticalChoice,
  type PracticalData,
  type PracticalFilter,
  type PracticalReadOutcome,
  practicalFailureOutcome,
  practicalPendingDelay,
  practicalRefusedReadAllowed,
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

type Read = { data: PracticalData | null; loading: boolean; offline: boolean; failed?: boolean; retry: () => void };

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
  // `failed` : une reprise est due au retour sur l'écran (échec transitoire) ; `refusedAt` : heure d'un refus (4xx), relu au retour seulement après `STALE_MS`.
  const failed = useRef(false);
  const refusedAt = useRef(0);
  const lastStart = useRef(0);
  // La dernière version de `load` : les minuteries ne rappellent jamais une version périmée (changement de compte ou d'entrées).
  const latest = useRef<() => Promise<void>>(async () => undefined);
  const retried = useRef(0);
  // Le composant est monté : plus aucune lecture ni relance après son démontage (tour 2 de la suite).
  const alive = useRef(true);
  // Une seule lecture à la fois (reprises, « Réessayer », minuteries).
  const gate = useRef(createReadGate()).current;
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
    if (!enabled || !who || !alive.current) return;
    // Une lecture est déjà en cours (celle de l'ancien compte, par exemple) : celle-ci attend et repart à sa fin.
    if (!gate.enter()) return;
    const ticket = guard.begin();
    if (!ticket) {
      gate.leave();
      return;
    }
    lastStart.current = Date.now();
    let res: Awaited<ReturnType<typeof apiFetch<PracticalData>>>;
    try {
      res = await apiFetch<PracticalData>("/practical", { method: "POST", json: { near }, timeoutMs: 15_000 });
    } finally {
      // Une demande attendait : on relit pour la session courante (la réponse qui vient d'arriver est laissée de côté).
      if (gate.leave() && alive.current) {
        void latest.current();
      }
    }
    // Une réponse devenue étrangère (autre compte, autre génération de session) ou arrivée après le démontage est jetée.
    if (!alive.current || !guard.valid(ticket)) return;
    // La suite d'une lecture : réseau (relance espacée), refus (jamais relancé), partielle (calendrier 3/6/12/24 s), complète (compteurs à 0).
    const outcome: PracticalReadOutcome = res.ok
      ? res.data.partial
        ? "partial"
        : "complete"
      : practicalFailureOutcome(res.status);
    const step = nextPracticalRead(outcome, retried.current, attempts.current);
    retried.current = step.calendarStep;
    attempts.current = step.networkAttempt;
    if (res.ok) {
      failed.current = false;
      refusedAt.current = 0;
      memory.set(`${ticket.who}|${near}`, res.data);
      setState({ data: res.data, loading: false, offline: false });
    } else {
      // Transitoire (réseau, 5xx) : reprise au retour ; refus (4xx) : l'heure est retenue, aucune minuterie ; « hors ligne » seulement pour le réseau.
      failed.current = outcome === "transient";
      refusedAt.current = outcome === "refused" ? Date.now() : 0;
      setState((s) => ({ data: s.data ?? remembered(near), loading: false, offline: res.status === 0, failed: true }));
    }
    if (step.delay !== null) {
      // Jamais la relance d'un onglet masqué : elle reprend au retour sur la page (`failed` : voir la reprise plus bas).
      (outcome === "partial" ? partialTimer : retryTimer).schedule(() => {
        if (!alive.current) return;
        if (typeof document !== "undefined" && document.visibilityState !== "visible") {
          failed.current = true;
          return;
        }
        void latest.current();
      }, step.delay);
    }
  }, [enabled, near, who, partialTimer, retryTimer, gate]);
  latest.current = load;

  // biome-ignore lint/correctness/useExhaustiveDependencies: une lecture par changement de `load` (entrées ou compte).
  useEffect(() => {
    retried.current = 0;
    attempts.current = 0;
    failed.current = false;
    refusedAt.current = 0;
    retryTimer.cancel();
    partialTimer.cancel();
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
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (failed.current) {
        reload.current();
        return;
      }
      if (practicalRefusedReadAllowed(refusedAt.current, lastStart.current, Date.now())) reload.current();
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
  // Le calendrier (3, 6, 12, 24 s) se poursuit après un échec de relecture : la minuterie suivante est programmée à la fin de chaque
  // relecture, réussie ou non ; il s'arrête quand la réponse est complète, au bout de la série ou au démontage.
  useEffect(() => {
    if (!partial) {
      partialAttempts.current = 0;
      return undefined;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      const delay = practicalPendingDelay(partialAttempts.current);
      if (delay === null || !active) return;
      partialAttempts.current += 1;
      timer = setTimeout(() => {
        void refreshPracticalPosition(true).finally(() => {
          if (active) next();
        });
      }, delay);
    };
    next();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [partial]);
  return {
    me: at
      ? { data: at.data, loading: false, offline: false, retry: city.retry, exact: at.exact, onPosition: true }
      : { ...city, exact: null, onPosition: false },
    outing,
    busy,
  };
}
