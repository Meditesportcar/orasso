import { BUSINESS_TIMEZONE } from "../enums";
import type { ActivityActor, ActivityDay, ActivityGroup, ActivityItem } from "../schemas/activity";
import { calendarDaysBetween } from "./time";

// Regroupement de l'Activité (lot R7c1) : pur, testé. Une ligne par `groupKey` et par jour (Paris) ; sans `groupKey`, une
// ligne par notification.

/** Types qui vont au Fil et à « Du nouveau chez tes potes », pas à la cloche (nouvelles des autres, pas ce qui me concerne). */
export const feedOnlyNotificationTypes: readonly string[] = [
  "friend_going_event",
  "friend_new_vehicle",
  "story_published",
];

/** Personnes montrées dans une ligne regroupée. */
export const ACTIVITY_MAX_ACTORS = 3;

/** Une notification prête à être regroupée (`count` : personnes déjà rassemblées dans la ligne, 1 par défaut). */
export type ActivityRow = {
  id: string;
  type: string;
  groupKey: string | null;
  /** Instant de la dernière occurrence. */
  at: Date;
  readAt: Date | null;
  title: string;
  body: string;
  count: number;
  actors: ActivityActor[];
  data: Record<string, unknown>;
  eventId: string | null;
};

/** Aujourd'hui (même jour calendaire à Paris), cette semaine (1 à 6 jours avant), plus tôt. */
export function activityDay(at: Date, now: Date, timeZone = BUSINESS_TIMEZONE): ActivityDay {
  const days = calendarDaysBetween(at, now, timeZone);
  if (days <= 0) return "today";
  return days < 7 ? "week" : "earlier";
}

const dayKey = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat("fr-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

function merge(rows: readonly ActivityRow[]): ActivityItem {
  const sorted = [...rows].sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1));
  const [latest] = sorted;
  if (!latest) throw new Error("Ligne d'activité vide");
  const seen = new Set<string>();
  const actors: ActivityActor[] = [];
  for (const row of sorted) {
    for (const actor of row.actors) {
      if (seen.has(actor.pseudo)) continue;
      seen.add(actor.pseudo);
      actors.push(actor);
    }
  }
  return {
    id: latest.id,
    ids: sorted.map((r) => r.id),
    type: latest.type,
    groupKey: latest.groupKey,
    count: sorted.reduce((sum, r) => sum + Math.max(1, r.count), 0),
    actors: actors.slice(0, ACTIVITY_MAX_ACTORS),
    title: latest.title,
    body: latest.body,
    latestAt: latest.at.toISOString(),
    // Non lue dès que l'une des notifications rassemblées l'est.
    read: sorted.every((r) => r.readAt !== null),
    data: latest.data,
    eventId: latest.eventId,
  };
}

/** Une ligne de l'Activité d'après une seule notification (bandeau « à la une », cas sans regroupement). */
export const activityItemOf = (row: ActivityRow): ActivityItem => merge([row]);

/**
 * Regroupe les notifications par `groupKey` et par jour, puis par période (aujourd'hui, cette semaine, plus tôt). Les
 * lignes les plus récentes d'abord ; une période vide est omise.
 */
export function groupActivity(rows: readonly ActivityRow[], now: Date, timeZone = BUSINESS_TIMEZONE): ActivityGroup[] {
  const buckets = new Map<string, ActivityRow[]>();
  for (const row of rows) {
    const key = row.groupKey ? `${row.groupKey}|${dayKey(row.at, timeZone)}` : `#${row.id}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  const items = [...buckets.values()]
    .map(merge)
    .sort((a, b) => (a.latestAt < b.latestAt ? 1 : a.latestAt > b.latestAt ? -1 : 0));
  const byDay = new Map<ActivityDay, ActivityItem[]>();
  for (const item of items) {
    const day = activityDay(new Date(item.latestAt), now, timeZone);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  return (["today", "week", "earlier"] as const).flatMap((day) => {
    const list = byDay.get(day);
    return list ? [{ day, items: list }] : [];
  });
}
