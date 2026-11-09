// Activité (la cloche, lot R7c1) : ce qui me concerne, regroupé par clé et par jour. Les nouvelles des autres (une
// personne suivie va à un événement, publie une story…) vont au Fil, pas ici. Lecture seule sur `notifications`, plus la
// date de dernière ouverture de la cloche (`profiles.activity_seen_at`).
import {
  type ActivityActor,
  type ActivityItem,
  type ActivityPage,
  type ActivityRow,
  activityItemOf,
  feedOnlyNotificationTypes,
  groupActivity,
} from "@orasso/shared";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, events, notifications, profiles, tickets } from "../../db/schema";
import { now } from "../../lib/deps";
import { decodeCursor, encodeCursor } from "../../lib/pagination";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import { inboxService } from "../messaging/inbox";

type NotificationRow = typeof notifications.$inferSelect;

/** Lignes brutes lues par page (regroupées ensuite : une page de 30 donne au plus 30 lignes). */
export const ACTIVITY_PAGE_SIZE = 30;
/** L'Activité remonte 30 jours en arrière (« Plus tôt » au-delà de 7 jours). */
export const ACTIVITY_WINDOW_DAYS = 30;
/** Personnes vérifiées (compte en règle) par ligne : au-delà, le total est celui qui est enregistré. */
const ACTORS_CHECKED = 100;
/** Types d'horaire modifié mis « à la une » (bandeau moutarde) tant qu'ils ne sont pas lus. */
const HIGHLIGHT_TYPES = ["event_updated", "schedule_change"];
const HIGHLIGHT_MAX = 3;
const HIGHLIGHT_DAYS = 7;
const DAY = 86_400_000;

/** Clés de `data` qui ne sortent jamais vers un client (identifiants et listes de personnes). */
const HIDDEN_DATA_KEYS = new Set(["actor", "actorIds", "actors", "pseudos", "count", "notes"]);

const sanitize = (data: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith("_") && !HIDDEN_DATA_KEYS.has(k)));

type Shape = { _actorIds?: unknown; actorIds?: unknown; actor?: { userId?: unknown }; count?: unknown };

/** Identifiants des personnes citées par une notification, la plus récente d'abord. */
function actorIdsOf(data: Record<string, unknown>): string[] {
  const d = data as Shape;
  const ids = Array.isArray(d._actorIds) ? d._actorIds : Array.isArray(d.actorIds) ? d.actorIds : null;
  if (ids) return ids.filter((x): x is string => typeof x === "string");
  const one = d.actor?.userId;
  return typeof one === "string" ? [one] : [];
}

const visibleProfile = (at: Date) =>
  sql`${profiles.deletedAt} is null and ${profiles.bannedAt} is null and (${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${at})`;

const windowStart = () => new Date(now().getTime() - ACTIVITY_WINDOW_DAYS * DAY);

const feedFilter = notInArray(notifications.type, [...feedOnlyNotificationTypes]);

/**
 * Notifications en lignes d'activité : les personnes citées sont relues (pseudo et avatar d'aujourd'hui) et seules les
 * personnes au compte en règle comptent ; une ligne dont toutes les personnes ont disparu n'est pas montrée.
 */
async function toRows(rows: NotificationRow[], ex: Executor = db): Promise<ActivityRow[]> {
  const at = now();
  const wanted = rows.map((n) => actorIdsOf(n.data).slice(0, ACTORS_CHECKED));
  const all = [...new Set(wanted.flat())];
  const people = all.length
    ? await ex
        .select({ userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
        .from(profiles)
        .where(and(inArray(profiles.userId, all), visibleProfile(at)))
    : [];
  const byId = new Map(people.map((p) => [p.userId, p]));
  return rows.flatMap((n, i): ActivityRow[] => {
    const ids = actorIdsOf(n.data);
    const checked = wanted[i] ?? [];
    const visible = checked.flatMap((id) => {
      const p = byId.get(id);
      return p ? [p] : [];
    });
    // Personnes citées mais plus aucune en règle : rien à montrer.
    if (ids.length > 0 && visible.length === 0 && ids.length <= ACTORS_CHECKED) return [];
    const storedCount = typeof (n.data as Shape).count === "number" ? ((n.data as Shape).count as number) : null;
    const actors: ActivityActor[] = visible
      .slice(0, 3)
      .map((p) => ({ pseudo: p.pseudo, avatarUrl: storage.url(p.avatarKey) }));
    return [
      {
        id: n.id,
        type: n.type,
        groupKey: n.groupKey,
        at: n.deliveredAt ?? n.createdAt,
        readAt: n.readAt,
        title: n.title,
        body: n.body,
        count: ids.length
          ? Math.max(1, visible.length + Math.max(0, (storedCount ?? ids.length) - checked.length))
          : (storedCount ?? 1),
        actors,
        data: sanitize(n.data),
        eventId: n.eventId,
      },
    ];
  });
}

export const activityService = {
  /** `GET /me/activity?cursor=` : groupes aujourd'hui / cette semaine / plus tôt, et « à la une » sur la première page. */
  async list(v: Viewer, cursor?: string): Promise<ActivityPage> {
    const me = v.user.id;
    const c = decodeCursor(cursor);
    const delivered = notifications.deliveredAt;
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, me),
          eq(notifications.inJournal, true),
          isNotNull(delivered),
          feedFilter,
          gt(delivered, windowStart()),
          c ? or(lt(delivered, c.createdAt), and(eq(delivered, c.createdAt), lt(notifications.id, c.id))) : undefined,
        ),
      )
      .orderBy(desc(delivered), desc(notifications.id))
      .limit(ACTIVITY_PAGE_SIZE + 1);
    const page = rows.slice(0, ACTIVITY_PAGE_SIZE);
    const last = page.at(-1);
    const lines = await toRows(page);
    return {
      groups: groupActivity(lines, now()),
      highlighted: cursor ? [] : await this.highlighted(me),
      nextCursor:
        rows.length > ACTIVITY_PAGE_SIZE && last?.deliveredAt ? encodeCursor(last.deliveredAt, last.id) : null,
    };
  },

  /**
   * Horaires modifiés d'événements à venir où j'ai une place (candidature retenue ou billet valable) : le plus récent par
   * événement, non lus, des 7 derniers jours. Ils restent aussi dans les groupes.
   */
  async highlighted(userId: string): Promise<ActivityItem[]> {
    const at = now();
    const rows = await db
      .select({ n: notifications })
      .from(notifications)
      .innerJoin(events, eq(events.id, notifications.eventId))
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.inJournal, true),
          isNotNull(notifications.deliveredAt),
          isNull(notifications.readAt),
          inArray(notifications.type, HIGHLIGHT_TYPES),
          gt(notifications.deliveredAt, new Date(at.getTime() - HIGHLIGHT_DAYS * DAY)),
          eq(events.status, "published"),
          gt(events.endsAt, at),
          or(
            sql`exists (select 1 from ${applications} a where a.event_id = ${events.id} and a.user_id = ${userId} and a.status = 'accepted')`,
            sql`exists (select 1 from ${tickets} t where t.event_id = ${events.id} and t.user_id = ${userId} and t.status in ('valid', 'used'))`,
          ),
        ),
      )
      .orderBy(desc(notifications.deliveredAt), desc(notifications.id));
    const seen = new Set<string>();
    const latest: NotificationRow[] = [];
    for (const { n } of rows) {
      if (!n.eventId || seen.has(n.eventId)) continue;
      seen.add(n.eventId);
      latest.push(n);
      if (latest.length === HIGHLIGHT_MAX) break;
    }
    return (await toRows(latest)).map(activityItemOf);
  },

  /**
   * Pastille de la cloche : notifications livrées et non lues depuis la dernière ouverture (`activity_seen_at`), dans la
   * fenêtre de 30 jours. Les nouvelles du Fil n'y comptent pas.
   */
  async unseenCount(userId: string, ex: Executor = db): Promise<number> {
    const [p] = await ex.select({ seenAt: profiles.activitySeenAt }).from(profiles).where(eq(profiles.userId, userId));
    const since = p?.seenAt && p.seenAt > windowStart() ? p.seenAt : windowStart();
    const [row] = await ex
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.inJournal, true),
          isNotNull(notifications.deliveredAt),
          isNull(notifications.readAt),
          feedFilter,
          gt(notifications.deliveredAt, since),
        ),
      );
    return row?.n ?? 0;
  },

  /** `POST /me/activity/seen` : la cloche vient d'être ouverte. */
  async markSeen(userId: string): Promise<void> {
    await db.update(profiles).set({ activitySeenAt: now() }).where(eq(profiles.userId, userId));
    // Les autres appareils rechargent leurs pastilles.
    inboxService.publish(userId);
  },
};
