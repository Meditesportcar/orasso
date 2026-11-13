// La zone de « Pratique » sur le site (petit lot de fin F, option C « Hybride ») : le contrôleur partagé (`createPracticalZone`) branché sur
// l'API du site. Ce qui est chargé reste en mémoire de la page, jamais écrit dans le navigateur ; seule la zone regardée part, la position
// exacte jamais. La recherche d'une ville passe par `GET /geo/cities` (le texte seul part), le filtre par enseigne se fait ici.
import {
  type CitySuggestion,
  createPracticalZone,
  type PracticalData,
  type PracticalZone,
  type PracticalZoneController,
  type ZoneState,
} from "@orasso/shared";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { apiFetch } from "../../lib/api.client";

class ZoneReadError extends Error {
  constructor(readonly status: number) {
    super(`lecture de la zone : ${status}`);
  }
}

/** Le contrôleur de zone d'une page « Pratique » (créé au montage, détruit au démontage). */
export function usePracticalZone(): { zone: PracticalZoneController; state: ZoneState } {
  const zone = useMemo(
    () =>
      createPracticalZone({
        read: async (z: PracticalZone) => {
          const res = await apiFetch<PracticalData>("/practical", {
            method: "POST",
            json: { near: "zone", ...z },
            timeoutMs: 15_000,
          });
          if (!res.ok) throw new ZoneReadError(res.status);
          return res.data;
        },
        visible: () => typeof document === "undefined" || document.visibilityState === "visible",
        statusOf: (error) => (error instanceof ZoneReadError ? error.status : null),
        onUnknown: (error) => console.error("[pratique] lecture de zone", error),
      }),
    [],
  );
  useEffect(() => {
    const resume = () => zone.resume();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      zone.dispose();
    };
  }, [zone]);
  const state = useSyncExternalStore(zone.subscribe, zone.getState, zone.getState);
  return { zone, state };
}

const DEBOUNCE_MS = 250;

/** Les communes que le texte tapé propose (deux lettres au moins, le texte seul part), après un court délai. */
export function useCitySearch(text: string): { cities: CitySuggestion[]; busy: boolean } {
  const [found, setFound] = useState<{ q: string; cities: CitySuggestion[] } | null>(null);
  const latest = useRef(0);
  const q = text.trim();
  useEffect(() => {
    const run = ++latest.current;
    if (q.length < 2) return undefined;
    const timer = setTimeout(() => {
      apiFetch<{ cities: CitySuggestion[] }>(`/geo/cities?q=${encodeURIComponent(q.slice(0, 80))}`, {
        timeoutMs: 10_000,
      })
        .then((res) => {
          if (run === latest.current) setFound({ q, cities: res.ok ? res.data.cities : [] });
        })
        .catch(() => {
          if (run === latest.current) setFound({ q, cities: [] });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);
  const current = found && found.q === q ? found.cities : [];
  return { cities: q.length < 2 ? [] : current, busy: q.length >= 2 && found?.q !== q };
}
