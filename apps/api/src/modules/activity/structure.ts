// Activité de la structure (lot R9d) : la cloche de la casquette organisateur. Mes lignes (`user_id = moi`) marquées de la
// structure, dans la forme de `GET /me/activity` ; les demandes (staff, collaboration) ; le « vu » par membre. Jamais la ligne
// d'un autre responsable : la liste blanche est `user_id = moi and structure_id = :id`.
import {
  type ActivityPage,
  authorKeyOf,
  type CoAuthorRequestPayload,
  captionPreview,
  groupActivity,
  type RequestItem,
  type RequestsPage,
  type StructureActivityCount,
  type StructureActivityFilter,
  structureActivityTypes,
  structureNotificationTexts,
  structureRequestTypes,
} from "@orasso/shared";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { notifications, profiles, structureMembers } from "../../db/schema";
import { now } from "../../lib/deps";
import { validation } from "../../lib/errors";
import { decodeCursor, encodeCursor } from "../../lib/pagination";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import { requireStructureReader } from "../communication/guards";
import { pendingCoauthorRequests } from "../feed/coauthors";
import { inboxService } from "../messaging/inbox";
import { citedPeopleRemain } from "../notifications/grouped";
import { journalGuardedTypes, journalVerdicts } from "../notifications/service";
import { ACTIVITY_PAGE_SIZE, toRows, windowStart } from "./service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mes lignes de cette structure, livrées, dans la fenêtre de 30 jours (la base de la liste et du compte). */
const mine = (userId: string, structureId: string) =>
  and(
    eq(notifications.userId, userId),
    eq(notifications.structureId, structureId),
    eq(notifications.inJournal, true),
    isNotNull(notifications.deliveredAt),
    gt(notifications.deliveredAt, windowStart()),
    citedPeopleRemain(now()),
  );

/** Staff en attente de réponse : les `requested` de la structure (le compteur historique de la Boîte). */
async function requestedStaff(structureId: string, ex: Executor = db) {
  return ex
    .select({
      userId: structureMembers.userId,
      at: structureMembers.updatedAt,
      pseudo: profiles.pseudo,
      avatarKey: profiles.avatarKey,
    })
    .from(structureMembers)
    .innerJoin(profiles, eq(profiles.userId, structureMembers.userId))
    .where(
      and(
        eq(structureMembers.structureId, structureId),
        eq(structureMembers.status, "requested"),
        isNull(profiles.deletedAt),
        isNull(profiles.bannedAt),
      ),
    )
    .orderBy(desc(structureMembers.updatedAt));
}

/** Le nombre de demandes de staff en attente (même filtre que la liste « Demandes »). */
export async function requestedStaffCount(structureId: string): Promise<number> {
  return (await requestedStaff(structureId)).length;
}

/** Les invitations à publier adressées à cette structure (pas à moi ni aux autres pages que je gère). */
async function structureCoauthorPostIds(userId: string, structureId: string, ex: Executor = db) {
  const key = authorKeyOf("structure", structureId);
  return (await pendingCoauthorRequests(userId, ex, now(), "all")).filter((p) => p.forKey === key);
}

type TriageData = { kind?: unknown; eventName?: unknown; eventId?: unknown; applicationId?: unknown };

/**
 * Ce qui reste à trier, en une seule requête : le nombre de candidatures de véhicule `pending` par événement. Une ligne de
 * média ou de prestataire (une demande, un nom) garde son texte une fois traitée ; elle ne compte plus dans la pastille
 * (`stillToSort`), c'est le choix le plus simple (journal, tour 2).
 */
async function pendingLeft(items: readonly { data: Record<string, unknown> }[], ex: Executor = db) {
  const events = new Set<string>();
  for (const i of items) {
    const d = i.data as TriageData;
    if (d.kind === "vehicle" && typeof d.eventId === "string" && UUID.test(d.eventId)) events.add(d.eventId);
  }
  const left = new Map<string, number>();
  if (!events.size) return left;
  const list = sql.join(
    [...events].map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const res = await ex.execute<{ k: string; n: number }>(sql`
    select 'e:' || event_id::text as k, count(*)::int as n from applications
      where kind = 'vehicle' and status = 'pending' and event_id in (${list}) group by event_id`);
  for (const r of res.rows) left.set(r.k, Number(r.n));
  return left;
}

/**
 * Le texte d'une ligne « À trier » dit ce qui **reste** à trier (candidatures `pending` de l'événement), pas ce qui est
 * arrivé : le compteur baisse avec le tri, une ligne relue puis une nouvelle arrivée ne s'additionnent pas. À zéro : « Tout est trié ».
 */
async function withLiveTitles(page: ActivityPage): Promise<ActivityPage> {
  const left = await pendingLeft(page.groups.flatMap((g) => g.items.filter((i) => i.type === "application_received")));
  return {
    ...page,
    groups: page.groups.map((g) => ({
      ...g,
      items: g.items.map((i) => {
        const d = i.data as TriageData;
        if (i.type !== "application_received" || d.kind !== "vehicle" || typeof d.eventName !== "string") return i;
        const n = left.get(`e:${d.eventId}`) ?? 0;
        const title =
          n === 0
            ? structureNotificationTexts.applicationAllSorted(d.eventName)
            : structureNotificationTexts.applicationVehicle(n, d.eventName);
        return { ...i, count: n, title, body: "" };
      }),
    })),
  };
}

/** Condition SQL : une ligne « À trier » dont plus rien n'attend n'est plus « nouvelle » (pastille). */
const stillToSort = sql`(${notifications.type} <> 'application_received' or exists (
  select 1 from applications a where a.status = 'pending' and (
    (${notifications.data} ->> 'kind' = 'vehicle' and a.kind = 'vehicle' and a.event_id = ${notifications.eventId})
    or (${notifications.data} ->> 'kind' <> 'vehicle' and a.id::text = ${notifications.data} ->> 'applicationId'))))`;

export const structureActivityService = {
  /** `GET /structures/:id/activity?cursor=&filter=` : même forme que `GET /me/activity`, `highlighted` toujours vide. */
  async list(
    v: Viewer,
    structureId: string,
    q: { cursor?: string; filter: StructureActivityFilter },
  ): Promise<ActivityPage> {
    await requireStructureReader(v, structureId);
    const c = decodeCursor(q.cursor);
    if (q.cursor && (!c || !UUID.test(c.id))) throw validation("Curseur invalide.");
    const delivered = notifications.deliveredAt;
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          mine(v.user.id, structureId),
          inArray(notifications.type, [...structureActivityTypes(q.filter)]),
          c ? or(lt(delivered, c.createdAt), and(eq(delivered, c.createdAt), lt(notifications.id, c.id))) : undefined,
        ),
      )
      .orderBy(desc(delivered), desc(notifications.id))
      .limit(ACTIVITY_PAGE_SIZE + 1);
    const page = rows.slice(0, ACTIVITY_PAGE_SIZE);
    const last = page.at(-1);
    return await withLiveTitles({
      groups: groupActivity(await toRows(page), now()),
      highlighted: [],
      nextCursor:
        rows.length > ACTIVITY_PAGE_SIZE && last?.deliveredAt ? encodeCursor(last.deliveredAt, last.id) : null,
    });
  },

  /** Non vus depuis mon dernier passage dans l'Activité de cette structure (hors demandes : elles ont leur compte). */
  async unseen(userId: string, structureId: string, ex: Executor = db): Promise<number> {
    const [m] = await ex
      .select({ seenAt: structureMembers.activitySeenAt })
      .from(structureMembers)
      .where(and(eq(structureMembers.structureId, structureId), eq(structureMembers.userId, userId)));
    const since = m?.seenAt && m.seenAt > windowStart() ? m.seenAt : windowStart();
    const where = and(
      mine(userId, structureId),
      isNull(notifications.readAt),
      // Seulement les types que la liste montre (une ligne comptée est une ligne lisible), hors demandes.
      inArray(notifications.type, [...structureActivityTypes("all").filter((t) => !structureRequestTypes.includes(t))]),
      gt(notifications.deliveredAt, since),
      stillToSort,
    );
    const [row] = await ex.select({ n: sql<number>`count(*)::int` }).from(notifications).where(where);
    const types = journalGuardedTypes();
    const guarded = types.length
      ? await ex
          .select()
          .from(notifications)
          .where(and(where, inArray(notifications.type, types)))
      : [];
    const hidden = guarded.length
      ? [...(await journalVerdicts(userId, guarded)).values()].filter((x) => !x.shown).length
      : 0;
    return Math.max(0, (row?.n ?? 0) - hidden);
  },

  /** Les deux files de demandes de la structure. */
  async requestCounts(userId: string, structureId: string, ex: Executor = db) {
    return {
      staff: (await requestedStaff(structureId, ex)).length,
      coauthor: (await structureCoauthorPostIds(userId, structureId, ex)).length,
    };
  },

  /** `GET /structures/:id/activity/count` */
  async count(v: Viewer, structureId: string): Promise<StructureActivityCount> {
    await requireStructureReader(v, structureId);
    return {
      unseen: await this.unseen(v.user.id, structureId),
      requests: await this.requestCounts(v.user.id, structureId),
    };
  },

  /** `POST /structures/:id/activity/seen` : le « vu » du membre, et ses appareils rechargent leurs pastilles. */
  async markSeen(v: Viewer, structureId: string): Promise<void> {
    await requireStructureReader(v, structureId);
    await db
      .update(structureMembers)
      .set({ activitySeenAt: now() })
      .where(and(eq(structureMembers.structureId, structureId), eq(structureMembers.userId, v.user.id)));
    inboxService.publish(v.user.id);
  },

  /**
   * `GET /structures/:id/requests` : les demandes de staff (`kind = "staff"`, `id` = la personne qui demande ; accepter et
   * refuser : `/structures/:id/members/:userId/accept|decline`) et les invitations à publier (`kind = "coauthor"`, `id` = la
   * publication ; `/me/feed-coauthor-requests/:postId/accept|decline`). Une seule page (borne : `STAFF_PENDING_MAX`).
   */
  async requests(v: Viewer, structureId: string): Promise<RequestsPage> {
    const structure = await requireStructureReader(v, structureId);
    const staff: RequestItem[] = (await requestedStaff(structureId)).map((r) => ({
      kind: "staff",
      id: r.userId,
      from: { type: "person", pseudo: r.pseudo, avatarUrl: storage.url(r.avatarKey) },
      at: r.at.toISOString(),
      payload: { direction: "request", structureId, structureSlug: structure.slug, structureName: structure.name },
    }));
    const key = authorKeyOf("structure", structureId);
    const coauthor: RequestItem[] = (await pendingCoauthorRequests(v.user.id, db, now(), "all"))
      .filter((r) => r.forKey === key)
      .map((r) => {
        const a = r.view.author;
        const payload: CoAuthorRequestPayload = {
          postId: r.postId,
          author: { key: a.key, kind: a.kind, name: a.name, avatarUrl: a.avatarUrl },
          forKey: r.forKey,
          forName: r.forView && r.forView.kind !== "user" ? r.forView.name : null,
          caption: captionPreview(r.view.caption),
          photoUrl: r.view.photos[0]?.url ?? null,
        };
        return {
          kind: "coauthor",
          id: r.postId,
          from:
            a.kind === "user"
              ? { type: "person", pseudo: a.name, avatarUrl: a.avatarUrl }
              : { type: "structure", name: a.name, logoUrl: a.avatarUrl },
          at: r.invitedAt.toISOString(),
          payload,
        } satisfies RequestItem;
      });
    const items = [...staff, ...coauthor].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return { total: items.length, items, nextCursor: null };
  },
};
