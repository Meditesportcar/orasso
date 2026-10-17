// Horloge centrale du site (lot 34a) : l'heure de la machine, plus le décalage que l'API annonce dans l'en-tête
// `x-orasso-clock-offset` quand l'horloge simulée est active (développement seulement). Sans l'en-tête, le décalage est
// nul et `now()` vaut exactement `new Date()` : rien ne change. Sert au rendu serveur (loaders) comme au navigateur
// (comptes à rebours, délais) ; le loader racine transmet le décalage au navigateur.
import { useSyncExternalStore } from "react";

let offsetMs = 0;
const listeners = new Set<() => void>();

/** Décalage courant en millisecondes (0 hors simulation). */
export const clockOffsetMs = () => offsetMs;

/** Heure d'Orasso en millisecondes. */
export const nowMs = () => Date.now() + offsetMs;

/** Heure d'Orasso. */
export const now = () => new Date(nowMs());

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
