// Les lieux de « Pratique » pour le bloc de l'Accueil et la page « Voir tout » du site (lot R8q) : près de moi (la position donnée à
// l'instant, sinon ma ville) et près de ma sortie. Chaque lecture est un `POST /practical` fait par le navigateur quand le bloc est
// affiché (il n'est pas dans `GET /me/home`). Rien n'est écrit dans le navigateur : la dernière réponse de la séance reste en mémoire.
// Réponse partielle : une seule relecture, après 3 secondes.
import {
  PRACTICAL_PARTIAL_RETRY_MS,
  type PracticalChoice,
  type PracticalData,
  type PracticalFilter,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { currentSession } from "../../lib/sessionChannel";
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

function useRead(near: "city" | "outing", enabled: boolean): Read {
  // Le rendu serveur et l'hydratation partent de la même valeur vide ; la mémoire de la séance est reprise après.
  const [state, setState] = useState<Read>({ data: null, loading: enabled, offline: false });
  const retried = useRef(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    const scope = currentSession();
    const res = await apiFetch<PracticalData>("/practical", { method: "POST", json: { near } });
    // Une réponse arrivée après un changement de compte est jetée (la session peut ne pas être annoncée au premier montage).
    if (scope !== null && currentSession() !== scope) return;
    if (!res.ok) {
      setState((s) => ({ data: s.data ?? remembered(near), loading: false, offline: true }));
      return;
    }
    const key = keyOf(near);
    if (key) memory.set(key, res.data);
    setState({ data: res.data, loading: false, offline: false });
    if (res.data.partial && !retried.current) {
      retried.current = true;
      setTimeout(() => void load(), PRACTICAL_PARTIAL_RETRY_MS);
    }
  }, [enabled, near]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: une lecture par changement de `load`.
  useEffect(() => {
    retried.current = false;
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }
    setState({ data: remembered(near), loading: true, offline: false });
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
