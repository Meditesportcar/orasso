// Horloge centrale du site (lot 34a) : l'heure de la machine, plus le décalage que l'API annonce dans l'en-tête
// `x-orasso-clock-offset` quand l'horloge simulée est active (développement seulement). Sans l'en-tête, le décalage est
// nul et `now()` vaut exactement `new Date()` : rien ne change. Sert au rendu serveur (loaders) comme au navigateur
// (comptes à rebours, délais) ; le loader racine transmet le décalage au navigateur.
import { setDisplayClock } from "@orasso/shared";
import { useSyncExternalStore } from "react";

let offsetMs = 0;
const listeners = new Set<() => void>();

/** Décalage courant en millisecondes (0 hors simulation). */
export const clockOffsetMs = () => offsetMs;

/** Heure d'Orasso en millisecondes. */
export const nowMs = () => Date.now() + offsetMs;

/** Heure d'Orasso. */
export const now = () => new Date(nowMs());

// Lot R3b : l'année des dates affichées (`@orasso/shared`) se décide à l'heure d'Orasso, horloge simulée comprise.
setDisplayClock(now);

/** Pose le décalage (valeur illisible ou négative : 0). Renvoie `true` s'il a changé. */
export function setClockOffset(ms: number): boolean {
  const next = Number.isFinite(ms) && ms > 0 ? Math.trunc(ms) : 0;
  if (next === offsetMs) return false;
  offsetMs = next;
  for (const listener of listeners) listener();
  return true;
}

/** Lit l'en-tête d'une réponse de l'API : présent, on adopte le décalage ; absent, il retombe à 0. */
export function applyClockHeader(value: string | null | undefined) {
  setClockOffset(value == null ? 0 : Number(value));
}

export function subscribeClock(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Décalage courant, avec rendu à chaque changement (bandeau « Horloge simulée »). */
export function useClockOffset(): number {
  return useSyncExternalStore(subscribeClock, clockOffsetMs, clockOffsetMs);
}

// Lot R7i (tour 3) : décalage entre l'horloge du navigateur et celle du serveur. Le loader racine donne l'heure du serveur
// (`serverAt`) ; le décalage se mesure une fois par valeur reçue, dans le navigateur seulement. Positif : le navigateur retarde.
let serverSkew = 0;
let serverAtSeen: number | null = null;

/** Retient le décalage navigateur / serveur d'une nouvelle valeur `serverAt` du loader (navigateur seulement). */
export function noteServerAt(serverAt: number) {
  if (typeof window === "undefined" || serverAt === serverAtSeen || !Number.isFinite(serverAt)) return;
  serverAtSeen = serverAt;
  serverSkew = Math.round(serverAt - Date.now());
  // Appelé pendant le rendu du Layout : on prévient les abonnés juste après, pas au milieu du rendu.
  queueMicrotask(() => {
    for (const listener of listeners) listener();
  });
}

/** Décalage navigateur / serveur en millisecondes (0 tant qu'aucune mesure ou au rendu serveur). */
export const serverSkewMs = () => serverSkew;

/** Heure du serveur estimée (horloge simulée comprise), en millisecondes : celle qui décide de la fin d'un rendez-vous. */
export const serverNowMs = () => nowMs() + serverSkew;

/** Décalage navigateur / serveur, avec rendu à chaque changement. */
export function useServerSkew(): number {
  return useSyncExternalStore(subscribeClock, serverSkewMs, () => 0);
}
