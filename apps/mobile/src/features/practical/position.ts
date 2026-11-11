// « Utiliser ma position » de « Pratique » (lot R8q). Même règle que « Ma météo » (lot R8m) : la position est demandée à l'appareil à
// l'appui du bouton seulement, ramenée à 0,1° AVANT l'envoi (corps de requête, jamais l'adresse) et gardée EN MÉMOIRE de l'appli :
// jamais écrite sur le téléphone, jamais dans un cache. Le compte et la génération sont capturés dès le geste et revérifiés après
// chaque attente (`positionStore`) : une réponse qui arrive après une déconnexion ou un autre compte est jetée.
// Ce qui diffère de la météo : l'API ne connaît que la case de 0,1° ; les distances (« 0,8 km ») se calculent ici, avec la position
// EXACTE, qui reste dans la mémoire de l'écran et ne part jamais (la case seule fausserait la distance de plusieurs kilomètres).
// Position partagée avec le bloc « Ma météo » pendant la séance : donner la position ici la donne aussi à la météo, et une position
// déjà donnée à la météo est reprise ici sans nouvelle demande (permission déjà accordée : aucune fenêtre ne s'ouvre).
import {
  coarsePosition,
  createPositionStore,
  type LatLng,
  PRACTICAL_PARTIAL_RETRY_MS,
  type PracticalAt,
} from "@orasso/shared";
import * as Location from "expo-location";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { askMyPosition, useWeatherPosition } from "@/features/weather/position";
import { api } from "@/lib/api";
import { cacheScope } from "@/lib/kv";

/** L'exacte du geste en cours : lue par la requête de la case, puis gardée avec la réponse (une relecture la reprend de là). */
let pendingExact: LatLng | null = null;

const store: ReturnType<typeof createPositionStore<PracticalAt>> = createPositionStore<PracticalAt>({
  scope: cacheScope,
  now: () => Date.now(),
  weatherAt: async (coarse): Promise<PracticalAt> => {
    const data = await api.practical({ near: "position", lat: coarse.lat, lng: coarse.lng });
    return { exact: pendingExact ?? store.getState().at?.exact ?? coarse, data };
  },
});

export type PracticalPosition = { at: PracticalAt | null; busy: boolean };

let lastView = store.view();
const snapshot = () => {
  const next = store.view();
  if (next.at !== lastView.at || next.busy !== lastView.busy) lastView = next;
  return lastView;
};

/** Les lieux de la position donnée à l'instant (ou `null`), et si la demande est en cours. */
export function usePracticalPosition(): PracticalPosition {
  const view = useSyncExternalStore(store.subscribe, snapshot, snapshot);
  useEffect(() => {
    store.purgeForeign();
  });
  return view;
}

async function give(exact: LatLng, ticket: NonNullable<ReturnType<typeof store.begin>>): Promise<boolean> {
  pendingExact = exact;
  try {
    return await store.give(coarsePosition(exact), ticket);
  } finally {
    pendingExact = null;
  }
}

/**
 * Demande la position à l'appareil puis les lieux de sa case. `false` si elle est refusée ou si rien n'a pu être lu : les lieux
 * restent ceux de la ville, sans message d'erreur. `silent` : reprend seulement une permission déjà accordée (aucune fenêtre).
 */
export async function askPracticalPosition(silent = false): Promise<boolean> {
  if (store.getState().busy) return false;
  const ticket = store.begin();
  if (!ticket) return false;
  store.setBusy(true);
  try {
    const permission = silent
      ? await Location.getForegroundPermissionsAsync()
      : await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted" || !store.valid(ticket)) return false;
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    if (!store.valid(ticket)) return false;
    const ok = await give({ lat: fix.coords.latitude, lng: fix.coords.longitude }, ticket);
    // La météo suit : la même position, la même séance (elle arrondit et garde la sienne).
    if (ok && !silent) void askMyPosition();
    return ok;
  } catch {
    return false;
  } finally {
    store.setBusy(false);
  }
}

/** Relit les lieux de la position gardée (retour sur l'écran, lieux partiels) : au plus toutes les dix minutes, sauf `force`. */
export const refreshPracticalPosition = (force = false) => store.refresh(force);

/** Oublie la position. */
export const forgetPracticalPosition = () => store.forget();

export const PARTIAL_RETRY_MS = PRACTICAL_PARTIAL_RETRY_MS;

/**
 * La position donnée à « Ma météo » est reprise ici une seule fois par position, sans nouvelle fenêtre : l'écran s'y accroche
 * (`useFollowWeatherPosition`).
 */
export function useFollowWeatherPosition(): void {
  const weather = useWeatherPosition();
  const mine = usePracticalPosition();
  const weatherAt = weather.at;
  const gap = weatherAt !== null && mine.at === null && !mine.busy;
  const tried = useRef<unknown>(null);
  useEffect(() => {
    // Une tentative par position de la météo : un échec ne relance pas en boucle.
    if (gap && tried.current !== weatherAt) {
      tried.current = weatherAt;
      void askPracticalPosition(true);
    }
  }, [weatherAt, gap]);
}
