// Événements sur plusieurs jours (lot 26, docs/01 « prévoir toutes les possibilités d'accès (tout l'événement, par
// jour…) », ARCHITECTURE-SUITE § 10, S27 à S29). Fonctions pures, appelées par l'API (capacité, liste d'attente,
// rappels, synchro) et par les clients (affichage, choix du jour, scan).
//
// Un événement sans jour déclaré (ou avec un seul) est un événement d'un jour : il se comporte exactement comme avant
// le lot 26 (capacité de l'événement, aucune candidature n'a de jour). Plusieurs jours = au moins deux lignes
// `event_days` ; `events.starts_at` / `ends_at` sont alors les bornes (début du premier jour, fin du dernier).
import { BUSINESS_TIMEZONE, type DayAccess } from "../enums";
import { addDays, fromWallTime, wallTime } from "./time";

/** Au plus deux semaines de jours déclarés : au-delà, ce n'est plus un événement mais une série (récurrence). */
export const MAX_EVENT_DAYS = 14;

/** Un jour tel que l'API le garde (`event_days`) : date locale `AAAA-MM-JJ`, horaires, capacité facultative. */
export type EventDayLike = {
  id: string;
  dayDate: string;
  startsAt: Date;
  endsAt: Date;
  /** `null` = la capacité de l'événement. */
  capacity: number | null;
};

/** Plusieurs jours : au moins deux jours déclarés. */
export function isMultiDay(days: readonly unknown[]): boolean {
  return days.length >= 2;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Date locale `AAAA-MM-JJ` d'un instant dans le fuseau de l'événement (par défaut Paris). */
export function localDate(instant: Date, timeZone = BUSINESS_TIMEZONE): string {
  const w = wallTime(instant, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Le jour de l'événement qui tombe à cette date locale (le jour J du staff, le direct) ; `null` hors des jours. */
export function dayFor<T extends Pick<EventDayLike, "dayDate">>(
  days: readonly T[],
  instant: Date,
  timeZone = BUSINESS_TIMEZONE,
): T | null {
  const date = localDate(instant, timeZone);
  return days.find((d) => d.dayDate === date) ?? null;
}

/** Capacité d'un jour : la sienne si l'organisateur l'a fixée, sinon celle de l'événement (`null` = sans limite). */
export function capacityFor(
  event: { capacity: number | null },
  day: { capacity: number | null } | null,
): number | null {
  return day?.capacity ?? event.capacity;
}

/** Une candidature occupe une place ce jour-là : la sienne, ou tout l'événement (`eventDayId` nul) qui compte partout. */
export function countsOnDay(app: { eventDayId: string | null }, dayId: string): boolean {
  return app.eventDayId === null || app.eventDayId === dayId;
}

/** Places prises (retenues + offres en cours), regroupées par jour de candidature (`null` = tout l'événement). */
export type DayTaken = { eventDayId: string | null; n: number };

/**
 * Places libres pour une candidature visant `target` (un jour, ou `null` = tout l'événement) ; `null` = sans limite.
 * Événement d'un jour : `capacité − prises`, comme avant le lot 26. Plusieurs jours : pour un jour, sa capacité moins
 * les candidatures de ce jour et celles de tout l'événement ; pour tout l'événement, le minimum sur tous les jours (une
 * place doit être libre chaque jour).
 */
export function freePlaces(
  event: { capacity: number | null },
  days: readonly Pick<EventDayLike, "id" | "capacity">[],
  taken: readonly DayTaken[],
  target: string | null,
): number | null {
  if (!isMultiDay(days)) {
    if (event.capacity === null) return null;
    return event.capacity - taken.reduce((s, t) => s + t.n, 0);
  }
  const freeOn = (day: Pick<EventDayLike, "id" | "capacity">) => {
    const cap = capacityFor(event, day);
    if (cap === null) return Number.POSITIVE_INFINITY;
    const used = taken.reduce((s, t) => (countsOnDay(t, day.id) ? s + t.n : s), 0);
    return cap - used;
  };
  const scope = target === null ? days : days.filter((d) => d.id === target);
  if (scope.length === 0) return 0;
  const free = Math.min(...scope.map(freeOn));
  return Number.isFinite(free) ? free : null;
}

/** Erreur de choix de jour à la candidature (`null` = choix valable). */
export type DayChoiceError = "day_required" | "day_not_allowed" | "unknown_day";

/**
 * Choix du jour à la candidature selon le mode d'accès (§ 10) : `whole` → pas de jour ; `per_day` → un jour
 * obligatoire ; `both` → au choix. Un événement d'un jour n'accepte jamais de jour.
 */
export function checkDayChoice(
  dayAccess: DayAccess,
  days: readonly Pick<EventDayLike, "id">[],
  eventDayId: string | null | undefined,
): DayChoiceError | null {
  const dayId = eventDayId ?? null;
  if (!isMultiDay(days)) return dayId === null ? null : "day_not_allowed";
  if (dayId !== null && !days.some((d) => d.id === dayId)) return "unknown_day";
  if (dayAccess === "whole" && dayId !== null) return "day_not_allowed";
  if (dayAccess === "per_day" && dayId === null) return "day_required";
  return null;
}

/**
 * Début de la journée qui concerne une candidature (rappel de la veille, carte Accès) : son jour s'il est choisi, sinon
 * le début de l'événement (premier jour).
 */
export function eveOf(
  event: { startsAt: Date },
  days: readonly Pick<EventDayLike, "id" | "startsAt">[],
  app: { eventDayId: string | null },
): Date {
  if (app.eventDayId === null) return event.startsAt;
  return days.find((d) => d.id === app.eventDayId)?.startsAt ?? event.startsAt;
}

/** Saisie d'un jour dans l'assistant : date locale, heures murales `HH:MM`, capacité facultative. */
export type EventDayInput = { date: string; startTime: string; endTime: string; capacity: number | null };

/** Un jour calculé : instants réels dans le fuseau de l'événement (fin le lendemain si elle précède le début). */
export type EventDayResolved = { dayDate: string; startsAt: Date; endsAt: Date; capacity: number | null };

export type DaysError = "too_few" | "too_many" | "duplicate_date" | "overlap";

/**
 * Jours saisis → instants et bornes. Une fin avant ou égale au début passe au lendemain (nocturne après minuit). Les
 * jours sont triés ; deux jours ne se chevauchent pas. Moins de deux jours : ce n'est pas un événement sur plusieurs
 * jours (le client envoie une liste vide pour revenir à un seul jour).
 */
export function resolveDays(
  input: readonly EventDayInput[],
  timeZone = BUSINESS_TIMEZONE,
): { ok: true; days: EventDayResolved[]; startsAt: Date; endsAt: Date } | { ok: false; error: DaysError } {
  if (input.length < 2) return { ok: false, error: "too_few" };
  if (input.length > MAX_EVENT_DAYS) return { ok: false, error: "too_many" };
  if (new Set(input.map((d) => d.date)).size !== input.length) return { ok: false, error: "duplicate_date" };
  const days = [...input]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const [year, month, day] = d.date.split("-").map(Number) as [number, number, number];
      const [sh, sm] = d.startTime.split(":").map(Number) as [number, number];
      const [eh, em] = d.endTime.split(":").map(Number) as [number, number];
      const base = { year, month, day, hour: 0, minute: 0 };
      const startsAt = fromWallTime({ ...base, hour: sh, minute: sm }, timeZone);
      const nextDay = eh * 60 + em <= sh * 60 + sm;
      const endsAt = fromWallTime({ ...(nextDay ? addDays(base, 1) : base), hour: eh, minute: em }, timeZone);
      return { dayDate: d.date, startsAt, endsAt, capacity: d.capacity };
    });
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1] as EventDayResolved;
    const cur = days[i] as EventDayResolved;
    if (cur.startsAt < prev.endsAt) return { ok: false, error: "overlap" };
  }
  const first = days[0] as EventDayResolved;
  const last = days[days.length - 1] as EventDayResolved;
  return { ok: true, days, startsAt: first.startsAt, endsAt: last.endsAt };
}

/** « samedi 14 mars » : une date locale `AAAA-MM-JJ` en toutes lettres (sans fuseau : c'est déjà une date locale). */
export function formatDayDate(dayDate: string, opts: { weekday?: boolean } = {}): string {
  const [y, m, d] = dayDate.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    ...(opts.weekday === false ? {} : { weekday: "long" }),
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
