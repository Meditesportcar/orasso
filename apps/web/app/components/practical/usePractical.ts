// Les lieux de « Pratique » pour le bloc de l'Accueil et la page « Voir tout » du site (lot R8q) : près de moi (la position donnée à
// l'instant, sinon ma ville) et près de ma sortie. Chaque lecture est un `POST /practical` fait par le navigateur quand le bloc est
// affiché (il n'est pas dans `GET /me/home`). Rien n'est écrit dans le navigateur : la dernière réponse de la séance reste en mémoire.
// Réponse partielle : une seule relecture, après 3 secondes.
import {
  createSessionGuard,
  PRACTICAL_PARTIAL_RETRY_MS,
  type PracticalChoice,
  type PracticalData,
  type PracticalFilter,
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

type Read = { data: PracticalData | null; loading: boolean; offline: boolean };

/** Le compte et la génération de session sont capturés au départ d'une lecture et revérifiés à son arrivée (lot R8q, tour 2). */
const guard = createSessionGuard(currentSession);

/** Le compte annoncé par la mise en page : `null` tant qu'il ne l'est pas (le rendu serveur part de la même valeur vide). */
function useSessionId(): string | null {
  return useSyncExternalStore(
    (notify) => listenSession(() => notify()),
    currentSession,
    () => null,
  );
}

function useRead(near: "city" | "outing", enabled: boolean): Read {
  // Le rendu serveur et l'hydratation partent de la même valeur vide ; la mémoire de la séance est reprise après.
  const who = useSessionId();
  const [state, setState] = useState<Read>({ data: null, loading: enabled, offline: false });
  const retried = useRef(false);

  // Sans identité connue, rien ne part (la lecture attend l'annonce de la session, `who` change alors et relance l'effet).
  const load = useCallback(async () => {
    if (!enabled || !who) return;
    const ticket = guard.begin();
    if (!ticket) return;
    const res = await apiFetch<PracticalData>("/practical", { method: "POST", json: { near } });
    // Une réponse devenue étrangère (autre compte, autre génération de session) est jetée.
    if (!guard.valid(ticket)) return;
    if (!res.ok) {
      setState((s) => ({ data: s.data ?? remembered(near), loading: false, offline: true }));
      return;
    }
    memory.set(`${ticket.who}|${near}`, res.data);
    setState({ data: res.data, loading: false, offline: false });
    if (res.data.partial && !retried.current) {
      retried.current = true;
      setTimeout(() => void load(), PRACTICAL_PARTIAL_RETRY_MS);
    }
  }, [enabled, near, who]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: une lecture par changement de `load` (entrées ou compte).
  useEffect(() => {
    retried.current = false;
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }
    // Un autre compte (ou aucun) : les données de l'ancien disparaissent tout de suite.
    setState({ data: who ? remembered(near) : null, loading: true, offline: false });
    void load();
    return undefined;
  }, [load]);
  return state;
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
  useEffect(() => {
    if (!partial) return undefined;
    const timer = setTimeout(() => void refreshPracticalPosition(true), PRACTICAL_PARTIAL_RETRY_MS);
    return () => clearTimeout(timer);
  }, [partial]);
  return {
    me: at
      ? { data: at.data, loading: false, offline: false, exact: at.exact, onPosition: true }
      : { ...city, exact: null, onPosition: false },
    outing,
    busy,
  };
}
