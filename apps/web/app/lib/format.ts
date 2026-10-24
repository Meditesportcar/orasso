// Dates et nombres en français, toujours à l'heure de Paris (le rendu serveur et le navigateur donnent le même texte).
// Lot R3b (retour 10) : une date dit son année seulement hors de l'année en cours, à l'heure d'Orasso (horloge simulée
// comprise), comme dans l'appli ; règle commune `yearToShow` / `rangeYears` de `@orasso/shared`.
import { rangeYears, yearToShow } from "@orasso/shared";

import { now } from "./clock";

const TZ = "Europe/Paris";

const dayOpts = { timeZone: TZ, weekday: "short", day: "numeric", month: "short" } as const;
const dayFmt = new Intl.DateTimeFormat("fr-FR", dayOpts);
const dayYearFmt = new Intl.DateTimeFormat("fr-FR", { ...dayOpts, year: "numeric" });
const dayShortFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "short" });
const dayShortYearFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dateTimeYearFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const hhmm = (iso: string) =>
  timeFmt
    .format(new Date(iso))
    .replace(":", " h ")
    .replace(/ h 00$/, " h");

/** Le format sans année, ou avec l'année quand la date n'est pas dans l'année en cours. */
const pick = (iso: string, plain: Intl.DateTimeFormat, withYear: Intl.DateTimeFormat, at: Date = now()) =>
  (yearToShow(iso, at, TZ) === null ? plain : withYear).format(new Date(iso));

/** « sam. 17 oct. », « dim. 17 oct. 2027 » hors de l'année en cours. */
export const formatDay = (iso: string) => pick(iso, dayFmt, dayYearFmt);
/** « 17 oct. », « 17 oct. 2027 » hors de l'année en cours. */
export const formatDayShort = (iso: string) => pick(iso, dayShortFmt, dayShortYearFmt);
export const formatTime = hhmm;
/** « 17 oct., 19:00 », avec l'année hors de l'année en cours. */
export const formatDateTime = (iso: string) => pick(iso, dateTimeFmt, dateTimeYearFmt);

/**
 * Date et heure de Paris, avec l'année quand elle n'est pas l'année en cours (lot 36 : « les candidatures ouvrent le
 * 17 oct. à 15:12 » lu pour aujourd'hui alors qu'il s'agissait de l'an prochain, sur une copie d'événement). Depuis le
 * lot R3b, `formatDateTime` suit la même règle ; ce nom reste pour passer une heure explicite.
 */
export function formatDateTimeYear(iso: string, nowMs?: number): string {
  return pick(iso, dateTimeFmt, dateTimeYearFmt, nowMs === undefined ? now() : new Date(nowMs));
}

/**
 * « sam. 17 oct. · 19 h – 23 h » (« dim. 17 oct. 2027 · … » hors de l'année en cours) ; à cheval sur deux années, les
 * deux jours avec leur année : « jeu. 31 déc. 2026 → sam. 2 janv. 2027 · 19 h – 2 h ».
 */
export function formatWhen(startsAt: string, endsAt: string): string {
  const y = rangeYears(startsAt, endsAt, now(), TZ);
  const days =
    y.start !== null && y.end !== null && y.start !== y.end
      ? `${dayYearFmt.format(new Date(startsAt))} → ${dayYearFmt.format(new Date(endsAt))}`
      : formatDay(startsAt);
  return `${days} · ${hhmm(startsAt)} – ${hhmm(endsAt)}`;
}

/** Compte à rebours « 23 h 59 min » ; « expirée » une fois l'échéance passée. */
export function formatRemaining(untilIso: string, nowMs: number): string {
  const ms = new Date(untilIso).getTime() - nowMs;
  if (ms <= 0) return "expirée";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = Math.floor((ms % 60_000) / 1000);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${m} min ${String(s).padStart(2, "0")} s`;
}

/** « 12,00 € » : prix d'un billet (centimes). */
export const formatPrice = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
