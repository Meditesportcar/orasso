// Lot R3b (retour 10 du 24/10) : l'année d'une date affichée. « Test dim 2 » se tenait le 17/10/2027 mais la vignette
// disait « DIM. 17 OCT. » : Damien l'a lu comme un événement passé. Règle unique pour l'API, le site et l'appli : une
// date dit son année quand elle n'est pas dans l'année en cours (fuseau Europe/Paris), selon l'horloge d'Orasso
// (horloge simulée comprise) ; une période à cheval sur deux années (31 déc. → 2 janv.) dit les deux années.
import { BUSINESS_TIMEZONE } from "../enums";
import { wallTime } from "./time";

type When = string | Date;

let clock: () => Date = () => new Date();

/**
 * L'horloge des textes de date : chaque application pose la sienne au chargement (horloge simulée comprise), pour que
 * les mises en forme sans `now` explicite décident de l'année au bon instant.
 */
export function setDisplayClock(next: () => Date) {
  clock = next;
}

/** L'heure d'Orasso vue par les mises en forme de dates. */
export const displayNow = (): Date => clock();

const yearOf = (at: When, timeZone: string) => wallTime(typeof at === "string" ? new Date(at) : at, timeZone).year;

/** Année d'une date locale « AAAA-MM-JJ » (jour d'un événement, sans fuseau). */
const localYear = (dayDate: string) => Number(dayDate.slice(0, 4));

/** L'année à écrire après une date : `null` quand c'est l'année en cours. */
export function yearToShow(at: When, now: Date = displayNow(), timeZone = BUSINESS_TIMEZONE): number | null {
  const year = yearOf(at, timeZone);
  return year === yearOf(now, timeZone) ? null : year;
}

/** Même règle pour une date locale « AAAA-MM-JJ ». */
export function localDateYearToShow(dayDate: string, now: Date = displayNow(), timeZone = BUSINESS_TIMEZONE): number | null {
  const year = localYear(dayDate);
  return year === yearOf(now, timeZone) ? null : year;
}

/**
 * Les années à écrire d'une période (début, fin) : sur deux années, les deux ; sinon l'année commune, seulement quand ce
 * n'est pas l'année en cours (alors sur la fin quand les deux bornes sont écrites, sur le début quand il est seul).
 */
export function rangeYears(
  startsAt: When,
  endsAt: When,
  now: Date = displayNow(),
  timeZone = BUSINESS_TIMEZONE,
): { start: number | null; end: number | null } {
  const a = yearOf(startsAt, timeZone);
  const b = yearOf(endsAt, timeZone);
  if (a !== b) return { start: a, end: b };
  const shown = a === yearOf(now, timeZone) ? null : a;
  return { start: shown, end: shown };
}

/** « 17 oct. » → « 17 oct. 2027 » quand la date n'est pas dans l'année en cours. */
export function withYear(text: string, at: When, now: Date = displayNow(), timeZone = BUSINESS_TIMEZONE): string {
  const year = yearToShow(at, now, timeZone);
  return year === null ? text : `${text} ${year}`;
}
