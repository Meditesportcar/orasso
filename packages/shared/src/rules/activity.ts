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

/**
 * Lot R7c2 : les notifications qui annoncent une demande en attente (une ligne de `GET /me/requests`). La ligne « Demandes »
 * les montre déjà, avec leurs boutons : elles ne sont ni dans la liste de l'Activité ni dans sa pastille « non vus » (sinon
 * une demande compterait deux fois à la cloche, une fois ici, une fois comme demande en attente). `contact_request` y est
 * aussi : les demandes de message se traitent dans Messages (la bulle), pas dans la cloche.
 */
export const requestNotificationTypes: readonly string[] = [
  "follow_request",
  "contact_request",
  "crew_request",
  "crew_invitation",
  "crew_registration_to_confirm",
  "staff_invitation",
  "event_invitation_received",
  "event_invited",
  "plate_transfer_request",
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
  /**
   * Tour 2 : les pseudos de toutes les personnes en règle de la ligne (pas seulement les trois montrées). Sert à ne compter
   * qu'une fois une personne qui figure dans deux lignes du même groupe ; absent : `count` est pris tel quel.
   */
  people?: string[];
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

/** Personnes distinctes des lignes rassemblées ; ce que `count` compte au-delà des personnes connues s'ajoute tel quel. */
function countOf(rows: readonly ActivityRow[]): number {
  const people = new Set<string>();
  let extra = 0;
  for (const r of rows) {
    if (r.people) {
      for (const p of r.people) people.add(p);
      extra += Math.max(0, r.count - r.people.length);
    } else extra += Math.max(1, r.count);
  }
  return people.size + extra;
}

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
    count: countOf(sorted),
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
