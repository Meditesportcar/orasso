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
import { currentSession, listenSession } from "../../lib/sessionChannel";

class ZoneReadError extends Error {
  constructor(readonly status: number) {
    super(`lecture de la zone : ${status}`);
  }
}

// Tour 2 : le magasin de zones est rattaché au compte. Un autre compte (autre onglet, déconnexion) remonte la page (clé) : mémoire, recherche et
// cadrage effacés, requêtes en vol jetées, aucune réponse tardive appliquée.
/** La clé du compte courant : elle change à chaque annonce de session. */
export function usePracticalScope(): number {
  const raw = useSyncExternalStore(
    (cb) => listenSession(() => cb()),
    () => currentSession() ?? "-",
    () => "-",
  );
  // Un vrai changement de compte seulement (A vers B, A vers déconnecté) : jamais de « inconnu » (la mise en page n'a pas encore annoncé la
  // session) vers A, sinon l'écran se monterait deux fois à chaque chargement (deux fois plus de lectures).
  const memo = useRef({ raw, generation: 0 });
  if (memo.current.raw !== raw) {
    if (memo.current.raw !== "-") memo.current.generation += 1;
    memo.current.raw = raw;
  }
  return memo.current.generation;
}

/** Le contrôleur de zone d'une page « Pratique » (créé au montage, détruit au démontage). */
export function usePracticalZone(): { zone: PracticalZoneController; state: ZoneState } {
  const zone = useMemo(
    () =>
      createPracticalZone({
        read: async (z: PracticalZone, cursor?: string) => {
          const res = await apiFetch<PracticalData>("/practical", {
            method: "POST",
            json: { near: "zone", ...z, ...(cursor ? { cursor } : {}) },
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
    // Réentrant : le rendu strict (développement) monte, nettoie puis remonte : le contrôleur doit rester vivant.
    zone.attach();
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` relance la même recherche (« Réessayer », retour du réseau).
  useEffect(() => {
    const run = ++latest.current;
    if (q.length < 2) return undefined;
    const timer = setTimeout(() => {
      apiFetch<{ cities: CitySuggestion[] }>(`/geo/cities?q=${encodeURIComponent(q.slice(0, 80))}`, {
        timeoutMs: 10_000,
      })
        .then((res) => {
          if (run === latest.current) setFound({ q, cities: res.ok ? res.data.cities : [], failed: !res.ok });
        })
        .catch(() => {
          if (run === latest.current) setFound({ q, cities: [], failed: true });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, attempt]);
  // Le réseau revient : une recherche en échec repart d'elle-même.
  useEffect(() => {
    const online = () => setAttempt((a) => a + 1);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);
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
