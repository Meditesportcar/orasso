// Les lieux de « Pratique » pour le bloc de l'Accueil et l'écran « Voir tout » (lot R8q) : près de moi (la position donnée à
// l'instant, sinon ma ville) et près de ma sortie. Chaque lecture est un `POST /practical` (le bloc lit lui-même, quand il est
// affiché : il n'est pas dans `GET /me/home`). Rien n'est écrit sur le téléphone : la dernière réponse de la séance reste en mémoire
// (hors ligne, le bloc n'affiche rien de faux : cette réponse, sinon rien). Réponse partielle (une source n'a pas répondu dans le
// budget de l'API) : une seule relecture, après 3 secondes.
import type { LatLng, PracticalChoice, PracticalData, PracticalFilter } from "@orasso/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { cacheScope } from "@/lib/kv";
import {
  askPracticalPosition,
  PARTIAL_RETRY_MS,
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

/** Relit au retour sur l'écran quand la réponse a plus d'une minute. */
const STALE_MS = 60_000;

function useRead(near: "city" | "outing", enabled: boolean, eventId?: string): Read {
  const [state, setState] = useState<Read>(() => ({
    data: remembered(near, eventId),
    loading: enabled,
    offline: false,
  }));
  const fetchedAt = useRef(0);
  const retried = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled) return;
    const scope = cacheScope();
    try {
      const data = await api.practical(near === "city" ? { near } : { near, ...(eventId ? { eventId } : {}) });
      // Une réponse arrivée après un changement de compte ou de sortie est jetée.
      if (!alive.current || cacheScope() !== scope) return;
      const key = keyOf(near, eventId);
      if (key) memory.set(key, data);
      fetchedAt.current = Date.now();
      setState({ data, loading: false, offline: false });
      if (data.partial && !retried.current) {
        retried.current = true;
        timer.current = setTimeout(() => void load(), PARTIAL_RETRY_MS);
      }
    } catch {
      if (!alive.current || cacheScope() !== scope) return;
      setState((s) => ({ data: s.data ?? remembered(near, eventId), loading: false, offline: true }));
    }
  }, [enabled, near, eventId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` change avec ses entrées ; une lecture par changement.
  useEffect(() => {
    retried.current = false;
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState({ data: remembered(near, eventId), loading: true, offline: false });
    void load();
  }, [enabled, near, eventId]);

  useFocusEffect(
    useCallback(() => {
      if (enabled && fetchedAt.current && Date.now() - fetchedAt.current > STALE_MS) void load();
    }, [enabled, load]),
  );
  return state;
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
  useEffect(() => {
    if (!partial) return undefined;
    const timer = setTimeout(() => void refreshPracticalPosition(true), PARTIAL_RETRY_MS);
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

/** Le bouton « Utiliser ma position » : la même demande que « Ma météo » (l'appareil demande la permission une seule fois). */
export const giveMyPosition = () => askPracticalPosition(false);
