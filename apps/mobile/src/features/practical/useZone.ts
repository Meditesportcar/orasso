// La zone de « Pratique » (petit lot de fin F, option C « Hybride ») : le contrôleur partagé (`createPracticalZone`) branché sur l'API et sur
// l'appli. Ce qui est chargé reste en mémoire de l'écran, jamais écrit sur le téléphone ; seule la zone regardée part, la position exacte
// jamais. La recherche d'une ville passe par `GET /geo/cities` (le texte seul part), le filtre par enseigne se fait ici.
import {
  type CitySuggestion,
  createPracticalZone,
  type PracticalZone,
  type PracticalZoneController,
  type ZoneState,
} from "@orasso/shared";
import * as Sentry from "@sentry/react-native";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError } from "@/lib/http";

/** Le contrôleur de zone d'un écran « Pratique » (créé au montage, détruit au démontage). */
export function usePracticalZone(): { zone: PracticalZoneController; state: ZoneState } {
  const zone = useMemo(
    () =>
      createPracticalZone({
        read: (z: PracticalZone) => api.practical({ near: "zone", ...z }),
        visible: () => AppState.currentState === "active",
        statusOf: (error) => (error instanceof ApiRequestError ? error.status : null),
        onUnknown: (error) => {
          if (Sentry.getClient()) Sentry.captureException(error, { tags: { area: "practical-zone" } });
        },
      }),
    [],
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") zone.resume();
    });
    return () => {
      sub.remove();
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
      api
        .searchCities(q)
        .then((res) => {
          if (run === latest.current) setFound({ q, cities: res.cities });
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
