// Ce que chaque temps de l'assistant du site reçoit (lot 53) : le brouillon et ses deux façons d'être modifié.
import { type EventDraft, withYear } from "@orasso/shared";

// L'horloge d'Orasso décide de l'année affichée (`withYear`) : le module de l'horloge la pose au chargement.
import "../../lib/clock";

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

/** « Dim. 1 nov. » (« Dim. 1 nov. 2027 » hors de l'année en cours, lot R3b). */
export const formatShortDay = (iso: string | Date) => cap(withYear(shortDay.format(new Date(iso)), iso));
/** « Dim. 6 juin 2027 » */
export const formatLongDay = (iso: string | Date) => cap(longDay.format(new Date(iso)));
/** « Mer. 21 oct. · 18:00 » (« Jeu. 21 oct. 2027 · 18:00 » hors de l'année en cours). */
export const formatDayTime = (iso: string | Date) => {
  const [day = "", time = ""] = dayTime.format(new Date(iso)).split(" à ");
  return cap(`${withYear(day, iso)} · ${time}`);
};
