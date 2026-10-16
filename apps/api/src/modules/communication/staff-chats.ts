// Discussions du staff (lot 20, ARCHITECTURE-SUITE § 5.2) : une permanente par structure (`structure_staff`, créée au
// premier accès) et une par événement (`event_staff`, créée à la publication), fermée à J+1 et lisible par
// l'organisateur jusqu'à J+7 (S21), supprimée un an après la fin. Les droits viennent des règles d'accès
// (`messaging/access/<kind>.ts`), recalculées à chaque appel ; les lignes de participant ne servent qu'à la Boîte
// (liste, non-lus) et sont tenues à jour ici à chaque changement d'équipe.
import {
  type StaffConversationState,
  staffChatClosesAt,
  staffChatPurgeAt,
  staffChatReadableUntil,
} from "@orasso/shared";
import { and, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { conversationParticipants, conversations, events, messages } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, forbidden } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { type EventRow, eventsRepo } from "../events/repo";
import { type ConversationRow, rulesOf } from "../messaging/access";
import { eventStaffMembers } from "../messaging/access/event_staff";
import { activeTeam } from "../messaging/access/structure_staff";
import { resolveAccess, unreadCountOf } from "../messaging/core";
import { staffService } from "../staff/service";
import { memberRole, requireStructureReader } from "./guards";

export const structureStaffKey = (structureId: string) => `structure:${structureId}`;
export const eventStaffKey = (eventId: string) => `event:${eventId}`;

/** Crée la conversation de clé `key` si besoin (deux créations simultanées : une seule ligne). */
async function getOrCreate(
  ex: Executor,
  key: string,
  values: Omit<typeof conversations.$inferInsert, "directKey">,
): Promise<ConversationRow> {
  const [inserted] = await ex
    .insert(conversations)
    .values({ ...values, directKey: key })
    .onConflictDoNothing({ target: conversations.directKey })
    .returning();
  if (inserted) return inserted;
  const [existing] = await ex.select().from(conversations).where(eq(conversations.directKey, key));
  if (!existing) throw new Error("Conversation introuvable après conflit");
  return existing;
}

/**
 * Lignes de participant = lecteurs du moment : ajoutées (ou rouvertes) pour les nouveaux, fermées (`left_at`) pour qui
 * n'y a plus droit (membre retiré, staff après J+1). Organisateurs en `admin`, staff en `member`.
 */
async function syncParticipants(ex: Executor, conversation: ConversationRow) {
  const rules = rulesOf(conversation.kind);
  if (!rules) return;
  const readers = await rules.readers(ex, conversation);
  const organizers = conversation.structureId
    ? new Set((await activeTeam(ex, conversation.structureId, ["owner", "co_organizer"])).map((o) => o.userId))
    : new Set<string>();
  const ids = readers.map((r) => r.userId);
  for (const userId of ids) {
    await ex
      .insert(conversationParticipants)
      .values({ conversationId: conversation.id, userId, role: organizers.has(userId) ? "admin" : "member" })
      .onConflictDoUpdate({
        target: [conversationParticipants.conversationId, conversationParticipants.userId],
        set: { leftAt: null },
        setWhere: isNotNull(conversationParticipants.leftAt),
      });
  }
  await ex
    .update(conversationParticipants)
    .set({ leftAt: now() })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversation.id),
        isNull(conversationParticipants.leftAt),
        ids.length
          ? sql`${conversationParticipants.userId} not in (${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )})`
          : undefined,
      ),
    );
}

function stateOf(
  c: ConversationRow,
  event: Pick<EventRow, "id" | "title" | "startsAt" | "endsAt"> | null,
  unreadCount: number,
): StaffConversationState {
  const at = now();
  return {
    conversationId: c.id,
    kind: c.kind === "event_staff" ? "event_staff" : "structure_staff",
    title: event ? `Staff · ${event.title}` : "Discussion permanente du staff",
    event: event
      ? { id: event.id, title: event.title, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString() }
      : null,
    closedAt: c.closedAt?.toISOString() ?? null,
    readableUntil: c.readableUntil?.toISOString() ?? null,
    open: !c.closedAt || c.closedAt > at,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    unreadCount,
  };
}

export const staffChatsService = {
  /** Discussion permanente de la structure (créée au premier accès), participants à jour. */
  async ensureStructureChat(ex: Executor, structureId: string): Promise<ConversationRow> {
    const c = await getOrCreate(ex, structureStaffKey(structureId), { kind: "structure_staff", structureId });
    await syncParticipants(ex, c);
    return c;
  },

  /**
   * Discussion de l'événement (à la publication, puis à chaque accès) : fermeture et fin de lecture recalculées sur les
   * dates de l'événement (un événement décalé décale sa discussion), lignes `event_staff` et participants à jour.
   */
  async ensureEventChat(ex: Executor, event: EventRow): Promise<ConversationRow> {
    const closedAt = staffChatClosesAt(event);
    const readableUntil = staffChatReadableUntil(event);
    // Membres du staff arrivés après la publication : leurs lignes `event_staff` (sans effet après J+1).
    await staffService.ensureRows(event, ex);
    let c = await getOrCreate(ex, eventStaffKey(event.id), {
      kind: "event_staff",
      structureId: event.structureId,
      eventId: event.id,
      closedAt,
      readableUntil,
    });
    if (c.closedAt?.getTime() !== closedAt.getTime() || c.readableUntil?.getTime() !== readableUntil.getTime()) {
      const [updated] = await ex
        .update(conversations)
        .set({ closedAt, readableUntil })
        .where(eq(conversations.id, c.id))
        .returning();
      if (updated) c = updated;
    }
    await syncParticipants(ex, c);
    return c;
  },

  /** Après un changement d'équipe (invitation acceptée, rôle modifié, membre retiré) : toutes ses discussions ouvertes. */
  async syncStructure(structureId: string, ex: Executor = db) {
    const at = now();
    const [existing] = await ex
      .select()
      .from(conversations)
      .where(eq(conversations.directKey, structureStaffKey(structureId)));
    if (existing) await syncParticipants(ex, existing);
    const open = await ex
      .select({ e: events })
      .from(conversations)
      .innerJoin(events, eq(events.id, conversations.eventId))
      .where(
        and(
          eq(conversations.kind, "event_staff"),
          eq(conversations.structureId, structureId),
          or(isNull(conversations.closedAt), gt(conversations.closedAt, at)),
        ),
      );
    for (const { e } of open) await this.ensureEventChat(ex, e);
  },

  /** `GET /structures/:id/staff-conversation` : tout membre actif (organisateur ou staff). */
  async forStructure(v: Viewer, structureId: string): Promise<StaffConversationState> {
    const role = await memberRole(db, v.user.id, structureId);
    if (!role) throw forbidden("Réservé à l'équipe de la structure");
    const c = await withTx((tx) => this.ensureStructureChat(tx, structureId));
    const access = await resolveAccess(db, c, v.user.id);
    if (!access) throw forbidden("Réservé à l'équipe de la structure");
    return stateOf(c, null, await unreadCountOf(db, c.id, access.reader));
  },

  /**
   * `GET /events/:id/staff-conversation` : le staff de l'événement (avant J+1) et les organisateurs (jusqu'à J+7).
   * Discussion fermée pour le staff : `403 conversation_closed` (l'appli affiche « Fermée à J+1 »).
   */
  async forEvent(v: Viewer, eventId: string): Promise<StaffConversationState> {
    const e = await eventsRepo.byId(eventId);
    const role = await memberRole(db, v.user.id, e.structureId);
    if (!role || e.status === "draft") throw forbidden("Réservé au staff de l'événement");
    const c = await withTx((tx) => this.ensureEventChat(tx, e));
    const access = await resolveAccess(db, c, v.user.id);
    if (!access) {
      const wasStaff =
        role === "staff" && (await eventStaffMembers(db, e.id, e.structureId)).some((s) => s.userId === v.user.id);
      if (wasStaff && c.closedAt && c.closedAt <= now()) {
        throw new AppError(403, "conversation_closed", "Discussion fermée à J+1.");
      }
      if (role !== "staff" && c.readableUntil && c.readableUntil <= now()) {
        throw new AppError(403, "conversation_closed", "Discussion fermée : lisible jusqu'à J+7 seulement.");
      }
      throw forbidden("Réservé au staff de l'événement");
    }
    return stateOf(c, e, await unreadCountOf(db, c.id, access.reader));
  },

  /**
   * `GET /structures/:id/staff-conversations` (organisateurs) : la discussion permanente, puis celles des événements
   * encore lisibles (avant J+7), les plus proches d'abord.
   */
  async listForStructure(v: Viewer, structureId: string): Promise<StaffConversationState[]> {
    await requireStructureReader(v, structureId);
    const permanent = await this.forStructure(v, structureId);
    const at = now();
    const rows = await db
      .select({ c: conversations, e: events })
      .from(conversations)
      .innerJoin(events, eq(events.id, conversations.eventId))
      .where(
        and(
          eq(conversations.kind, "event_staff"),
          eq(conversations.structureId, structureId),
          or(isNull(conversations.readableUntil), gt(conversations.readableUntil, at)),
        ),
      )
      .orderBy(desc(events.startsAt));
    const out: StaffConversationState[] = [permanent];
    for (const { c, e } of rows) {
      const access = await resolveAccess(db, c, v.user.id);
      if (!access) continue;
      out.push(stateOf(c, e, await unreadCountOf(db, c.id, access.reader)));
    }
    return out;
  },

  /**
   * Fermeture (J+1) : fermeture posée (même si aucun accès ne l'a recalculée), le staff quitte la conversation (plus de
   * non-lus ni de liste) ; les organisateurs restent jusqu'à J+7.
   */
  async closeEventChat(eventId: string): Promise<boolean> {
    const e = await eventsRepo.byId(eventId).catch(() => null);
    if (!e || now() < staffChatClosesAt(e)) return false;
    const [c] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.directKey, eventStaffKey(eventId)));
    if (!c) return false;
    await withTx((tx) => this.ensureEventChat(tx, e));
    return true;
  },

  /** Purge (fin + 1 an) : la discussion et ses images disparaissent. */
  async purgeEventChat(eventId: string): Promise<boolean> {
    const e = await eventsRepo.byId(eventId).catch(() => null);
    const [c] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.directKey, eventStaffKey(eventId)));
    if (!c) return false;
    if (e && now() < staffChatPurgeAt(e)) return false;
    const keys = await withTx(async (tx: Tx) => {
      const images = await tx
        .select({ key: messages.imageKey })
        .from(messages)
        .where(and(eq(messages.conversationId, c.id), isNotNull(messages.imageKey)));
      await tx.delete(conversations).where(eq(conversations.id, c.id));
      return images.map((i) => i.key).filter((k): k is string => Boolean(k));
    });
    for (const key of keys) await storage.remove(key).catch(() => undefined);
    return true;
  },

  /**
   * Tâche `messaging.staff-chats-sweep` (chaque heure, relecture du lot 20 : un balayage plutôt qu'une tâche par
   * événement, qui couvre aussi les événements publiés avant le déploiement) : discussions d'événement fermées dont
   * le staff est encore participant → fermeture posée ; discussions d'événements finis depuis plus d'un an → purge.
   */
  async sweep(): Promise<{ closed: number; purged: number }> {
    const at = now();
    const toClose = await db.execute(sql`
      select distinct c.event_id from conversations c
      join conversation_participants p on p.conversation_id = c.id and p.left_at is null and p.role = 'member'
      where c.kind = 'event_staff' and c.event_id is not null and c.closed_at is not null and c.closed_at <= ${at}
      limit 200`);
    let closed = 0;
    for (const row of toClose.rows as { event_id: string }[]) if (await this.closeEventChat(row.event_id)) closed += 1;
    const toPurge = await db.execute(sql`
      select c.event_id from conversations c join events e on e.id = c.event_id
      where c.kind = 'event_staff' and e.ends_at <= ${new Date(at.getTime() - 365 * 86_400_000)}
      limit 200`);
    let purged = 0;
    for (const row of toPurge.rows as { event_id: string }[]) if (await this.purgeEventChat(row.event_id)) purged += 1;
    return { closed, purged };
  },

  /** Discussions du staff où la personne a du non lu (Boîte de la casquette Organisateur). */
  async unreadFor(v: Viewer, structureId: string): Promise<number> {
    const rows = await db
      .select()
      .from(conversations)
      .innerJoin(conversationParticipants, eq(conversationParticipants.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.structureId, structureId),
          inArray(conversations.kind, ["structure_staff", "event_staff"]),
          eq(conversationParticipants.userId, v.user.id),
          isNull(conversationParticipants.leftAt),
        ),
      );
    let n = 0;
    for (const { conversations: c } of rows) {
      const access = await resolveAccess(db, c, v.user.id);
      if (access && (await unreadCountOf(db, c.id, access.reader)) > 0) n += 1;
    }
    return n;
  },
};
