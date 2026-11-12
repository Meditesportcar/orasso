// Activité (la cloche, lot R7c1) : ce qui me concerne, regroupé par clé et par jour. Les nouvelles des autres (une
// personne suivie va à un événement, publie une story…) vont au Fil, pas ici. Lecture seule sur `notifications`, plus la
// date de dernière ouverture de la cloche (`profiles.activity_seen_at`).
import {
  type ActivityItem,
  type ActivityPage,
  type ActivityRow,
  activityItemOf,
  feedOnlyNotificationTypes,
  groupActivity,
  requestNotificationTypes,
} from "@orasso/shared";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, events, notifications, profiles, tickets } from "../../db/schema";
import { now } from "../../lib/deps";
import { validation } from "../../lib/errors";
import { decodeCursor, encodeCursor } from "../../lib/pagination";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";
import { inboxService } from "../messaging/inbox";
import { citedPeopleRemain, citedViews } from "../notifications/grouped";
import { applyJournalVerdict, journalGuardedTypes, journalVerdicts, scrubCommentId } from "../notifications/service";

type NotificationRow = typeof notifications.$inferSelect;

/** Lignes brutes lues par page (regroupées ensuite : une page de 30 donne au plus 30 lignes). */
export const ACTIVITY_PAGE_SIZE = 30;
/** L'Activité remonte 30 jours en arrière (« Plus tôt » au-delà de 7 jours). */
export const ACTIVITY_WINDOW_DAYS = 30;
/** Types d'horaire modifié mis « à la une » (bandeau moutarde) tant qu'ils ne sont pas lus. */
const HIGHLIGHT_TYPES = ["event_updated", "schedule_change"];
const HIGHLIGHT_MAX = 3;
const HIGHLIGHT_DAYS = 7;
const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Clés de `data` qui ne sortent jamais vers un client (identifiants et listes de personnes). */
const HIDDEN_DATA_KEYS = new Set(["actor", "actorIds", "actors", "pseudos", "count", "notes"]);

const sanitize = (data: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith("_") && !HIDDEN_DATA_KEYS.has(k)));

const windowStart = () => new Date(now().getTime() - ACTIVITY_WINDOW_DAYS * DAY);

// Ni les nouvelles du Fil, ni les annonces de demandes (la ligne « Demandes » de l'écran les porte : lot R7c2).
const feedFilter = notInArray(notifications.type, [...feedOnlyNotificationTypes, ...requestNotificationTypes]);

/**
 * Notifications en lignes d'activité : les personnes citées sont relues (pseudo et avatar d'aujourd'hui) et seules les
 * personnes au compte en règle comptent ; une ligne dont toutes les personnes ont disparu n'est pas montrée. Le titre et
 * le corps d'une ligne regroupée sont recomposés avec les personnes restantes.
 */
async function toRows(rows: NotificationRow[], ex: Executor = db): Promise<ActivityRow[]> {
  const views = await citedViews(rows, ex);
  // Gardes de lecture (commentaires du Fil…) : mêmes verdicts que le Journal, en lot.
  const verdicts = rows[0] ? await journalVerdicts(rows[0].userId, rows) : new Map();
  return rows.flatMap((n): ActivityRow[] => {
    const view = views.get(n.id);
    // Personnes citées mais plus aucune en règle, ou commentaire que le destinataire ne peut plus lire : rien à montrer.
    const shown = applyJournalVerdict(n, view, verdicts.get(n.id));
    if (!shown) return [];
    const storedCount = (n.data as { count?: unknown }).count;
    return [
      {
        id: n.id,
        type: n.type,
        groupKey: n.groupKey,
        at: n.deliveredAt ?? n.createdAt,
        readAt: n.readAt,
        title: shown.title,
        body: shown.body,
        count: view ? (shown.count ?? view.count) : typeof storedCount === "number" ? storedCount : 1,
        actors: shown.actors ?? [],
        people: shown.people,
        data: scrubCommentId(sanitize(n.data), shown.commentId),
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
    // Tour 2 : un curseur illisible ou dont l'identifiant n'est pas un uuid est une erreur de requête, pas une erreur du serveur.
    if (cursor && (!c || !UUID.test(c.id))) throw validation("Curseur invalide.");
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
          citedPeopleRemain(now()),
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
          // Mêmes critères de visibilité que la liste : ni pastille pour une ligne qui ne s'affiche pas.
          citedPeopleRemain(now()),
        ),
      );
    // Lignes que leur destinataire ne peut plus lire (gardes de lecture) : pas comptées, en une passe en lot, avec les mêmes
    // critères que le total (une ligne déjà exclue n'est pas retirée deux fois).
    const types = journalGuardedTypes();
    const guarded = types.length
      ? await ex
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.inJournal, true),
              isNotNull(notifications.deliveredAt),
              isNull(notifications.readAt),
              feedFilter,
              gt(notifications.deliveredAt, since),
              citedPeopleRemain(now()),
              inArray(notifications.type, types),
            ),
          )
      : [];
    const hidden = guarded.length
      ? [...(await journalVerdicts(userId, guarded)).values()].filter((v) => !v.shown).length
      : 0;
    return Math.max(0, (row?.n ?? 0) - hidden);
  },

  /** `POST /me/activity/seen` : la cloche vient d'être ouverte. */
  async markSeen(userId: string): Promise<void> {
    await db.update(profiles).set({ activitySeenAt: now() }).where(eq(profiles.userId, userId));
    // Les autres appareils rechargent leurs pastilles.
    inboxService.publish(userId);
  },
};
