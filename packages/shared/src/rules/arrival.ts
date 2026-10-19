// Créneaux d'arrivée d'un événement (lot 47, ARCHITECTURE-DA-V2 § 5.3) : un pour les exposants (avec véhicule), un pour
// le public, chacun strict ou conseillé, avec une note. Heures murales « HH:MM » du jour de début de l'événement, dans
// son fuseau. Fonctions pures, partagées par l'API, le site et l'appli.
import { BUSINESS_TIMEZONE } from "../enums";
import { type arrivalProblems, arrivalTexts } from "../labels/arrival.fr";
import { fromWallTime, wallTime } from "./time";

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

/** « Arrivée 18 h 30 – 19 h 15 (strict) » ou « Arrivée dès 19 h 30 (conseillé) ». */
export function arrivalLabel(slot: ArrivalSlot): string {
  const suffix = slot.strict ? arrivalTexts.strictSuffix : arrivalTexts.advisedSuffix;
  const when = slot.to ? `${arrivalTime(slot.from)} – ${arrivalTime(slot.to)}` : `dès ${arrivalTime(slot.from)}`;
  return `Arrivée ${when} (${suffix})`;
}

/** Instant du créneau : l'heure murale le jour de début de l'événement. */
export function arrivalInstant(value: string, startsAt: Date, timeZone = BUSINESS_TIMEZONE): Date | null {
  const minutes = arrivalMinutes(value);
  if (minutes === null) return null;
  const day = wallTime(startsAt, timeZone);
  return fromWallTime({ ...day, hour: Math.floor(minutes / 60), minute: minutes % 60 }, timeZone);
}

/**
 * Le premier problème des créneaux, ou `null`. Règles : `from < to` pour chaque créneau ; le créneau des exposants
 * commence avant la fin de l'événement (avant ou pendant) ; le public n'arrive pas avant le début de l'arrivée des
 * exposants ; notes de 200 caractères au plus.
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
  const exFrom = ex ? arrivalMinutes(ex.from) : null;
  if (ex) {
    const to = ex.to ? arrivalMinutes(ex.to) : null;
    if (exFrom === null || (ex.to && (to === null || to <= exFrom))) return "exhibitors_order";
    const at = arrivalInstant(ex.from, draft.startsAt, tz);
    if (!at || at >= draft.endsAt) return "exhibitors_after_event";
  }
  if (pub) {
    const from = arrivalMinutes(pub.from);
    const to = pub.to ? arrivalMinutes(pub.to) : null;
    if (from === null || (pub.to && (to === null || to <= from))) return "public_order";
    if (exFrom !== null && from < exFrom) return "public_before_exhibitors";
  }
  return null;
}

/** La case « J'ai vu » est demandée au candidat quand l'événement a un créneau pour les exposants. */
export function needsArrivalSeen(event: { arrivals?: Arrivals | null }): boolean {
  return Boolean(event.arrivals?.exhibitors);
}
