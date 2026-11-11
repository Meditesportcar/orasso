// « Utiliser ma position » de « Ma météo » sur le site (lot R8m). Comme dans l'appli : demandée au clic seulement, arrondie à
// 0,1° AVANT l'envoi, envoyée en corps de requête (jamais dans l'adresse), gardée EN MÉMOIRE de la page (jamais dans le
// stockage du navigateur ni dans un cookie) : recharger la page l'oublie. Refusée : la météo reste celle de la ville, sans
// message d'erreur.
import { coarsePosition, type LatLng, type WeatherAt } from "@orasso/shared";
import { useSyncExternalStore } from "react";

import { apiFetch } from "../../lib/api.client";

type State = { coarse: LatLng | null; at: WeatherAt | null; busy: boolean };

const EMPTY: State = { coarse: null, at: null, busy: false };
let state: State = EMPTY;
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

/** La météo de la position donnée à l'instant (ou `null`) et si la demande est en cours. */
export function useWeatherPosition(): { at: WeatherAt | null; busy: boolean } {
  // Le rendu serveur et l'hydratation partent de la même valeur vide ; la position gardée apparaît juste après.
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
  return { at: s.at, busy: s.busy };
}

function readPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("indisponible"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 300_000, timeout: 10_000 });
  });
}

/** Demande la position à l'appareil puis la météo de sa case. `false` si refusée ou indisponible (la ville reste). */
export async function askMyPosition(): Promise<boolean> {
  if (state.busy) return false;
  set({ busy: true });
  try {
    const fix = await readPosition();
    const coarse = coarsePosition({ lat: fix.coords.latitude, lng: fix.coords.longitude });
    const res = await apiFetch<WeatherAt>("/weather/at", { method: "POST", json: coarse });
    if (!res.ok) {
      set({ busy: false });
      return false;
    }
    set({ coarse, at: res.data, busy: false });
    return true;
  } catch {
    set({ busy: false });
    return false;
  }
}

/** Relit la météo de la position gardée (retour sur la page) ; sans position gardée, ne fait rien. */
export async function refreshMyPosition(): Promise<void> {
  const coarse = state.coarse;
  if (!coarse) return;
  const res = await apiFetch<WeatherAt>("/weather/at", { method: "POST", json: coarse });
  if (res.ok) set({ at: res.data });
}

/** Oublie la position (une ville choisie la remplace). */
export function forgetMyPosition(): void {
  set({ coarse: null, at: null });
}
