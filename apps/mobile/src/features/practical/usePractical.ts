// Les lieux de « Pratique » pour le bloc de l'Accueil et l'écran « Voir tout » (lot R8q) : près de moi (la position donnée à
// l'instant, sinon ma ville) et près de ma sortie. Chaque lecture est un `POST /practical` (le bloc lit lui-même, quand il est
// affiché : il n'est pas dans `GET /me/home`). Rien n'est écrit sur le téléphone : la dernière réponse de la séance reste en mémoire
// (hors ligne, le bloc n'affiche rien de faux : cette réponse, sinon rien). Réponse partielle (une source n'a pas répondu dans le
// budget de l'API) : une seule relecture, après 3 secondes.
import {
  createSessionGuard,
  createSingleTimer,
  type LatLng,
  nextPracticalRead,
  PRACTICAL_STALE_MS,
  type PracticalChoice,
  type PracticalData,
  type PracticalFilter,
  type PracticalReadOutcome,
  practicalFailureOutcome,
  practicalPendingDelay,
  practicalReadAllowed,
  practicalRefusedReadAllowed,
  shouldRetryPractical,
} from "@orasso/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError } from "@/lib/http";
import { cacheScope, onCacheScopeDropped } from "@/lib/kv";
import {
  askPracticalPosition,
  refreshPracticalPosition,
  useFollowWeatherPosition,
  usePracticalPosition,
} from "./position";

/** Les derniers choix de la séance (« Près de moi | Près de ma sortie », « Tout · Stations-service · Lavage », « Liste | Carte »). */
export const practicalSession: { choice: PracticalChoice; filter: PracticalFilter; view: "list" | "map" } = {
  choice: "me",
  filter: "all",
  view: "list",
};

/** Dernière réponse de la séance, par compte : en mémoire seulement. */
const memory = new Map<string, PracticalData>();
/** La clé de mémoire d'un compte : `null` sans compte lié (rien n'est gardé ni relu sous un compte inconnu). */
const keyOf = (near: string, eventId?: string): string | null => {
  const who = cacheScope();
  return who ? `${who}|${near}|${eventId ?? ""}` : null;
};
const remembered = (near: string, eventId?: string): PracticalData | null => {
  const key = keyOf(near, eventId);
  return key ? (memory.get(key) ?? null) : null;
};

/** Un état de lecture : la réponse (ou la dernière connue), et si le réseau n'a pas répondu. */
type Read = { data: PracticalData | null; loading: boolean; offline: boolean };

/** Relit au retour sur l'écran quand la réponse a plus d'une minute (et un refus, seulement après ce délai). */
const STALE_MS = PRACTICAL_STALE_MS;

/** Le compte et la génération de session sont capturés au départ d'une lecture et revérifiés à son arrivée (lot R8q, tour 2). */
const guard = createSessionGuard(cacheScope);
// Chaque fin de session invalide les lectures en cours (A → déconnexion → A pendant une réponse lente), comme « Ma météo ».
onCacheScopeDropped(async () => guard.invalidate());
/** Sans identité connue, une lecture attend (aucune requête ne part sous un compte inconnu). */
const WAIT_IDENTITY_MS = 500;

function useRead(near: "city" | "outing", enabled: boolean, eventId?: string): Read {
  const [state, setState] = useState<Read>(() => ({
    data: remembered(near, eventId),
    loading: enabled,
    offline: false,
  }));
  /** Le compte pour qui `state` a été lu : une autre session l'efface. */
  const shownFor = useRef<string | null>(null);
  const fetchedAt = useRef(0);
  const retried = useRef(0);
  // Une seule chaîne d'attente d'identité et une seule chaîne de relances, annulées au démontage (tour 3).
  const waitTimer = useRef(createSingleTimer()).current;
  const retryTimer = useRef(createSingleTimer()).current;
  const attempts = useRef(0);
  const lastStart = useRef(0);
  const focused = useRef(false);
  // Un refus (4xx) : aucune minuterie, l'heure est retenue et il n'est relu au retour qu'après `STALE_MS` ; une relance tombée sans
  // focus ou en arrière-plan reprend au retour (une seule).
  const refusedAt = useRef(0);
  // Une génération par effet (entrées : événement, mode) : la réponse d'une ancienne sortie ne s'affiche jamais pour la nouvelle.
  const generation = useRef(0);
  const resumePending = useRef(false);
  // La dernière version de `load` : les minuteries ne rappellent jamais une version périmée.
  const latest = useRef<() => Promise<void>>(async () => undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      waitTimer.cancel();
      retryTimer.cancel();
    };
  }, [waitTimer, retryTimer]);

  const load = useCallback(async () => {
    if (!enabled) return;
    const ticket = guard.begin();
    if (!ticket) {
      // Identité inconnue : rien ne part ; on réessaie dès qu'elle l'est.
      waitTimer.schedule(() => void latest.current(), WAIT_IDENTITY_MS);
      return;
    }
    lastStart.current = Date.now();
    const gen = generation.current;
    const valid = () => alive.current && gen === generation.current && guard.valid(ticket);
    let outcome: PracticalReadOutcome;
    try {
      const data = await api.practical(near === "city" ? { near } : { near, ...(eventId ? { eventId } : {}) });
      // Une réponse devenue étrangère (autre compte, autre génération de session, écran fermé) est jetée.
      if (!valid()) return;
      memory.set(`${ticket.who}|${near}|${eventId ?? ""}`, data);
      shownFor.current = ticket.who;
      fetchedAt.current = Date.now();
      refusedAt.current = 0;
      setState({ data, loading: false, offline: false });
      outcome = data.partial ? "partial" : "complete";
    } catch (error) {
      if (!valid()) return;
      // Réseau ou 5xx : transitoire (relance espacée) ; tout 4xx (403, 429…) : refus, aucune minuterie. « Hors ligne » : le réseau seul.
      const status = error instanceof ApiRequestError ? error.status : 0;
      outcome = practicalFailureOutcome(status);
      refusedAt.current = outcome === "refused" ? Date.now() : 0;
      setState((s) => ({ data: s.data ?? remembered(near, eventId), loading: false, offline: status === 0 }));
    }
    // La suite : transitoire (relance espacée), refus (rien), partielle (calendrier 3/6/12/24 s), complète (compteurs à 0).
    const step = nextPracticalRead(outcome, retried.current, attempts.current);
    retried.current = step.calendarStep;
    attempts.current = step.networkAttempt;
    if (step.delay !== null) {
      retryTimer.schedule(() => {
        if (!alive.current) return;
        // Jamais de relance écran sans focus ou appli en arrière-plan : elle reprend au retour (`refresh`).
        if (
          !shouldRetryPractical({
            network: true,
            focused: focused.current,
            foreground: AppState.currentState === "active",
          })
        ) {
          resumePending.current = true;
          return;
        }
        void latest.current();
      }, step.delay);
    }
  }, [enabled, near, eventId, waitTimer, retryTimer]);
  latest.current = load;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` change avec ses entrées ; une lecture par changement.
  useEffect(() => {
    retried.current = 0;
    fetchedAt.current = 0;
    attempts.current = 0;
    lastStart.current = 0;
    refusedAt.current = 0;
    resumePending.current = false;
    // Nouvelles entrées : plus aucune minuterie de l'ancienne lecture, et sa réponse tardive est jetée (M1, M2).
    generation.current += 1;
    retryTimer.cancel();
    waitTimer.cancel();
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState({ data: remembered(near, eventId), loading: true, offline: false });
    void load();
  }, [enabled, near, eventId]);

  // Une autre session sur le même écran : les données de l'ancien compte disparaissent et la lecture repart.
  useEffect(() => {
    const who = cacheScope();
    if (shownFor.current !== null && shownFor.current !== who) {
      shownFor.current = null;
      fetchedAt.current = 0;
      retryTimer.cancel();
      waitTimer.cancel();
      retried.current = 0;
      attempts.current = 0;
      refusedAt.current = 0;
      setState({ data: remembered(near, eventId), loading: enabled, offline: false });
      void load();
    }
  });

  // Retour sur l'écran et retour de l'appli au premier plan : relit quand la réponse a plus d'une minute, ou quand aucune lecture
  // n'a encore réussi (premier échec réseau).
  const refresh = useCallback(() => {
    if (!enabled) return;
    // Une relance tombée hors focus est reprise au retour, même si la dernière lecture date de moins de 15 s (une seule, sans boucle).
    if (resumePending.current) {
      resumePending.current = false;
      void load();
      return;
    }
    // Un refus (4xx) : relu seulement après `STALE_MS` (et jamais deux lectures à moins de 15 s).
    if (refusedAt.current > 0) {
      if (practicalRefusedReadAllowed(refusedAt.current, lastStart.current, Date.now())) void load();
      return;
    }
    // Jamais deux lectures à moins de 15 s l'une de l'autre (retours répétés sur l'écran).
    if (!practicalReadAllowed(lastStart.current, Date.now())) return;
    if (!fetchedAt.current || Date.now() - fetchedAt.current > STALE_MS) void load();
  }, [enabled, load]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      refresh();
      const sub = AppState.addEventListener("change", (next) => {
        if (next === "active") refresh();
      });
      return () => {
        focused.current = false;
        sub.remove();
      };
    }, [refresh]),
  );
  return state.data && shownFor.current !== null && shownFor.current !== cacheScope()
    ? { data: null, loading: enabled, offline: false }
    : state;
}

export type PracticalSources = {
  /** Près de moi : les lieux de la position donnée, sinon ceux de ma ville. */
  me: Read & { exact: LatLng | null; onPosition: boolean };
  /** Près de ma sortie : `data.origin` est `null` quand je n'ai pas de sortie à venir. */
  outing: Read;
  busy: boolean;
};

export function usePracticalSources(eventId?: string): PracticalSources {
  useFollowWeatherPosition();
  const { at, busy } = usePracticalPosition();
  const city = useRead("city", at === null);
  const outing = useRead("outing", true, eventId);
  // Position donnée avec des lieux partiels : une seule relecture, après le délai.
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
      ? { data: at.data, loading: false, offline: false, exact: at.exact, onPosition: true }
      : { ...city, exact: null, onPosition: false },
    outing,
    busy,
  };
}

/** Le bouton « Utiliser ma position » : la même demande que « Ma météo » (l'appareil demande la permission une seule fois). */
export const giveMyPosition = () => askPracticalPosition(false);
