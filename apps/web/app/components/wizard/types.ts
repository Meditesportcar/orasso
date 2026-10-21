// Ce que chaque temps de l'assistant du site reçoit (lot 53) : le brouillon et ses deux façons d'être modifié.
import type { EventDraft } from "@orasso/shared";

export type StepProps = {
  d: EventDraft;
  set: <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => void;
  setD: (update: (prev: EventDraft) => EventDraft) => void;
};

export const toggle = <T extends string>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

const shortDay = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});
const longDay = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Paris",
});
const dayTime = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « Dim. 1 nov. » */
export const formatShortDay = (iso: string | Date) => cap(shortDay.format(new Date(iso)));
/** « Dim. 6 juin 2027 » */
export const formatLongDay = (iso: string | Date) => cap(longDay.format(new Date(iso)));
/** « Mer. 21 oct. · 18:00 » */
export const formatDayTime = (iso: string | Date) => cap(dayTime.format(new Date(iso)).replace(" à ", " · "));
