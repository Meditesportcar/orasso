// Messagerie (lot 18, ARCHITECTURE-SUITE § 3) : conversations, messages, lecture, suppression, images privées.
// Toute écriture passe par ici ; les droits viennent des règles par sorte (`access/<kind>.ts`) et sont recalculés à
// chaque appel (aucun accès par identifiant deviné : qui n'est pas lecteur reçoit 403 sans aucun contenu).
import {
  type ConversationPage,
  type ConversationSummary,
  type ConversationView,
  directKey,
  MESSAGE_PREVIEW_MAX,
  MESSAGES_PER_MINUTE,
  type MessagePage,
  type MessageSend,
  type MessageView,
  messagePreview,
  type OpenConversationResult,
  organizerKey,
  PUSH_PREVIEW_MAX,
  shorten,
} from "@orasso/shared";
import { and, count, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { conversationParticipants, conversations, messages, structures, uploads } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import { decodeCursor, encodeCursor } from "../../lib/pagination";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { profilesRepo } from "../profiles/repo";
import { uploadsService } from "../uploads/service";
import { type ConversationRow, type Reader, registeredKinds } from "./access";
import { canTalkDirect } from "./access/direct";
import { isStructureOrganizer, structureCanReach } from "./access/organizer";
import {
  type Access,
  type Actor,
  actorOf,
  ensureParticipant,
  imageNameOf,
  isMySide,
  lastMessageOf,
  type MessageRow,
  publishToConversation,
  refreshPreview,
  requireAccess,
  resolveAccess,
  senderProfiles,
  serializeMessage,
  twoFactorOk,
  unreadCountOf,
  writeBlockError,
  writeBlockOf,
} from "./core";
import { inboxService } from "./inbox";

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

/** Personne joignable : compte existant, ni supprimé ni suspendu (404 sinon, comme un profil inconnu). */
async function reachableProfile(userId: string) {
  const p = await profilesRepo.byUserId(userId);
  if (!p || p.deletedAt || (p.suspendedUntil && p.suspendedUntil > now())) throw notFound("Profil introuvable");
  return p;
}

/** Crée la conversation de clé `key` si elle n'existe pas (deux ouvertures simultanées : une seule ligne). */
async function getOrCreate(
  tx: Tx,
  key: string,
  values: Omit<typeof conversations.$inferInsert, "directKey">,
): Promise<{ conversation: ConversationRow; created: boolean }> {
  const [inserted] = await tx
    .insert(conversations)
    .values({ ...values, directKey: key })
    .onConflictDoNothing({ target: conversations.directKey })
    .returning();
  if (inserted) return { conversation: inserted, created: true };
  const [existing] = await tx.select().from(conversations).where(eq(conversations.directKey, key));
  if (!existing) throw new Error("Conversation introuvable après conflit");
  return { conversation: existing, created: false };
}

/** Destinataires d'un message : les lecteurs, sauf l'expéditeur et, pour un message de structure, ses collègues. */
const recipientsOf = (readers: Reader[], sender: Reader) =>
  readers.filter((r) => r.userId !== sender.userId && !(sender.side === "structure" && r.side === "structure"));

async function summaryOf(access: Access, actor: Actor): Promise<ConversationSummary> {
  const { conversation, rules, reader } = access;
  const d = await rules.describe(db, conversation, reader);
  const last = await lastMessageOf(db, conversation.id);
  return {
    id: conversation.id,
    kind: conversation.kind,
    side: reader.side,
    title: d.title,
    subtitle: d.subtitle,
    avatarUrl: d.avatarUrl,
    participants: d.participants.slice(0, 3),
    lastMessage: last
      ? {
          preview: messagePreview(
            { kind: last.kind, body: last.body, deleted: Boolean(last.deletedAt || last.moderatedAt) },
            MESSAGE_PREVIEW_MAX,
          ),
          at: last.createdAt.toISOString(),
          mine: isMySide(last, reader),
        }
      : null,
    unreadCount: await unreadCountOf(db, conversation.id, { ...reader, userId: actor.userId }),
    closedAt: conversation.closedAt?.toISOString() ?? null,
  };
}

/** Prévient les appareils des lecteurs qu'une conversation a bougé (liste et pastille). */
function announce(conversationId: string, userIds: string[]) {
  for (const id of new Set(userIds)) {
    realtime.publish(`user:${id}`, "conversation.updated", { conversationId });
    inboxService.publish(id);
  }
}

export const messagingService = {
  /**
   * `POST /conversations/direct {userId}` : la conversation existante (200), sinon créée entre amis ou après une
   * demande de contact acceptée (201), sinon `409 not_friends` (le client propose une demande de contact).
   */
  async openDirect(v: Viewer, otherUserId: string): Promise<OpenConversationResult> {
    if (otherUserId === v.user.id) throw validation("C'est ton propre compte.");
    await reachableProfile(otherUserId);
    const key = directKey(v.user.id, otherUserId);
    const [existing] = await db.select().from(conversations).where(eq(conversations.directKey, key));
    if (existing) return { id: existing.id, created: false };
    if (!(await canTalkDirect(db, v.user.id, otherUserId))) {
      throw new AppError(409, "not_friends", "Vous n'êtes pas amis : envoie une demande de contact.");
    }
    return withTx(async (tx) => {
      const { conversation, created } = await getOrCreate(tx, key, { kind: "direct", createdBy: v.user.id });
      await ensureParticipant(tx, conversation.id, v.user.id, "member");
      await ensureParticipant(tx, conversation.id, otherUserId, "member");
      return { id: conversation.id, created };
    });
  },

  /** `POST /structures/:id/conversation` : contacter une structure vérifiée (toujours possible, docs/01). */
  async openWithStructure(v: Viewer, structureId: string): Promise<OpenConversationResult> {
    const [s] = await db
      .select()
      .from(structures)
      .where(and(eq(structures.id, structureId), isNull(structures.deletedAt)));
    if (s?.verification !== "verified") throw notFound("Structure introuvable");
    if (await isStructureOrganizer(db, v.user.id, structureId)) {
      throw conflict("conflict", "Tu es organisateur de cette structure.");
    }
    return withTx(async (tx) => {
      const { conversation, created } = await getOrCreate(tx, organizerKey(structureId, v.user.id), {
        kind: "organizer",
        structureId,
        createdBy: v.user.id,
      });
      await ensureParticipant(tx, conversation.id, v.user.id, "member");
      return { id: conversation.id, created };
    });
  },

  /**
   * `POST /structures/:id/conversations/with/:userId` : l'organisateur écrit le premier, seulement à un abonné ou à une
   * personne inscrite à ses événements (S10). Propriétaire ou co-organisateur actif, double authentification ; le super
   * admin n'y a pas accès (Orasso ne lit pas les messages).
   */
  async openFromStructure(v: Viewer, structureId: string, userId: string): Promise<OpenConversationResult> {
    const actor = actorOf(v);
    if (!(await isStructureOrganizer(db, v.user.id, structureId))) {
      throw forbidden("Réservé aux organisateurs de la structure");
    }
    if (!twoFactorOk(actor.secondFactor)) {
      throw new AppError(403, "two_factor_required", "Double authentification obligatoire pour cet espace");
    }
    await reachableProfile(userId);
    if (await isStructureOrganizer(db, userId, structureId)) {
      throw conflict("conflict", "Cette personne est organisatrice de la structure.");
    }
    const key = organizerKey(structureId, userId);
    const [existing] = await db.select().from(conversations).where(eq(conversations.directKey, key));
    if (existing) return { id: existing.id, created: false };
    if (!(await structureCanReach(db, structureId, userId, now()))) {
      throw forbidden("Tu peux écrire en premier aux abonnés de ta structure et aux inscrits de tes événements.");
    }
    return withTx(async (tx) => {
      const { conversation, created } = await getOrCreate(tx, key, {
        kind: "organizer",
        structureId,
        createdBy: v.user.id,
      });
      await ensureParticipant(tx, conversation.id, userId, "member");
      await ensureParticipant(tx, conversation.id, v.user.id, "structure");
      return { id: conversation.id, created };
    });
  },

  /** `GET /me/conversations` : les plus récentes d'abord ; une conversation sans message n'apparaît pas. */
  async list(v: Viewer, q: { limit: number; cursor?: string }): Promise<ConversationPage> {
    const actor = actorOf(v);
    const own = await db
      .select({ id: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(and(eq(conversationParticipants.userId, v.user.id), isNull(conversationParticipants.leftAt)));
    const ids = new Set(own.map((r) => r.id));
    // Côté structure seulement avec une session à second facteur.
    if (twoFactorOk(actor.secondFactor)) {
      for (const rules of registeredKinds()) {
        for (const id of (await rules.extraConversationIds?.(db, v.user.id)) ?? []) ids.add(id);
      }
    }
    if (!ids.size) return { items: [], nextCursor: null };
    const c = decodeCursor(q.cursor);
    const rows = await db
      .select()
      .from(conversations)
      .where(
        and(
          inArray(conversations.id, [...ids]),
          isNotNull(conversations.lastMessageAt),
          c
            ? or(
                lt(conversations.lastMessageAt, c.createdAt),
                and(eq(conversations.lastMessageAt, c.createdAt), lt(conversations.id, c.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const items: ConversationSummary[] = [];
    for (const row of page) {
      const access = await resolveAccess(db, row, v.user.id);
      if (!access) continue;
      if (access.reader.side === "structure" && !twoFactorOk(actor.secondFactor)) continue;
      items.push(await summaryOf(access, actor));
    }
    const last = page.at(-1);
    return {
      items,
      nextCursor: rows.length > q.limit && last?.lastMessageAt ? encodeCursor(last.lastMessageAt, last.id) : null,
    };
  },

  /** `GET /conversations/:id` : en-tête de la conversation et droit d'écrire. */
  async view(v: Viewer, id: string): Promise<ConversationView> {
    const actor = actorOf(v);
    const access = await requireAccess(actor, id);
    const d = await access.rules.describe(db, access.conversation, access.reader);
    const block = await writeBlockOf(db, actor, access);
    return {
      ...(await summaryOf(access, actor)),
      canWrite: block === null,
      writeBlocked: block,
      structure: d.structure,
      otherUser: d.otherUser,
    };
  },

  /** `GET /conversations/:id/messages?before=&limit=` : du plus récent au plus ancien ; « lu par » en première page. */
  async messages(v: Viewer, id: string, q: { before?: string; limit: number }): Promise<MessagePage> {
    const actor = actorOf(v);
    const access = await requireAccess(actor, id);
    let beforeCond: ReturnType<typeof sql> | undefined;
    if (q.before) {
      const [pivot] = await db
        .select({ at: messages.createdAt, id: messages.id })
        .from(messages)
        .where(and(eq(messages.id, q.before), eq(messages.conversationId, id)));
      if (!pivot) throw validation("Message de référence inconnu");
      beforeCond = sql`(${messages.createdAt}, ${messages.id}) < (select m2.created_at, m2.id from messages m2 where m2.id = ${pivot.id})`;
    }
    const rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, id), beforeCond))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const senders = await senderProfiles(
      db,
      page.map((m) => m.senderId),
    );
    const readBy = q.before ? null : await this.readByOf(access, page);
    return {
      items: page.map((m) =>
        serializeMessage(
          m,
          m.senderId ? (senders.get(m.senderId) ?? null) : null,
          v.user.id,
          readBy?.get(m.id) ?? null,
        ),
      ),
      nextCursor: rows.length > q.limit ? (page.at(-1)?.id ?? null) : null,
    };
  },

  /**
   * « Lu par » (S9 : toujours actif) : pour chaque message de mon côté, les lecteurs de l'autre côté (ou les autres
   * participants) dont le marqueur de lecture couvre ce message. Calcul en base, à la précision de la base.
   */
  async readByOf(access: Access, page: MessageRow[]): Promise<Map<string, { userId: string; pseudo: string }[]>> {
    const out = new Map<string, { userId: string; pseudo: string }[]>();
    const mine = page.filter((m) => !m.deletedAt && m.kind !== "system" && isMySide(m, access.reader));
    if (!mine.length) return out;
    const others = access.readers.filter(
      (r) => r.userId !== access.reader.userId && !(access.reader.side === "structure" && r.side === "structure"),
    );
    if (!others.length) return out;
    const result = await db.execute(sql`
      select m.id as message_id, p.user_id, pr.pseudo
      from messages m
      join conversation_participants p on p.conversation_id = m.conversation_id
      join profiles pr on pr.user_id = p.user_id and pr.deleted_at is null
      where m.id in (${sql.join(
        mine.map((m) => sql`${m.id}::uuid`),
        sql`, `,
      )})
        and p.user_id in (${sql.join(
          others.map((r) => sql`${r.userId}`),
          sql`, `,
        )})
        and p.user_id is distinct from m.sender_id
        and p.last_read_message_at is not null
        and (p.last_read_message_at, p.last_read_message_id) >= (m.created_at, m.id)
      order by pr.pseudo`);
    for (const row of result.rows as { message_id: string; user_id: string; pseudo: string }[]) {
      const list = out.get(row.message_id) ?? [];
      list.push({ userId: row.user_id, pseudo: row.pseudo });
      out.set(row.message_id, list);
    }
    for (const m of mine) if (!out.has(m.id)) out.set(m.id, []);
    return out;
  },

  /**
   * `POST /conversations/:id/messages` : envoi idempotent par `clientId` (même identifiant = même message, `200`).
   * 60 messages par minute et par personne, comptés en base ; une image n'est rattachée qu'une fois, par son auteur.
   */
  async send(v: Viewer, id: string, input: MessageSend): Promise<{ message: MessageView; created: boolean }> {
    const actor = actorOf(v);
    const access = await requireAccess(actor, id);
    const replay = async (row: MessageRow) => {
      if (row.senderId !== v.user.id) throw conflict("conflict", "Identifiant de message déjà utilisé");
      return { message: serializeMessage(row, senderOf(v), v.user.id), created: false };
    };
    const [seen] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, id), eq(messages.clientId, input.clientId)));
    if (seen) return replay(seen);
    const block = await writeBlockOf(db, actor, access);
    if (block) throw writeBlockError(block);
    const [recent] = await db
      .select({ n: count() })
      .from(messages)
      .where(and(eq(messages.senderId, v.user.id), gt(messages.createdAt, new Date(now().getTime() - 60_000))));
    if ((recent?.n ?? 0) >= MESSAGES_PER_MINUTE) {
      throw new AppError(429, "rate_limited", "Trop de messages : attends une minute.", { retryAfter: 60 });
    }

    const reader = access.reader;
    const result = await withTx(async (tx, after) => {
      // Verrou de la conversation : compteurs, aperçu et idempotence sans course entre deux envois.
      const [locked] = await tx
        .select({ lastMessageAt: conversations.lastMessageAt })
        .from(conversations)
        .where(eq(conversations.id, id))
        .for("update");
      const [again] = await tx
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, id), eq(messages.clientId, input.clientId)));
      if (again) return { row: again, created: false };
      let image: { key: string; width: number; height: number } | null = null;
      if (input.imageKey) {
        const upload = await uploadsService.consume(tx, v.user.id, input.imageKey, "message");
        if (!upload) throw validation("Image inconnue ou déjà envoyée");
        image = { key: upload.key, width: upload.width, height: upload.height };
      }
      const at = nextMessageAt(locked?.lastMessageAt ?? null);
      const [row] = await tx
        .insert(messages)
        .values({
          conversationId: id,
          senderId: v.user.id,
          kind: image ? "image" : "text",
          body: image ? null : (input.body ?? null),
          imageKey: image?.key ?? null,
          imageWidth: image?.width ?? null,
          imageHeight: image?.height ?? null,
          clientId: input.clientId,
          asStructure: reader.side === "structure",
          createdAt: at,
        })
        .returning();
      if (!row) throw new Error("Message non enregistré");
      await tx
        .update(conversations)
        .set({
          lastMessageAt: at,
          lastMessagePreview: shorten(
            messagePreview({ kind: row.kind, body: row.body, deleted: false }),
            MESSAGE_PREVIEW_MAX,
          ),
          messagesCount: sql`${conversations.messagesCount} + 1`,
        })
        .where(eq(conversations.id, id));
      await ensureParticipant(tx, id, v.user.id, reader.side);
      // Écrire, c'est avoir lu ce qui précède.
      await markReadTx(tx, id, v.user.id, reader.side, row.id);
      const recipients = recipientsOf(access.readers, reader);
      for (const r of recipients) await ensureParticipant(tx, id, r.userId, r.side);
      await pushTo(tx, access, row, v, recipients);
      after(() => notificationsService.kick());
      after(() => {
        publishToConversation(id, access.readers, "message.new", { message: serializeMessage(row, senderOf(v), null) });
        announce(
          id,
          access.readers.map((r) => r.userId),
        );
      });
      return { row, created: true };
    }).catch((error) => {
      if (isUniqueViolation(error)) throw conflict("conflict", "Message déjà envoyé");
      throw error;
    });
    if (!result.created) return replay(result.row);
    return { message: serializeMessage(result.row, senderOf(v), v.user.id), created: true };
  },

  /** `POST /conversations/:id/read {messageId}` : le marqueur ne recule jamais (plusieurs appareils). */
  async markRead(v: Viewer, id: string, messageId: string) {
    const actor = actorOf(v);
    const access = await requireAccess(actor, id);
    const [m] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.conversationId, id)));
    if (!m) throw notFound("Message introuvable");
    const moved = await withTx((tx) => markReadTx(tx, id, v.user.id, access.reader.side, messageId));
    if (moved) {
      publishToConversation(id, access.readers, "message.read", {
        userId: v.user.id,
        pseudo: v.profile.pseudo,
        lastReadMessageId: messageId,
      });
      inboxService.publish(v.user.id);
    }
    return { ok: true };
  },

  /** `DELETE /messages/:id` : l'expéditeur seul ; « Message supprimé » pour tous, image effacée du stockage. */
  async deleteMessage(v: Viewer, messageId: string) {
    const actor = actorOf(v);
    const [m] = await db.select().from(messages).where(eq(messages.id, messageId));
    if (!m || m.senderId !== v.user.id || m.deletedAt) throw notFound("Message introuvable");
    const access = await requireAccess(actor, m.conversationId);
    const imageKey = m.imageKey;
    await withTx(async (tx) => {
      await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, m.conversationId))
        .for("update");
      const [updated] = await tx
        .update(messages)
        .set({ deletedAt: now(), body: null, imageKey: null, imageWidth: null, imageHeight: null })
        .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
        .returning({ id: messages.id });
      if (!updated) throw notFound("Message introuvable");
      if (imageKey) await tx.delete(uploads).where(eq(uploads.key, imageKey));
      await refreshPreview(tx, m.conversationId);
    });
    if (imageKey) await storage.remove(imageKey).catch(() => undefined);
    publishToConversation(m.conversationId, access.readers, "message.deleted", { messageId });
    announce(
      m.conversationId,
      access.readers.map((r) => r.userId),
    );
  },

  /** `GET /conversations/:id/images/:nom` : image privée, aux seuls lecteurs de la conversation. */
  async image(v: Viewer, id: string, name: string): Promise<Buffer> {
    if (!/^[0-9a-f-]{36}\.webp$/.test(name)) throw notFound("Image introuvable");
    await requireAccess(actorOf(v), id);
    const [m] = await db
      .select({ key: messages.imageKey })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, id),
          eq(messages.imageKey, `private/messages/${name}`),
          isNull(messages.deletedAt),
          isNull(messages.moderatedAt),
        ),
      );
    const data = m?.key ? await storage.get(m.key) : null;
    if (!data) throw notFound("Image introuvable");
    return data;
  },

  /** Abonnement WebSocket à `conversation:{id}` : mêmes droits que la lecture. */
  async canSubscribe(userId: string, channel: string, secondFactor: string | null): Promise<boolean> {
    const id = channel.slice("conversation:".length);
    if (!/^[0-9a-f-]{36}$/.test(id)) return false;
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conversation) return false;
    const access = await resolveAccess(db, conversation, userId);
    if (!access) return false;
    return access.reader.side === "member" || twoFactorOk(secondFactor);
  },
};

/**
 * Date d'un nouveau message : jamais avant ni au même instant que le précédent de la conversation (verrou tenu), pour
 * un ordre strict des messages et des marqueurs de lecture.
 */
export function nextMessageAt(previous: Date | null): Date {
  const at = now();
  return previous && previous.getTime() >= at.getTime() ? new Date(previous.getTime() + 1) : at;
}

const senderOf = (v: Viewer) => ({
  userId: v.user.id,
  pseudo: v.profile.pseudo,
  avatarKey: v.profile.avatarKey,
  deletedAt: null,
});

/** Avance le marqueur de lecture (création de la ligne au besoin) ; vrai s'il a bougé. Jamais en arrière. */
async function markReadTx(tx: Tx, conversationId: string, userId: string, side: Reader["side"], messageId: string) {
  const role = side === "structure" ? "admin" : "member";
  const result = await tx.execute(sql`
    insert into conversation_participants
      (conversation_id, user_id, role, last_read_message_id, last_read_message_at, last_read_at)
    select ${conversationId}, ${userId}, ${role}, m.id, m.created_at, ${now()}
    from messages m where m.id = ${messageId} and m.conversation_id = ${conversationId}
    on conflict (conversation_id, user_id) do update set
      last_read_message_id = excluded.last_read_message_id,
      last_read_message_at = excluded.last_read_message_at,
      last_read_at = excluded.last_read_at,
      updated_at = now()
    where conversation_participants.last_read_message_at is null
      or (excluded.last_read_message_at, excluded.last_read_message_id)
        > (conversation_participants.last_read_message_at, conversation_participants.last_read_message_id)
    returning 1`);
  return result.rows.length > 0;
}

/**
 * Push `message_received` (S12) : au plus un par conversation et par 5 minutes tant qu'il reste du non lu, jamais
 * pendant une sourdine. La décision et l'horodatage se font dans une seule mise à jour conditionnelle (deux messages
 * simultanés ne déclenchent qu'un push). Heures calmes : celles de toutes les notifications.
 */
async function pushTo(tx: Tx, access: Access, row: MessageRow, v: Viewer, recipients: Reader[]) {
  const at = now();
  const since = new Date(at.getTime() - 5 * 60_000);
  const structureName = access.conversation.structureId
    ? (
        await tx
          .select({ name: structures.name })
          .from(structures)
          .where(eq(structures.id, access.conversation.structureId))
      )[0]?.name
    : null;
  const preview = messagePreview({ kind: row.kind, body: row.body, deleted: false }, PUSH_PREVIEW_MAX);
  for (const r of recipients) {
    const [claimed] = await tx
      .update(conversationParticipants)
      .set({ lastPushAt: at })
      .where(
        and(
          eq(conversationParticipants.conversationId, row.conversationId),
          eq(conversationParticipants.userId, r.userId),
          sql`(${conversationParticipants.mutedUntil} is null or ${conversationParticipants.mutedUntil} <= ${at})`,
          sql`(${conversationParticipants.lastPushAt} is null or ${conversationParticipants.lastPushAt} <= ${since}
            or ${conversationParticipants.lastReadAt} >= ${conversationParticipants.lastPushAt})`,
        ),
      )
      .returning({ userId: conversationParticipants.userId });
    if (!claimed) continue;
    // Message de la structure : « MéditeSportCar » ; message à la structure : « Kenji · MéditeSportCar ».
    const title =
      row.asStructure && structureName
        ? structureName
        : r.side === "structure" && structureName
          ? `${v.profile.pseudo} · ${structureName}`
          : v.profile.pseudo;
    await notificationsService.notify(tx, r.userId, "message_received", {
      title,
      body: `${v.profile.pseudo} : ${preview}`,
      inJournal: false,
      data: {
        conversationId: row.conversationId,
        actor: { userId: v.user.id, pseudo: v.profile.pseudo, avatarUrl: storage.url(v.profile.avatarKey) },
        link: `/app/boite/${row.conversationId}`,
      },
      link: { label: "Ouvrir la conversation", path: `/app/boite/${row.conversationId}` },
    });
  }
}

export { imageNameOf };
