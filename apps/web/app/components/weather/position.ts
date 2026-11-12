// « Utiliser ma position » de « Ma météo » sur le site (lot R8m). Comme dans l'appli : demandée au clic seulement, arrondie à
// 0,1° AVANT l'envoi, envoyée en corps de requête (jamais dans l'adresse), gardée EN MÉMOIRE de la page (jamais dans le
// stockage du navigateur) : recharger la page l'oublie. Tour 2 : liée au compte de la session (annonce de session déjà en
// place, `sessionChannel`) et vidée dès que la session change ou disparaît (expiration, déconnexion, autre compte, dans
// n'importe quelle fenêtre) ; une réponse lancée sous l'ancienne session est jetée (règles dans `positionStore` partagé).
import { coarsePosition, createPositionStore, type WeatherAt } from "@orasso/shared";
import { useSyncExternalStore } from "react";

import { apiFetch } from "../../lib/api.client";
import { currentSession, listenSession } from "../../lib/sessionChannel";

/**
 * Le dernier compte annoncé NON nul : la mise en page annonce brièvement « aucun compte » pendant une revalidation (après un
 * formulaire) ; ce n'est pas une déconnexion, la position gardée ne doit pas être oubliée pour autant.
 */
let lastUser: string | null = currentSession();

const store = createPositionStore({
  // Le dernier compte annoncé par la mise en page, même si l'annonce a eu lieu avant le chargement de ce module.
  scope: () => currentSession() ?? lastUser,
  now: () => Date.now(),
  weatherAt: async (position) => {
    const res = await apiFetch<WeatherAt>("/weather/at", { method: "POST", json: position });
    if (!res.ok) throw new Error(res.error.message);
    return res.data;
  },
});

if (typeof window !== "undefined") {
  // Chaque transition de session invalide les demandes en cours, même sans position gardée (A → aucun → A pendant le GPS).
  // Une annonce « aucun compte » invalide les demandes en cours (la position gardée reste liée à son compte) ; un autre compte
  // efface la position.
  listenSession((userId) => {
    if (userId === null) {
      // Les demandes en cours sont invalidées ; la position gardée reste (annonce transitoire possible).
      store.invalidate();
      return;
    }
    // Un autre compte : la position de l'ancien est effacée.
    if (lastUser !== null && userId !== lastUser) store.forget();
    lastUser = userId;
  });
}

const EMPTY = { at: null, busy: false } as const;
let last = store.view();
const snapshot = () => {
  const next = store.view();
  if (next.at !== last.at || next.busy !== last.busy) last = next;
  return last;
};

/** La météo de la position donnée à l'instant (ou `null`) et si la demande est en cours. */
export function useWeatherPosition() {
  // Le rendu serveur et l'hydratation partent de la même valeur vide ; la position gardée apparaît juste après.
  return useSyncExternalStore(store.subscribe, snapshot, () => EMPTY);
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
  if (store.getState().busy) return false;
  // Le compte et la génération sont capturés DÈS LE GESTE et revérifiés après chaque attente (GPS, réseau).
  const ticket = store.begin();
  if (!ticket) return false;
  store.setBusy(true);
  try {
    const fix = await readPosition();
    if (!store.valid(ticket)) return false;
    return await store.give(coarsePosition({ lat: fix.coords.latitude, lng: fix.coords.longitude }), ticket);
  } catch {
    return false;
  } finally {
    store.setBusy(false);
  }
}

/** Relit la météo de la position gardée (retour sur la page, actualisation) : au plus toutes les dix minutes, sauf `force`. */
export const refreshMyPosition = (force = false) => store.refresh(force);

/** Oublie la position (une ville choisie la remplace). */
export const forgetMyPosition = () => store.forget();
