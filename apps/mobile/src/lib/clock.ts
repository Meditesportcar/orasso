// Horloge centrale de l'appli (lot 34a) : l'heure de l'appareil, plus le décalage que l'API annonce dans l'en-tête
// `x-orasso-clock-offset` quand l'horloge simulée est active (développement seulement). Sans l'en-tête, le décalage est
// nul et `now()` vaut exactement `new Date()` : rien ne change. Tout ce qui décide d'une règle du temps (ouverture des
// inscriptions, jour J, mode staff, validité d'un QR, comptes à rebours) passe par ici ; les durées techniques
// (anti-rebond d'un scan, attente avant une nouvelle tentative) restent sur `Date.now()`.
import { useSyncExternalStore } from "react";

let offsetMs = 0;
/** Une réponse de l'API a déjà donné le décalage : celui gardé sur l'appareil n'a plus lieu d'être relu. */
let heard = false;
const listeners = new Set<() => void>();

/** Décalage courant en millisecondes (0 hors simulation). */
export const clockOffsetMs = () => offsetMs;

/** Heure d'Orasso en millisecondes. */
export const nowMs = () => Date.now() + offsetMs;

/** Heure d'Orasso. */
export const now = () => new Date(nowMs());

/** Pose le décalage (valeur illisible ou négative : 0). Renvoie `true` si le décalage a changé. */
export function setClockOffset(ms: number): boolean {
  const next = Number.isFinite(ms) && ms > 0 ? Math.trunc(ms) : 0;
  if (next === offsetMs) return false;
  offsetMs = next;
  for (const listener of listeners) listener();
  return true;
}

/**
 * Lit l'en-tête d'une réponse de l'API. Présent : on adopte le décalage. Absent sur une réponse reçue : l'API n'a pas
 * d'horloge simulée, le décalage retombe à 0. Hors ligne il n'y a pas de réponse, donc le dernier décalage connu reste.
 */
export function applyClockHeader(value: string | null | undefined) {
  heard = true;
  const was = available;
  available = value != null;
  // Un seul rendu par réponse : le changement d'offset prévient déjà les abonnés.
  const changed = setClockOffset(value == null ? 0 : Number(value));
  if (!changed && was !== available) for (const listener of listeners) listener();
}

/** L'API propose l'horloge simulée (elle envoie l'en-tête, même à 0) : l'écran « Horloge » de l'administration existe (lot 35d). */
let available = false;
export const clockAvailable = () => available;

/**
 * Au lancement, reprend le dernier décalage connu (gardé sur l'appareil) : le mode staff hors ligne reste à l'heure
 * simulée qu'il avait. Sans effet si une réponse de l'API a déjà donné le décalage.
 */
export function restoreClockOffset(ms: number) {
  if (!heard) setClockOffset(ms);
}

/** Remet l'état d'origine (tests). */
export function resetClockForTests() {
  offsetMs = 0;
  heard = false;
  available = false;
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

/** L'horloge simulée est-elle proposée par l'API (lot 35d) ? */
export function useClockAvailable(): boolean {
  return useSyncExternalStore(subscribeClock, clockAvailable, clockAvailable);
}
