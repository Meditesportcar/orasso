// « Utiliser ma position » de « Pratique » sur le site (lot R8q). Même règle que « Ma météo » (lot R8m) : demandée au clic seulement,
// arrondie à 0,1° AVANT l'envoi, envoyée en corps de requête (jamais dans l'adresse) et gardée EN MÉMOIRE de la page (jamais dans le
// stockage du navigateur) : recharger la page l'oublie. Liée au compte de la session et vidée dès que la session change ou disparaît
// (règles dans `positionStore` partagé : le compte et la génération sont capturés dès le geste et revérifiés après chaque attente).
// Les distances se calculent ici avec la position EXACTE, qui ne quitte jamais le navigateur ; l'API ne reçoit que la case.
// Position partagée avec « Ma météo » pendant la séance : la donner ici la donne aussi à la météo, et une position déjà donnée à la
// météo est reprise ici si le navigateur a déjà la permission (aucune fenêtre ne s'ouvre).
import { coarsePosition, createPositionStore, type LatLng, type PracticalAt, type PracticalData } from "@orasso/shared";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { apiFetch } from "../../lib/api.client";
import { currentSession, listenSession } from "../../lib/sessionChannel";
import { askMyPosition, useWeatherPosition } from "../weather/position";

/** L'exacte du geste en cours : lue par la requête de la case, puis gardée avec la réponse (une relecture la reprend de là). */
let pendingExact: LatLng | null = null;

const store: ReturnType<typeof createPositionStore<PracticalAt>> = createPositionStore<PracticalAt>({
  scope: currentSession,
  now: () => Date.now(),
  weatherAt: async (coarse): Promise<PracticalAt> => {
    const res = await apiFetch<PracticalData>("/practical", {
      method: "POST",
      json: { near: "position", lat: coarse.lat, lng: coarse.lng },
    });
    if (!res.ok) throw new Error(res.error.message);
    return { exact: pendingExact ?? store.getState().at?.exact ?? coarse, data: res.data };
  },
});

if (typeof window !== "undefined") {
  listenSession(() => store.purgeForeign());
}

const EMPTY = { at: null, busy: false } as const;
let last = store.view();
const snapshot = () => {
  const next = store.view();
  if (next.at !== last.at || next.busy !== last.busy) last = next;
  return last;
};

/** Les lieux de la position donnée à l'instant (ou `null`) et si la demande est en cours. */
export function usePracticalPosition() {
  // Le rendu serveur et l'hydratation partent de la même valeur vide ; la position gardée apparaît juste après.
  return useSyncExternalStore(store.subscribe, snapshot, () => EMPTY);
}

function readPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("indisponible"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 0, timeout: 10_000 });
  });
}

/** La permission de position est-elle déjà accordée ? (sans rien demander) */
async function alreadyGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state === "granted";
  } catch {
    return false;
  }
}

/**
 * Demande la position au navigateur puis les lieux de sa case. `false` si refusée ou indisponible (la ville reste, sans message).
 * `silent` : reprend seulement une permission déjà accordée (aucune fenêtre).
 */
export async function askPracticalPosition(silent = false): Promise<boolean> {
  if (store.getState().busy) return false;
  const ticket = store.begin();
  if (!ticket) return false;
  store.setBusy(true);
  try {
    if (silent && !(await alreadyGranted())) return false;
    const fix = await readPosition();
    if (!store.valid(ticket)) return false;
    const exact = { lat: fix.coords.latitude, lng: fix.coords.longitude };
    pendingExact = exact;
    let ok = false;
    try {
      ok = await store.give(coarsePosition(exact), ticket);
    } finally {
      pendingExact = null;
    }
    // La météo suit : la même position, la même séance (elle arrondit et garde la sienne).
    if (ok && !silent) void askMyPosition();
    return ok;
  } catch {
    return false;
  } finally {
    store.setBusy(false);
  }
}

/** Relit les lieux de la position gardée (retour sur la page, lieux partiels) : au plus toutes les dix minutes, sauf `force`. */
export const refreshPracticalPosition = (force = false) => store.refresh(force);

/** Oublie la position. */
export const forgetPracticalPosition = () => store.forget();

/**
 * Lot R8q, tour 2 : « Pratique » suit « Ma météo ». Chaque nouvelle position donnée à la météo est reprise ici une seule fois, sans nouvelle
 * fenêtre (permission déjà accordée) : une deuxième position dans la même séance remplace la première des deux côtés.
 */
export function useFollowWeatherPosition(): void {
  const weather = useWeatherPosition();
  const mine = usePracticalPosition();
  const weatherKey = weather.at ? `${weather.at.label}|${weather.at.weather?.fetchedAt ?? ""}` : null;
  const tried = useRef<string | null>(null);
  const busy = mine.busy;
  useEffect(() => {
    // Une tentative par position de la météo : un échec ne relance pas en boucle.
    if (weatherKey && !busy && tried.current !== weatherKey) {
      tried.current = weatherKey;
      void askPracticalPosition(true);
    }
  }, [weatherKey, busy]);
}
