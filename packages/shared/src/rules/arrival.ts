// Créneaux d'arrivée d'un événement (lot 47, ARCHITECTURE-DA-V2 § 5.3) : un pour les exposants (avec véhicule), un pour
// le public, chacun strict ou conseillé, avec une note. Heures murales « HH:MM » du jour de début de l'événement, dans
// son fuseau. Fonctions pures, partagées par l'API, le site et l'appli.
import { BUSINESS_TIMEZONE } from "../enums";
import { type arrivalProblems, arrivalTexts } from "../labels/arrival.fr";
import { addDays, fromWallTime, wallTime } from "./time";

/** Un créneau : début obligatoire, fin facultative (« dès 19 h 30 »), strict ou conseillé, note facultative. */
export type ArrivalSlot = { from: string; to: string | null; strict: boolean; note: string | null };
export type Arrivals = { exhibitors: ArrivalSlot | null; public: ArrivalSlot | null };
export type ArrivalProblem = keyof typeof arrivalProblems;

export const ARRIVAL_NOTE_MAX = 200;
export const noArrivals: Arrivals = { exhibitors: null, public: null };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** « 18:30 » → minutes depuis minuit (`null` si illisible). */
export function arrivalMinutes(value: string): number | null {
  const m = HHMM.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** « 18:30 » → « 18 h 30 », « 19:00 » → « 19 h ». */
export function arrivalTime(value: string): string {
  const m = HHMM.exec(value);
  if (!m) return value;
  const h = String(Number(m[1]));
  return m[2] === "00" ? `${h} h` : `${h} h ${m[2]}`;
}

/**
 * « Arrivée 18 h 30 – 19 h 15 (strict) » ou « Arrivée dès 19 h 30 ». Lot M4, tour 2 : plus d'horaire « conseillé »
 * nulle part (correction de Damien) : candidature, crew, invitation, consignes, aperçu de l'assistant.
 */
export function arrivalLabel(slot: ArrivalSlot): string {
  const when = slot.to ? `${arrivalTime(slot.from)} – ${arrivalTime(slot.to)}` : `dès ${arrivalTime(slot.from)}`;
  return slot.strict ? `Arrivée ${when} (${arrivalTexts.strictSuffix})` : `Arrivée ${when}`;
}

/** Un créneau dure au plus 12 h : une fin « avant » le début passe minuit (23:30 – 00:30), au-delà c'est une erreur. */
export const ARRIVAL_MAX_MINUTES = 12 * 60;
const DAY_MINUTES = 24 * 60;

/** Minutes de `from` à `to`, en passant minuit si besoin (`0` si égales). */
const span = (from: number, to: number) => (to - from + DAY_MINUTES) % DAY_MINUTES;

/**
 * Instant du créneau : l'heure murale le jour de début de l'événement, ou le lendemain quand elle tombe plus de 12 h
 * avant le début (nocturne de 23 h : arrivée à 00:30 = après minuit).
 */
export function arrivalInstant(value: string, startsAt: Date, timeZone = BUSINESS_TIMEZONE): Date | null {
  const minutes = arrivalMinutes(value);
  if (minutes === null) return null;
  const day = wallTime(startsAt, timeZone);
  const at = fromWallTime({ ...day, hour: Math.floor(minutes / 60), minute: minutes % 60 }, timeZone);
  if (startsAt.getTime() - at.getTime() <= ARRIVAL_MAX_MINUTES * 60_000) return at;
  const next = addDays({ ...day, hour: Math.floor(minutes / 60), minute: minutes % 60 }, 1);
  return fromWallTime(next, timeZone);
}

/**
 * Le premier problème des créneaux, ou `null`. Règles : la fin suit le début (un créneau peut passer minuit, 12 h au
 * plus) ; le créneau des exposants commence avant la fin de l'événement (avant ou pendant) ; le public n'arrive pas
 * avant le début de l'arrivée des exposants (dans les 12 h qui suivent) ; notes de 200 caractères au plus.
 */
export function validateArrivals(draft: {
  arrivals: Arrivals | null | undefined;
  startsAt: Date;
  endsAt: Date;
  timezone?: string;
}): ArrivalProblem | null {
  const a = draft.arrivals;
  if (!a) return null;
  const tz = draft.timezone ?? BUSINESS_TIMEZONE;
  const ex = a.exhibitors;
  const pub = a.public;
  for (const slot of [ex, pub]) {
    if (slot?.note && slot.note.length > ARRIVAL_NOTE_MAX) return "note_too_long";
  }
  const badSpan = (from: number | null, to: string | null) => {
    if (from === null) return true;
    if (!to) return false;
    const t = arrivalMinutes(to);
    if (t === null) return true;
    const d = span(from, t);
    return d === 0 || d > ARRIVAL_MAX_MINUTES;
  };
  const exFrom = ex ? arrivalMinutes(ex.from) : null;
  if (ex) {
    if (badSpan(exFrom, ex.to)) return "exhibitors_order";
    const at = arrivalInstant(ex.from, draft.startsAt, tz);
    if (!at || at >= draft.endsAt) return "exhibitors_after_event";
  }
  if (pub) {
    const from = arrivalMinutes(pub.from);
    if (badSpan(from, pub.to) || from === null) return "public_order";
    if (exFrom !== null && span(exFrom, from) > ARRIVAL_MAX_MINUTES) return "public_before_exhibitors";
  }
  return null;
}

/** La case « J'ai vu » est demandée au candidat quand l'événement a un créneau pour les exposants. */
export function needsArrivalSeen(event: { arrivals?: Arrivals | null }): boolean {
  return Boolean(event.arrivals?.exhibitors);
}
