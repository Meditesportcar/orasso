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
import { onCacheScopeDropped } from "@/lib/kv";

// Tour 2 : le magasin de zones est rattaché au compte. Une fin de session ou un autre compte remonte l'écran (clé) : mémoire, recherche et
// cadrage effacés, requêtes en vol jetées. Un seul abonnement au module `kv` (ses gestionnaires ne se retirent pas).
const scopeListeners = new Set<() => void>();
let scopeVersion = 0;
onCacheScopeDropped(async () => {
  scopeVersion += 1;
  for (const l of scopeListeners) l();
});
/** La clé du compte courant : elle ne change qu'à une fin de session (jamais quand l'identité devient connue). */
export function usePracticalScope(): number {
  return useSyncExternalStore(
    (cb) => {
      scopeListeners.add(cb);
      return () => {
        scopeListeners.delete(cb);
      };
    },
    () => scopeVersion,
    () => 0,
  );
}

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
    // Réentrant : un montage double (rendu strict) rend le contrôleur vivant.
    zone.attach();
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
export function useCitySearch(text: string): {
  cities: CitySuggestion[];
  busy: boolean;
  /** La recherche de villes a échoué (réseau, serveur) : ce n'est pas « Aucun résultat » ; la saisie est gardée, `retry` relance. */
  failed: boolean;
  retry: () => void;
} {
  const [found, setFound] = useState<{ q: string; cities: CitySuggestion[]; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const q = text.trim();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` relance la même recherche (« Réessayer »).
  useEffect(() => {
    const run = ++latest.current;
    if (q.length < 2) return undefined;
    const timer = setTimeout(() => {
      api
        .searchCities(q)
        .then((res) => {
          if (run === latest.current) setFound({ q, cities: res.cities, failed: false });
        })
        .catch(() => {
          if (run === latest.current) setFound({ q, cities: [], failed: true });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, attempt]);
  const current = found && found.q === q ? found : null;
  return {
    cities: q.length < 2 ? [] : (current?.cities ?? []),
    busy: q.length >= 2 && current === null,
    failed: q.length >= 2 && current?.failed === true,
    retry: () => {
      setFound(null);
      setAttempt((a) => a + 1);
    },
  };
}
