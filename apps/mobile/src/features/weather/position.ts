// « Utiliser ma position » de « Ma météo » (lot R8m, décision de Damien : jamais enregistrée). La position est demandée à
// l'appareil à l'appui du bouton seulement (aucune lecture en arrière-plan), ramenée à 0,1° (environ 11 km) AVANT l'envoi,
// envoyée en corps de requête (pas dans l'adresse) et gardée EN MÉMOIRE de l'appli : jamais écrite sur le téléphone, jamais
// dans un cache. Fermer l'appli ou changer de compte l'oublie. Refusée : la météo reste celle de la ville, sans message.
import { coarsePosition, type LatLng, type WeatherAt } from "@orasso/shared";
import * as Location from "expo-location";
import { useSyncExternalStore } from "react";

import { api } from "@/lib/api";
import { cacheScope } from "@/lib/kv";

type State = {
  /** Compte pour lequel la position a été donnée : une autre session ne la voit pas. */
  owner: string | null;
  /** La position arrondie, pour rafraîchir la météo sans redemander. */
  coarse: LatLng | null;
  at: WeatherAt | null;
  busy: boolean;
};

let state: State = { owner: null, coarse: null, at: null, busy: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => state;

export type WeatherPosition = { at: WeatherAt | null; busy: boolean };

/** La météo de la position donnée à l'instant (ou `null`), et si la demande est en cours. */
export function useWeatherPosition(): WeatherPosition {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const mine = s.owner !== null && s.owner === cacheScope();
  return { at: mine ? s.at : null, busy: s.busy };
}

/**
 * Demande la position à l'appareil puis la météo de sa case. `false` si elle est refusée ou si rien n'a pu être lu : la
 * météo reste celle de la ville, sans message d'erreur.
 */
export async function askMyPosition(): Promise<boolean> {
  if (state.busy) return false;
  set({ busy: true });
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      set({ busy: false });
      return false;
    }
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coarse = coarsePosition({ lat: fix.coords.latitude, lng: fix.coords.longitude });
    const at = await api.weatherAt(coarse);
    set({ owner: cacheScope(), coarse, at, busy: false });
    return true;
  } catch {
    set({ busy: false });
    return false;
  }
}

/** Relit la météo de la position gardée (retour sur l'écran) ; sans position gardée, ne fait rien. */
export async function refreshMyPosition(): Promise<void> {
  const coarse = state.coarse;
  if (!coarse || state.owner !== cacheScope()) return;
  try {
    set({ at: await api.weatherAt(coarse) });
  } catch {
    // Hors ligne : la dernière météo connue reste affichée.
  }
}

/** Oublie la position (une ville choisie la remplace). */
export function forgetMyPosition(): void {
  set({ owner: null, coarse: null, at: null });
}
