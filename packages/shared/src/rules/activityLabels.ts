import { BUSINESS_TIMEZONE } from "../enums";
import type { ActivityActor, ActivityDay } from "../schemas/activity";
import { calendarDaysBetween, MINUTE, wallTime } from "./time";

// Les mots d'une ligne de l'Activité (lot R7c2) : purs, testés, partagés par l'appli et le site.

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/**
 * Quand : « à l'instant », « il y a 12 min », « il y a 2 h » aujourd'hui ; le jour (« lundi ») cette semaine ;
 * « 27 octobre » avant (l'année s'ajoute au-delà de l'année en cours).
 */
export function activityWhen(at: Date, now: Date, day: ActivityDay, timeZone = BUSINESS_TIMEZONE): string {
  if (day === "today") {
    const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / MINUTE));
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    return `il y a ${Math.floor(minutes / 60)} h`;
  }
  const w = wallTime(at, timeZone);
  if (day === "week") {
    const d = new Date(Date.UTC(w.year, w.month - 1, w.day));
    // « hier » plutôt que le nom du jour : un seul jour d'écart se lit mieux ainsi.
    return calendarDaysBetween(at, now, timeZone) === 1 ? "hier" : (WEEKDAYS[d.getUTCDay()] ?? "");
  }
  const year = wallTime(now, timeZone).year === w.year ? "" : ` ${w.year}`;
  return `${w.day === 1 ? "1er" : w.day} ${MONTHS[w.month - 1]}${year}`;
}

/** Les noms d'une ligne regroupée : « Kenji_66 », « Kenji_66 et Julie_66 », « Kenji_66 et 4 autres ». */
export function actorsLabel(actors: readonly ActivityActor[], count: number): string {
  const first = actors[0]?.pseudo;
  if (!first) return "";
  const total = Math.max(count, actors.length);
  if (total <= 1) return first;
  if (total === 2 && actors[1]) return `${first} et ${actors[1].pseudo}`;
  return `${first} et ${total - 1} autres`;
}

/**
 * Le titre d'une ligne regroupée : l'émetteur l'écrit avec le pseudo de la personne la plus récente et le verbe au
 * singulier (« Kenji_66 a aimé ta story ») ; l'écran met les noms de la ligne à la place du pseudo et accorde le verbe
 * (« Kenji_66 et 4 autres ont aimé ta story »). `names` est la partie en gras, `rest` la suite ; sans regroupement ni
 * titre qui commence par le pseudo, le titre reste tel quel (`names` vide).
 */
export function groupedTitle(
  title: string,
  actors: readonly ActivityActor[],
  count: number,
): { names: string; rest: string } {
  const first = actors[0]?.pseudo;
  if (!first || !title.startsWith(first)) return { names: "", rest: title };
  const total = Math.max(count, actors.length);
  const rest = title.slice(first.length);
  if (total <= 1) return { names: first, rest };
  // Le verbe suit le pseudo : « a aimé » → « ont aimé », « t'a identifié » → « t'ont identifié ».
  const plural = rest.replace(/^( t')a /, "$1ont ").replace(/^ a /, " ont ").replace(/^ est /, " sont ");
  return { names: actorsLabel(actors, count), rest: plural };
}
