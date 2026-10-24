// Horloge centrale de l'appli (lot 34a) : l'heure de l'appareil, plus le décalage que l'API annonce dans l'en-tête
// `x-orasso-clock-offset` quand l'horloge simulée est active (développement seulement). Sans l'en-tête, le décalage est
// nul et `now()` vaut exactement `new Date()` : rien ne change. Tout ce qui décide d'une règle du temps (ouverture des
// inscriptions, jour J, mode staff, validité d'un QR, comptes à rebours) passe par ici ; les durées techniques
// (anti-rebond d'un scan, attente avant une nouvelle tentative) restent sur `Date.now()`.
import { setDisplayClock } from "@orasso/shared";
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

// Lot R3b : l'année des dates affichées (`@orasso/shared`) se décide à l'heure d'Orasso, horloge simulée comprise.
setDisplayClock(now);

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

// --- Décalage avec l'heure du serveur (relecture du lot 48) ----------------------------------------------------
// Le code tournant OR2 n'admet qu'un créneau de 20 s d'écart : un téléphone réglé avec une minute d'avance verrait
// chaque code refusé. L'heure du serveur est mesurée par l'en-tête `Date` de chaque réponse de l'API (à la seconde),
// au milieu de l'aller-retour ; on garde la médiane des 7 dernières mesures, conservée sur l'appareil (clockStore.ts).
// `serverNow()` = heure de l'appareil + ce décalage (+ l'horloge simulée en développement) : c'est l'heure du code
// tournant (participant) et de sa vérification (staff).

const SAMPLES = 7;
/** Une mesure dont l'aller-retour dépasse 5 s n'est pas fiable. */
const MAX_ROUND_TRIP_MS = 5_000;
let skewMs = 0;
let skewAt: number | null = null;
const samples: number[] = [];

const median = (list: number[]) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/**
 * Lit l'en-tête `Date` d'une réponse de l'API. `sentAt` / `receivedAt` : heure de l'appareil (`Date.now()`) à l'envoi
 * et à la réception. Renvoie `true` si la mesure a été retenue.
 */
export function applyDateHeader(value: string | null | undefined, sentAt: number, receivedAt: number): boolean {
  if (!value || receivedAt - sentAt > MAX_ROUND_TRIP_MS || receivedAt < sentAt) return false;
  const server = Date.parse(value);
  if (!Number.isFinite(server)) return false;
  // L'en-tête est tronqué à la seconde : le milieu de la seconde, comparé au milieu de l'aller-retour.
  samples.push(server + 500 - (sentAt + receivedAt) / 2);
  if (samples.length > SAMPLES) samples.shift();
  const next = Math.round(median(samples));
  skewAt = receivedAt;
  skewMs = next;
  // Toujours prévenir : l'heure de la mesure est gardée sur l'appareil (bandeau « ouvre l'appli avec du réseau »).
  for (const listener of listeners) listener();
  return true;
}

/** Décalage mesuré avec le serveur (ms ; positif : le téléphone retarde). */
export const serverSkewMs = () => skewMs;
/** Heure (de l'appareil) de la dernière mesure ; `null` si aucune depuis l'installation. */
export const serverSkewAt = () => skewAt;

/** Heure du serveur estimée, en millisecondes. */
export const serverNowMs = () => nowMs() + skewMs;
/** Heure du serveur estimée : celle du code tournant et de sa vérification hors ligne. */
export const serverNow = () => new Date(serverNowMs());

/** Au lancement, reprend la dernière mesure gardée sur l'appareil (hors ligne), tant qu'aucune réponse n'en donne. */
export function restoreServerSkew(ms: number, at: number | null) {
  if (samples.length || !Number.isFinite(ms)) return;
  skewMs = Math.trunc(ms);
  skewAt = at;
  for (const listener of listeners) listener();
}

/** Remet l'état d'origine (tests). */
export function resetServerSkewForTests() {
  skewMs = 0;
  skewAt = null;
  samples.length = 0;
}
