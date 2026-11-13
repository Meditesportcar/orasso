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
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { notifications, profiles, structureMembers } from "../../db/schema";
import { now } from "../../lib/deps";
import { validation } from "../../lib/errors";
import { decodeCursor, encodeCursor } from "../../lib/pagination";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import { requireStructureReader } from "../communication/guards";
import { pendingCoauthorPostIds, pendingCoauthorRequests } from "../feed/coauthors";
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

/** Les invitations à publier adressées à cette structure (pas à moi ni aux autres pages que je gère). */
async function structureCoauthorPostIds(userId: string, structureId: string, ex: Executor = db) {
  const key = authorKeyOf("structure", structureId);
  return (await pendingCoauthorPostIds(userId, ex)).filter((p) => p.forKey === key);
}

/** Le texte d'une ligne « À trier » suit le compteur (le titre stocké est celui de la première candidature). */
function withLiveTitles(page: ActivityPage): ActivityPage {
  return {
    ...page,
    groups: page.groups.map((g) => ({
      ...g,
      items: g.items.map((i) => {
        const d = i.data as { kind?: unknown; eventName?: unknown };
        if (i.type !== "application_received" || d.kind !== "vehicle" || typeof d.eventName !== "string") return i;
        const title = structureNotificationTexts.applicationVehicle(i.count, d.eventName);
        return { ...i, title, body: title };
      }),
    })),
  };
}

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
    return withLiveTitles({
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
      notInArray(notifications.type, [...structureRequestTypes]),
      gt(notifications.deliveredAt, since),
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
    const coauthor: RequestItem[] = (await pendingCoauthorRequests(v.user.id, db, now()))
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
