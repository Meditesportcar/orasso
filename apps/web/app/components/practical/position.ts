// « Utiliser ma position » de « Pratique » sur le site (lot R8q). Même règle que « Ma météo » (lot R8m) : demandée au clic seulement,
// arrondie à 0,1° AVANT l'envoi, envoyée en corps de requête (jamais dans l'adresse) et gardée EN MÉMOIRE de la page (jamais dans le
// stockage du navigateur) : recharger la page l'oublie. Liée au compte de la session et vidée dès que la session change ou disparaît
// (règles dans `positionStore` partagé : le compte et la génération sont capturés dès le geste et revérifiés après chaque attente).
// Les distances se calculent ici avec la position EXACTE, qui ne quitte jamais le navigateur ; l'API ne reçoit que la case.
// Position partagée avec « Ma météo » pendant la séance, dans les deux sens et sans seconde lecture de l'appareil : un geste ici lit la
// position une fois, envoie un POST, et donne la case déjà lue au magasin de la météo (même ticket de session, pris au geste) ; une
// position donnée à la météo est reprise ici si le navigateur a déjà la permission (aucune fenêtre ne s'ouvre).
import {
  coarsePosition,
  createFollowTracker,
  createPositionCalendar,
  createPositionStore,
  type LatLng,
  type PositionOutcome,
  PositionTimeoutError,
  type PracticalAt,
  type PracticalData,
  practicalFailureOutcome,
  weatherFollowKey,
} from "@orasso/shared";
import { useEffect, useSyncExternalStore } from "react";

import { apiFetch } from "../../lib/api.client";
import { currentSession, listenSession } from "../../lib/sessionChannel";
import { beginMyPosition, giveMyPositionCell, useWeatherPosition } from "../weather/position";

/** Un refus ou une panne de la demande de position : le statut HTTP (0 : le réseau n'a pas répondu) décide de la suite du calendrier. */
class PositionRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** L'exacte du geste en cours : lue par la requête de la case, puis gardée avec la réponse (une relecture la reprend de là). */
let pendingExact: LatLng | null = null;

const store: ReturnType<typeof createPositionStore<PracticalAt>> = createPositionStore<PracticalAt>({
  scope: currentSession,
  now: () => Date.now(),
  weatherAt: async (coarse): Promise<PracticalAt> => {
    // L'exacte est prise AU DÉPART de cette demande (avant toute attente) : une réponse ne reprend jamais l'exacte d'un autre geste.
    const exact = pendingExact ?? store.getState().at?.exact ?? coarse;
    const res = await apiFetch<PracticalData>("/practical", {
      method: "POST",
      json: { near: "position", lat: coarse.lat, lng: coarse.lng },
      // Abandon au bout de 15 s : échec, le magasin libère la demande en vol (tour 9).
      timeoutMs: 15_000,
    });
    if (!res.ok) throw new PositionRequestError(res.status, res.error.message);
    return { exact, data: res.data };
  },
});

/**
 * Le calendrier unique des relectures de lieux partiels (3, 6, 12, 24 s), partagé par tous les écrans montés : il lit le résultat de
 * chaque relecture (réponse, panne, refus, erreur inconnue) ; un refus (4xx) l'arrête et retient son heure, relu au retour sur
 * l'onglet après 60 s ; suspendu onglet masqué.
 */
const calendar = createPositionCalendar({
  visible: () => typeof document === "undefined" || document.visibilityState === "visible",
  refresh: async (): Promise<PositionOutcome> => {
    const result = await store.refresh(true);
    if (result.status !== "failed") return "ok";
    if (result.error instanceof PositionRequestError) return practicalFailureOutcome(result.error.status);
    return result.error instanceof PositionTimeoutError ? "transient" : "unknown";
  },
});

/** Un écran de « Pratique » est monté : le calendrier travaille tant qu'il l'est. */
export const retainPracticalCalendar = () => calendar.retain();

/** Le calendrier est arrêté (refus, erreur inconnue) : « Réessayer » est proposé. */
export const usePracticalCalendarFailed = () => useSyncExternalStore(calendar.subscribe, calendar.failed, () => false);

/** « Réessayer » : tout repart à 0 et les lieux de la position sont relus tout de suite. */
export const retryPracticalCalendar = () => calendar.retry();

// Suivi de la météo : une tentative par lieu pour la séance, remise à zéro à chaque changement de compte.
const follow = createFollowTracker();

if (typeof window !== "undefined") {
  // Comme « Ma météo » (R8m) : toute annonce de session qui change le compte (déconnexion = « aucun compte », ou un autre compte) efface
  // la position, invalide les demandes en cours (modèle de demande en vol conservé) et remet le suivi de la météo à zéro.
  // La clé du calendrier est la position gardée (`coarse` change à chaque position donnée) : une nouvelle position, un nouveau calendrier.
  store.subscribe(() => calendar.setPartial(store.view().at?.data.partial === true, store.view().coarse));
  // Retour sur l'onglet ou retour en ligne : la relecture due part (jamais depuis un onglet masqué), un refus est relu après 60 s.
  document.addEventListener("visibilitychange", () => calendar.resume());
  window.addEventListener("online", () => calendar.resume());
  let seen: string | null = currentSession();
  listenSession((userId) => {
    if (userId !== seen) {
      store.forget();
      follow.reset();
    }
    seen = userId;
  });
}

const EMPTY = { at: null, busy: false, coarse: null } as const;
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
  // Le ticket de la météo est pris au même geste : elle reçoit la case déjà lue, sans seconde lecture du navigateur.
  const weatherTicket = silent ? null : beginMyPosition();
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
    if (ok && weatherTicket) {
      // La météo affiche la même position ; son lieu n'est pas repris ici en retour (déjà connu).
      follow.echo();
      void giveMyPositionCell(coarsePosition(exact), weatherTicket);
    }
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
  // Clé de suivi : la case arrondie (0,1°) gardée par le magasin de la météo, jamais son libellé (« Ma position » quand le géocodage
  // échoue, même commune pour deux cases) ni l'heure de sa prévision : un rafraîchissement (même case) ne relance rien.
  const weatherKey = weatherFollowKey(weather.coarse);
  const busy = mine.busy;
  useEffect(() => {
    // Une tentative par lieu de la météo, pour toute la séance (pas à chaque montage de l'écran) : un échec ne relance pas en boucle.
    if (!busy && follow.shouldFollow(weatherKey)) void askPracticalPosition(true);
  }, [weatherKey, busy]);
}
