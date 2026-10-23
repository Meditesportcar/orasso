// « Tes préférences » (lot M6) : lecture des préférences du compte (`GET /me/preferences`), gardées en cache pour
// s'afficher tout de suite. L'Explorer (lot M4) s'en sert pour s'ouvrir filtré (types d'événements, distance,
// départements) et pour la pastille « Filtres » (`preferenceFilterCount`). La fin de l'ajout du premier véhicule (lot M1)
// passe par `routeAfterFirstVehicle` : la route `/preferences?premiere=1` si l'étape n'a jamais été vue, sinon
// l'Explorer.
import { isEverywhere, type Preferences, type PreferencesUpdate, shouldAskPreferences } from "@orasso/shared";
import { useCallback } from "react";

import { api } from "./api";
import { useApi } from "./useApi";

/** La route de l'étape, plein écran (mode B). `premiere=1` : dernière étape de l'arrivée (« Passer », « Découvrir »). */
export const PREFERENCES_ROUTE = "/preferences";
export const PREFERENCES_FIRST_ROUTE = "/preferences?premiere=1";
export const EXPLORER_ROUTE = "/(tabs)/explorer";

/**
 * Lecture des préférences (et `save` : enregistre puis met à jour la copie affichée). `everywhere` = « Partout en
 * France » (distance `null`) : la valeur que lit le sélecteur « Autour de… » de l'Explorer (lot M4), qui ne modifie
 * jamais les préférences.
 */
export function usePreferences() {
  const query = useApi(() => api.preferences(), [], { cacheKey: "preferences" });
  const { setData } = query;
  const save = useCallback(
    async (patch: PreferencesUpdate): Promise<Preferences> => {
      const next = await api.updatePreferences(patch);
      setData(next);
      return next;
    },
    [setData],
  );
  const everywhere = isEverywhere(query.data);
  return {
    preferences: query.data,
    everywhere,
    loading: query.loading,
    error: query.error,
    reload: query.reload,
    save,
  };
}

/**
 * Après l'ajout du premier véhicule : l'étape « Tes préférences » si le compte ne l'a jamais vue, sinon l'Explorer.
 * Hors ligne ou en erreur : l'Explorer (l'étape reste proposée la prochaine fois).
 */
export async function routeAfterFirstVehicle(): Promise<string> {
  try {
    return shouldAskPreferences(await api.preferences()) ? PREFERENCES_FIRST_ROUTE : EXPLORER_ROUTE;
  } catch {
    return EXPLORER_ROUTE;
  }
}
