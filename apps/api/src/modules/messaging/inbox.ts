// Pastille de la Boîte (lot 18, ARCHITECTURE-SUITE § 3.3) : conversations qui ont du non lu, et demandes en attente
// par sorte. Chaque lot qui ajoute une sorte de demande (crew, invitation à un événement, staff…) déclare son compteur
// avec `registerInboxCounter` (et sa clé dans `InboxRequestCounts` de `packages/shared`).
import type { InboxRequestCounts, InboxSummary } from "@orasso/shared";
import { and, count, eq, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { contactRequests, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { realtime } from "../../lib/realtime";
import type { Executor } from "../../lib/tx";
import { registerOrganizerBadge } from "../profiles/personas";

type Counter = (userId: string, ex: Executor) => Promise<number>;
const counters = new Map<keyof InboxRequestCounts, Counter>();

export function registerInboxCounter(key: keyof InboxRequestCounts, counter: Counter) {
  counters.set(key, counter);
}

/** Demandes de contact reçues en attente (expéditeurs supprimés ou suspendus exclus). */
export async function pendingContactCount(userId: string, ex: Executor = db): Promise<number> {
  const [row] = await ex
    .select({ n: count() })
    .from(contactRequests)
    .innerJoin(profiles, eq(profiles.userId, contactRequests.fromUserId))
    .where(
      and(
        eq(contactRequests.toUserId, userId),
        eq(contactRequests.status, "pending"),
        sql`${profiles.deletedAt} is null`,
        sql`(${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${now()})`,
      ),
    );
  return row?.n ?? 0;
}

// Lot R6b : le compteur des demandes d'abonnement (`follow`) est déclaré par `social/follows.ts`.
registerInboxCounter("contact", pendingContactCount);

/** Condition SQL « ce message est non lu pour `userId` », `m` et `p` (sa ligne de participant) étant dans la requête. */
const unreadMessageSql = (userId: string, structureSide: boolean) => sql`
  m.deleted_at is null and m.moderated_at is null and m.kind <> 'system'
  and m.sender_id is distinct from ${userId}
  ${structureSide ? sql`and m.as_structure = false` : sql``}
  and (p.last_read_message_at is null or (m.created_at, m.id) > (p.last_read_message_at, p.last_read_message_id))`;

/**
 * Conversations qui ont au moins un message non lu. Côté participant : ses lignes actives (hors conversation
 * `organizer` où il est l'organisateur). Côté structure (`includeStructure`, session à second facteur) : les
 * conversations `organizer` des structures dont il est propriétaire ou co-organisateur actif.
 */
export async function unreadConversationCount(
  userId: string,
  opts: { includeStructure: boolean; structureId?: string },
  ex: Executor = db,
): Promise<number> {
  const at = now();
  const member = opts.structureId
    ? sql`0`
    : sql`(select count(*) from conversations c
        join conversation_participants p on p.conversation_id = c.id and p.user_id = ${userId} and p.left_at is null
        where (c.kind <> 'organizer' or p.role = 'member')
          and (c.readable_until is null or c.readable_until > ${at})
          and exists (select 1 from messages m where m.conversation_id = c.id and ${unreadMessageSql(userId, false)}))`;
  const structure = opts.includeStructure
    ? sql`(select count(*) from conversations c
        join structure_members sm on sm.structure_id = c.structure_id and sm.user_id = ${userId}
          and sm.status = 'active' and sm.role in ('owner', 'co_organizer')
        join structures s on s.id = c.structure_id and s.deleted_at is null
        left join conversation_participants p on p.conversation_id = c.id and p.user_id = ${userId}
        where c.kind = 'organizer' and (p.role is null or p.role = 'admin')
          ${opts.structureId ? sql`and c.structure_id = ${opts.structureId}` : sql``}
          and exists (select 1 from messages m where m.conversation_id = c.id and ${unreadMessageSql(userId, true)}))`
    : sql`0`;
  const result = await ex.execute(sql`select (${member}) + (${structure}) as n`);
  return Number((result.rows[0] as { n?: number | string } | undefined)?.n ?? 0);
}

export const inboxService = {
  async summary(userId: string, opts: { includeStructure: boolean }, ex: Executor = db): Promise<InboxSummary> {
    const requests = { follow: 0, contact: 0 } as InboxRequestCounts;
    for (const [key, counter] of counters) requests[key] = await counter(userId, ex);
    return { unreadMessages: await unreadConversationCount(userId, opts, ex), requests };
  },

  /** Total de la pastille de l'onglet Boîte (`GET /me` → `unreadInbox`). */
  async total(userId: string, opts: { includeStructure: boolean }): Promise<number> {
    const s = await this.summary(userId, opts);
    return s.unreadMessages + Object.values(s.requests).reduce((a, b) => a + b, 0);
  },

  /** Prévient les appareils de la personne que la Boîte a changé : ils rechargent `GET /me/inbox/summary`. */
  publish(userId: string) {
    realtime.publish(`user:${userId}`, "inbox.changed", {});
  },
};

// Casquette d'une structure : les conversations de participants qui attendent une réponse comptent dans « à traiter ».
registerOrganizerBadge((structureId, v) => unreadConversationCount(v.user.id, { includeStructure: true, structureId }));
