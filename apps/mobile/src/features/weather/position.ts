// « Utiliser ma position » de « Ma météo » (lot R8m, décision de Damien : jamais enregistrée). La position est demandée à
// l'appareil à l'appui du bouton seulement (aucune lecture en arrière-plan), ramenée à 0,1° (environ 11 km) AVANT l'envoi,
// envoyée en corps de requête (pas dans l'adresse) et gardée EN MÉMOIRE de l'appli : jamais écrite sur le téléphone, jamais
// dans un cache. Fermer l'appli, se déconnecter ou changer de compte l'oublie (règles dans `positionStore.ts`). Refusée : la
// météo reste celle de la ville, sans message.
import { coarsePosition, createPositionStore } from "@orasso/shared";
import * as Location from "expo-location";
import { useEffect, useSyncExternalStore } from "react";

import { api } from "@/lib/api";
import { cacheScope, onCacheScopeDropped } from "@/lib/kv";

const store = createPositionStore({
  scope: cacheScope,
  now: () => Date.now(),
  weatherAt: (position) => api.weatherAt(position),
});

// Chaque fin de session (déconnexion, autre compte) invalide les demandes en cours, même sans position gardée :
// A → déconnexion → A pendant l'attente du GPS ne ramène pas l'ancienne demande.
onCacheScopeDropped(async () => store.forget());

export type WeatherPosition = { at: ReturnType<typeof store.view>["at"]; busy: boolean };

let lastView = store.view();
const snapshot = () => {
  const next = store.view();
  // Même contenu : même objet, pour `useSyncExternalStore`.
  if (next.at !== lastView.at || next.busy !== lastView.busy) lastView = next;
  return lastView;
};

/** La météo de la position donnée à l'instant (ou `null`), et si la demande est en cours. */
export function useWeatherPosition(): WeatherPosition {
  const view = useSyncExternalStore(store.subscribe, snapshot, snapshot);
  // Une autre session que celle de la position : elle est oubliée tout de suite.
  useEffect(() => {
    store.purgeForeign();
  });
  return view;
}

/**
 * Demande la position à l'appareil puis la météo de sa case. `false` si elle est refusée ou si rien n'a pu être lu : la
 * météo reste celle de la ville, sans message d'erreur.
 */
export async function askMyPosition(): Promise<boolean> {
  if (store.getState().busy) return false;
  // Le compte et la génération sont capturés DÈS LE GESTE et revérifiés après chaque attente (permission, GPS, réseau).
  const ticket = store.begin();
  if (!ticket) return false;
  store.setBusy(true);
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted" || !store.valid(ticket)) return false;
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    if (!store.valid(ticket)) return false;
    return await store.give(coarsePosition({ lat: fix.coords.latitude, lng: fix.coords.longitude }), ticket);
  } catch {
    return false;
  } finally {
    store.setBusy(false);
  }
}

/** Relit la météo de la position gardée (retour sur l'écran, premier plan, actualisation manuelle : `force`). */
export const refreshMyPosition = (force = false) => store.refresh(force);

/** Oublie la position (une ville choisie la remplace). */
export const forgetMyPosition = () => store.forget();
