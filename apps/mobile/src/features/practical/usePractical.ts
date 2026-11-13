// Les lieux de « Pratique » pour le bloc de l'Accueil et l'écran « Voir tout » (lot R8q) : près de moi (la position donnée à
// l'instant, sinon ma ville) et près de ma sortie. Chaque lecture est un `POST /practical` (le bloc lit lui-même, quand il est
// affiché : il n'est pas dans `GET /me/home`). Rien n'est écrit sur le téléphone : la dernière réponse de la séance reste en mémoire
// (hors ligne, le bloc n'affiche rien de faux : cette réponse, sinon rien). Réponse partielle (une source n'a pas répondu dans le
// budget de l'API) : une seule relecture, après 3 secondes.
import {
  createReadCycle,
  createSessionGuard,
  createSingleTimer,
  type LatLng,
  PRACTICAL_STALE_MS,
  type PracticalChoice,
  type PracticalData,
  type PracticalFilter,
  practicalFailureOutcome,
  practicalReadAllowed,
  type ReadCycleOutcome,
} from "@orasso/shared";
import * as Sentry from "@sentry/react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError } from "@/lib/http";
import { cacheScope, onCacheScopeDropped } from "@/lib/kv";
import {
  askPracticalPosition,
  retainPracticalCalendar,
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

/**
 * Un état de lecture : la réponse (ou la dernière connue), si le réseau n'a pas répondu (`offline`), si la dernière lecture a échoué
 * (`failed` : « Réessayer » est proposé) et la relecture sur demande.
 */
type Read = { data: PracticalData | null; loading: boolean; offline: boolean; failed: boolean; retry: () => void };

/** Relit au retour sur l'écran quand la réponse a plus d'une minute (et un refus, seulement après ce délai). */
const STALE_MS = PRACTICAL_STALE_MS;

/** Le compte et la génération de session sont capturés au départ d'une lecture et revérifiés à son arrivée (lot R8q, tour 2). */
const guard = createSessionGuard(cacheScope);
// Chaque fin de session invalide les lectures en cours (A → déconnexion → A pendant une réponse lente), comme « Ma météo ».
onCacheScopeDropped(async () => guard.invalidate());
/** Sans identité connue, une lecture attend (aucune requête ne part sous un compte inconnu). */
const WAIT_IDENTITY_MS = 500;

function useRead(near: "city" | "outing", enabled: boolean, eventId?: string): Read {
  const [state, setState] = useState<Omit<Read, "retry">>(() => ({
    data: remembered(near, eventId),
    loading: enabled,
    offline: false,
    failed: false,
  }));
  /** Le compte pour qui `state` a été lu : une autre session l'efface. */
  const shownFor = useRef<string | null>(null);
  const fetchedAt = useRef(0);
  // Une seule chaîne d'attente d'identité, annulée au démontage (tour 3).
  const waitTimer = useRef(createSingleTimer()).current;
  const lastStart = useRef(0);
  const focused = useRef(false);
  // Une génération par effet (entrées : événement, mode) : la réponse d'une ancienne sortie ne s'affiche jamais pour la nouvelle.
  const generation = useRef(0);
  // La dernière version de `load` : les minuteries ne rappellent jamais une version périmée.
  const latest = useRef<() => Promise<void>>(async () => undefined);
  const alive = useRef(true);
  // Le cycle de lecture (règle commune site et appli, tour 6) : une seule échéance à la fois, une issue la remplace ; un refus (4xx)
  // n'a aucune minuterie et est relu au retour après 60 s ; une erreur inconnue n'est jamais relancée ; jamais de relance sans focus
  // ou appli en arrière-plan (elle reprend au retour, au délai restant de l'écart de 15 s).
  const cycle = useRef(
    createReadCycle({
      run: () => void latest.current(),
      visible: () => focused.current && AppState.currentState === "active",
    }),
  ).current;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      waitTimer.cancel();
      cycle.dispose();
    };
  }, [waitTimer, cycle]);

  const load = useCallback(async () => {
    if (!enabled) return;
    const ticket = guard.begin();
    if (!ticket) {
      // Identité inconnue : rien ne part ; on réessaie dès qu'elle l'est.
      waitTimer.schedule(() => void latest.current(), WAIT_IDENTITY_MS);
      return;
    }
    lastStart.current = Date.now();
    cycle.begin();
    const gen = generation.current;
    const valid = () => alive.current && gen === generation.current && guard.valid(ticket);
    let outcome: ReadCycleOutcome;
    try {
      const data = await api.practical(near === "city" ? { near } : { near, ...(eventId ? { eventId } : {}) });
      // Une réponse devenue étrangère (autre compte, autre génération de session, écran fermé) est jetée.
      if (!valid()) return;
      memory.set(`${ticket.who}|${near}|${eventId ?? ""}`, data);
      shownFor.current = ticket.who;
      fetchedAt.current = Date.now();
      setState({ data, loading: false, offline: false, failed: false });
      outcome = data.partial ? "partial" : "complete";
    } catch (error) {
      if (!valid()) return;
      if (error instanceof ApiRequestError) {
        // Réseau ou 5xx : transitoire (relance espacée) ; tout 4xx (403, 429…) : refus, aucune minuterie. « Hors ligne » : le réseau seul.
        outcome = practicalFailureOutcome(error.status);
        setState((s) => ({
          data: s.data ?? remembered(near, eventId),
          loading: false,
          offline: error.status === 0,
          failed: true,
        }));
      } else {
        // Une exception qui n'est pas une réponse du serveur (un bogue) : aucune relance automatique, jamais « hors ligne »,
        // signalée à Sentry ; « Réessayer » reste proposé.
        outcome = "unknown";
        if (Sentry.getClient()) Sentry.captureException(error, { tags: { area: "practical" } });
        setState((s) => ({ data: s.data ?? remembered(near, eventId), loading: false, offline: false, failed: true }));
      }
    }
    // La suite remplace toute échéance : transitoire (relance espacée), refus (rien), partielle (calendrier 3/6/12/24 s), complète (0).
    waitTimer.cancel();
    cycle.settled(outcome);
  }, [enabled, near, eventId, waitTimer, cycle]);
  latest.current = load;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` change avec ses entrées ; une lecture par changement.
  useEffect(() => {
    fetchedAt.current = 0;
    lastStart.current = 0;
    // Nouvelles entrées : plus aucune minuterie de l'ancienne lecture, et sa réponse tardive est jetée (M1, M2).
    generation.current += 1;
    cycle.reset();
    waitTimer.cancel();
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState({ data: remembered(near, eventId), loading: true, offline: false, failed: false });
    void load();
  }, [enabled, near, eventId]);

  // Une autre session sur le même écran : les données de l'ancien compte disparaissent et la lecture repart.
  useEffect(() => {
    const who = cacheScope();
    if (shownFor.current !== null && shownFor.current !== who) {
      shownFor.current = null;
      fetchedAt.current = 0;
      cycle.reset();
      waitTimer.cancel();
      setState({ data: remembered(near, eventId), loading: enabled, offline: false, failed: false });
      void load();
    }
  });

  // « Réessayer » : tout repart à 0 et la lecture part tout de suite.
  const retry = useCallback(() => {
    cycle.manual();
    waitTimer.cancel();
    setState((s) => ({ ...s, loading: s.data === null }));
    void latest.current();
  }, [cycle, waitTimer]);

  // Retour sur l'écran et retour de l'appli au premier plan : une reprise due part à l'écart de 15 s (en remplaçant l'échéance
  // précédente) ; un refus n'est relu qu'après 60 s ; sinon relit quand la réponse a plus d'une minute, ou quand aucune lecture
  // n'a encore réussi.
  const refresh = useCallback(() => {
    if (!enabled) return;
    if (cycle.resume() !== "idle") return;
    // Un refus ou une erreur inconnue : rien d'automatique d'ici là.
    if (cycle.blocked()) return;
    // Jamais deux lectures à moins de 15 s l'une de l'autre (retours répétés sur l'écran).
    if (!practicalReadAllowed(lastStart.current, Date.now())) return;
    if (!fetchedAt.current || Date.now() - fetchedAt.current > STALE_MS) void load();
  }, [enabled, load, cycle]);
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
    ? { data: null, loading: enabled, offline: false, failed: false, retry }
    : { ...state, retry };
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
  // Un seul calendrier de relecture des lieux partiels, porté par le magasin de position et partagé par tous les écrans montés.
  useEffect(() => retainPracticalCalendar(), []);
  return {
    me: at
      ? {
          data: at.data,
          loading: false,
          offline: false,
          failed: false,
          retry: city.retry,
          exact: at.exact,
          onPosition: true,
        }
      : { ...city, exact: null, onPosition: false },
    outing,
    busy,
  };
}

/** Le bouton « Utiliser ma position » : la même demande que « Ma météo » (l'appareil demande la permission une seule fois). */
export const giveMyPosition = () => askPracticalPosition(false);
