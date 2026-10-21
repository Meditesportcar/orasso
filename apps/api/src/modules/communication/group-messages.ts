// Messages groupés (lot 20, S20, ARCHITECTURE-SUITE § 5.2) : un envoi = une ligne `group_messages` et ses destinataires
// figés, puis un message par destinataire dans sa conversation `organizer` avec la structure (créée au besoin), écrit
// au nom de la structure par la tâche `messaging.group-send`, par lots de 500. Les réponses arrivent dans les
// conversations individuelles ; l'organisateur voit « 118 destinataires · 64 ont lu ». Anti-abus en base : 20 envois
// par structure et par jour, 4 aux abonnés par 30 jours (S18), idempotence par `clientId`. Jamais d'e-mail : le
// destinataire reçoit le push « message reçu » dédoublonné comme un message normal (S12), puis lit dans sa Boîte.
import {
  afterEventLabels,
  FOLLOWER_QUOTA_DEFAULT,
  FOLLOWER_QUOTA_WINDOW_MS,
  type FollowerQuota,
  followerQuotaRemaining,
  followerQuotaResetsAt,
  GROUP_MESSAGE_BODY_MAX,
  GROUP_MESSAGE_MAX_RECIPIENTS,
  GROUP_MESSAGES_PER_DAY,
  GROUP_SEND_BATCH,
  type GroupMessageCreate,
  type GroupMessageCreated,
  type GroupMessagePreview,
  type GroupMessageView,
  MESSAGE_PREVIEW_MAX,
  type MessageSegment,
  type MessagingQuota,
  messagePreview,
  organizerKey,
  PUSH_PREVIEW_MAX,
  renderTemplate,
  reviewLink,
  segmentNeedsEvent,
  segmentReachable,
  shorten,
} from "@orasso/shared";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  checkins,
  conversationParticipants,
  conversations,
  events,
  groupMessageRecipients,
  groupMessages,
  messages,
  messageTemplates,
  profiles,
  structureBans,
  structures,
} from "../../db/schema";
import { env } from "../../env";
import { deps, now } from "../../lib/deps";
import { AppError, conflict, notFound, validation } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { type EventRow, eventsRepo } from "../events/repo";
import { ensureParticipant, publishToConversation, serializeMessage } from "../messaging/core";
import { inboxService } from "../messaging/inbox";
import { nextMessageAt } from "../messaging/service";
import { notificationsService } from "../notifications/service";
import { requireStructureReader, requireStructureSpeaker, type StructureRow } from "./guards";
import { segmentRecipients } from "./segments";

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

/** Pseudo le plus long accepté (schéma du profil) : pire cas du remplacement de `{{pseudo}}`. */
const PSEUDO_MAX = 24;

const quotaOf = (s: Pick<StructureRow, "followerMessageQuota">) => s.followerMessageQuota ?? FOLLOWER_QUOTA_DEFAULT;

/** Événement de la structure (404 pour celui d'une autre structure : aucune fuite). */
async function eventOfStructure(
  structureId: string,
  eventId: string | null | undefined,
  segment: MessageSegment,
): Promise<EventRow | null> {
  if (!eventId) return null;
  const e = await eventsRepo.byId(eventId).catch(() => null);
  if (!e || e.structureId !== structureId || e.status === "draft") throw notFound("Événement introuvable");
  // S10 (relecture du lot 20) : les inscrits d'un événement fini depuis plus de 7 jours ne sont plus joignables en
  // groupe — sinon la limite d'envoi aux abonnés se contournerait par les inscrits des événements passés.
  if (segmentNeedsEvent(segment) && !segmentReachable(e, now())) {
    throw conflict(
      "conflict",
      "Cet événement est fini depuis plus de 7 jours : ses inscrits ne sont plus joignables par un message groupé.",
    );
  }
  return e;
}

async function followerQuota(ex: Executor, s: StructureRow): Promise<FollowerQuota> {
  const at = now();
  const rows = await ex
    .select({ createdAt: groupMessages.createdAt })
    .from(groupMessages)
    .where(
      and(
        eq(groupMessages.structureId, s.id),
        eq(groupMessages.segment, "followers"),
        gt(groupMessages.createdAt, new Date(at.getTime() - FOLLOWER_QUOTA_WINDOW_MS)),
      ),
    );
  const dates = rows.map((r) => r.createdAt);
  const quota = quotaOf(s);
  const remaining = followerQuotaRemaining(dates, at, quota);
  return {
    quota,
    used: dates.length,
    remaining,
    resetsAt: followerQuotaResetsAt(dates, at, quota)?.toISOString() ?? null,
  };
}

async function dailyRemaining(ex: Executor, structureId: string): Promise<number> {
  const [row] = await ex
    .select({ n: sql<number>`count(*)::int` })
    .from(groupMessages)
    .where(
      and(
        eq(groupMessages.structureId, structureId),
        gt(groupMessages.createdAt, new Date(now().getTime() - 86_400_000)),
      ),
    );
  return Math.max(0, GROUP_MESSAGES_PER_DAY - (row?.n ?? 0));
}

async function quotaView(ex: Executor, s: StructureRow): Promise<MessagingQuota> {
  return { followers: await followerQuota(ex, s), dailyRemaining: await dailyRemaining(ex, s.id) };
}

/** « N ont lu » : destinataires dont le marqueur de lecture couvre leur message (calcul en base). */
async function readCount(ex: Executor, groupMessageId: string): Promise<number> {
  const result = await ex.execute(sql`
    select count(*)::int as n from group_message_recipients r
    join messages m on m.id = r.message_id
    join conversation_participants p on p.conversation_id = m.conversation_id and p.user_id = r.user_id
    where r.group_message_id = ${groupMessageId}
      and p.last_read_message_at is not null
      and (p.last_read_message_at, p.last_read_message_id) >= (m.created_at, m.id)`);
  return Number((result.rows[0] as { n?: number } | undefined)?.n ?? 0);
}

async function view(ex: Executor, gm: typeof groupMessages.$inferSelect): Promise<GroupMessageView> {
  const [event] = gm.eventId
    ? await ex.select({ id: events.id, title: events.title }).from(events).where(eq(events.id, gm.eventId))
    : [];
  const [author] = gm.authorId
    ? await ex
        .select({ pseudo: profiles.pseudo, deletedAt: profiles.deletedAt })
        .from(profiles)
        .where(eq(profiles.userId, gm.authorId))
    : [];
  return {
    id: gm.id,
    segment: gm.segment,
    event: event ?? null,
    subject: gm.subject,
    body: gm.body,
    status: gm.status,
    recipientsCount: gm.recipientsCount,
    sentCount: gm.sentCount,
    readCount: await readCount(ex, gm.id),
    authorPseudo: author && !author.deletedAt ? author.pseudo : null,
    createdAt: gm.createdAt.toISOString(),
    sentAt: gm.sentAt?.toISOString() ?? null,
  };
}

export const groupMessagesService = {
  /** `GET /structures/:id/messaging/quota`. */
  async quota(v: Viewer, structureId: string): Promise<MessagingQuota> {
    const s = await requireStructureReader(v, structureId);
    return quotaView(db, s);
  },

  /** `GET /structures/:id/group-messages/preview?segment&eventId` : nombre de destinataires et quota restant. */
  async preview(
    v: Viewer,
    structureId: string,
    q: { segment: MessageSegment; eventId?: string },
  ): Promise<GroupMessagePreview> {
    const s = await requireStructureSpeaker(v, structureId);
    const event = await eventOfStructure(s.id, q.eventId, q.segment);
    const ids = await segmentRecipients(db, {
      segment: q.segment,
      structureId: s.id,
      event,
      authorId: v.user.id,
      limit: GROUP_MESSAGE_MAX_RECIPIENTS + 1,
    });
    return { recipientsCount: ids.length, quota: await quotaView(db, s) };
  },

  /**
   * `POST /structures/:id/group-messages` → `202 {groupMessageId}` : destinataires figés sous le verrou de la
   * structure (quotas sans course), envoi en tâche. Même `clientId` = même envoi (`200`, rien de renvoyé).
   */
  async create(
    v: Viewer,
    structureId: string,
    input: GroupMessageCreate,
    /** Lot 27 : remerciement aux présents (`events.thanks_sent_at` posé dans la même transaction, une seule fois). */
    opts: { thanks?: boolean } = {},
  ): Promise<GroupMessageCreated> {
    const s = await requireStructureSpeaker(v, structureId);
    const replay = async () => {
      const [existing] = await db
        .select()
        .from(groupMessages)
        .where(and(eq(groupMessages.structureId, s.id), eq(groupMessages.clientId, input.clientId)));
      return existing
        ? { groupMessageId: existing.id, recipientsCount: existing.recipientsCount, created: false }
        : null;
    };
    const seen = await replay();
    if (seen) return seen;
    const event = await eventOfStructure(s.id, input.eventId, input.segment);
    // Le texte d'un destinataire (variables remplacées, `{{pseudo}}` au plus long) doit tenir dans un message.
    const longest = composeBody({ subject: input.subject, body: input.body } as typeof groupMessages.$inferSelect, {
      event,
      structureName: s.name,
      pseudo: "x".repeat(PSEUDO_MAX),
      reviewLink: reviewLink(env.PUBLIC_URL, "x".repeat(36)),
    });
    if (longest.length > GROUP_MESSAGE_BODY_MAX) {
      throw validation(
        `Message trop long une fois les variables remplacées (${longest.length} caractères pour ${GROUP_MESSAGE_BODY_MAX} au plus) : raccourcis-le.`,
      );
    }
    if (input.templateId) {
      const [t] = await db
        .select({ id: messageTemplates.id })
        .from(messageTemplates)
        .where(
          and(
            eq(messageTemplates.id, input.templateId),
            or(isNull(messageTemplates.structureId), eq(messageTemplates.structureId, s.id)),
          ),
        );
      if (!t) throw notFound("Modèle introuvable");
    }
    try {
      return await withTx(async (tx, after) => {
        // Verrou de la structure : quotas et idempotence sans course entre deux envois simultanés.
        const [locked] = await tx.select().from(structures).where(eq(structures.id, s.id)).for("update");
        if (!locked) throw notFound("Structure introuvable");
        const [again] = await tx
          .select()
          .from(groupMessages)
          .where(and(eq(groupMessages.structureId, s.id), eq(groupMessages.clientId, input.clientId)));
        if (again) return { groupMessageId: again.id, recipientsCount: again.recipientsCount, created: false };
        if ((await dailyRemaining(tx, s.id)) <= 0) {
          throw new AppError(429, "rate_limited", "Trop de messages groupés aujourd'hui : réessaie demain.", {
            retryAfter: 86_400,
          });
        }
        if (input.segment === "followers") {
          const quota = await followerQuota(tx, locked);
          if (quota.remaining <= 0) {
            throw new AppError(
              429,
              "follower_quota_exceeded",
              `Limite d'envoi aux abonnés atteinte (${quota.quota} par 30 jours).`,
              { quota: quota.quota, resetsAt: quota.resetsAt },
            );
          }
        }
        const ids = await segmentRecipients(tx, {
          segment: input.segment,
          structureId: s.id,
          event,
          authorId: v.user.id,
          limit: GROUP_MESSAGE_MAX_RECIPIENTS + 1,
        });
        if (ids.length === 0) throw validation("Aucun destinataire dans ce segment.");
        if (ids.length > GROUP_MESSAGE_MAX_RECIPIENTS) {
          throw validation(`Plus de ${GROUP_MESSAGE_MAX_RECIPIENTS} destinataires : choisis un segment plus petit.`);
        }
        const [gm] = await tx
          .insert(groupMessages)
          .values({
            structureId: s.id,
            eventId: event?.id ?? null,
            authorId: v.user.id,
            segment: input.segment,
            templateId: input.templateId ?? null,
            subject: input.subject,
            body: input.body,
            clientId: input.clientId,
            thanks: Boolean(opts.thanks),
            recipientsCount: ids.length,
            createdAt: now(),
          })
          .returning();
        if (!gm) throw new Error("Message groupé non enregistré");
        if (opts.thanks && event) {
          // Écriture conditionnelle : le premier remerciement pose la date, tout autre est refusé (et annulé).
          const [marked] = await tx
            .update(events)
            .set({ thanksSentAt: now() })
            .where(and(eq(events.id, event.id), isNull(events.thanksSentAt)))
            .returning({ id: events.id });
          if (!marked) throw conflict("conflict", "Le remerciement est déjà parti.", { reason: "sent" });
        }
        for (let i = 0; i < ids.length; i += 1000) {
          await tx
            .insert(groupMessageRecipients)
            .values(ids.slice(i, i + 1000).map((userId) => ({ groupMessageId: gm.id, userId })))
            .onConflictDoNothing();
        }
        after(() => deps.jobs.send("messaging.group-send", { groupMessageId: gm.id }));
        return { groupMessageId: gm.id, recipientsCount: ids.length, created: true };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await replay();
        if (existing) return existing;
      }
      throw error;
    }
  },

  /** `GET /structures/:id/group-messages` : historique (les plus récents d'abord), avec les lectures. */
  async list(v: Viewer, structureId: string): Promise<{ items: GroupMessageView[] }> {
    const s = await requireStructureReader(v, structureId);
    const rows = await db
      .select()
      .from(groupMessages)
      .where(eq(groupMessages.structureId, s.id))
      .orderBy(desc(groupMessages.createdAt))
      .limit(50);
    const items: GroupMessageView[] = [];
    for (const r of rows) items.push(await view(db, r));
    return { items };
  },

  /** `GET /group-messages/:id` : un envoi, avec `recipientsCount` et `readCount` (organisateurs de sa structure). */
  async get(v: Viewer, id: string): Promise<GroupMessageView> {
    const [gm] = await db.select().from(groupMessages).where(eq(groupMessages.id, id));
    if (!gm) throw notFound("Message introuvable");
    await requireStructureReader(v, gm.structureId).catch(() => {
      throw notFound("Message introuvable");
    });
    return view(db, gm);
  },

  /**
   * Un lot de la tâche `messaging.group-send` (500 destinataires au plus, réservés `FOR UPDATE SKIP LOCKED`) ; rend le
   * nombre de destinataires qui restent. Reprise sans doublon : le message d'un destinataire a pour `client_id`
   * l'identifiant du message groupé (unique par conversation), et sa ligne est marquée envoyée dans la même
   * transaction.
   */
  async sendBatch(groupMessageId: string, size = GROUP_SEND_BATCH): Promise<number> {
    return withTx(async (tx, after) => {
      const [gm] = await tx.select().from(groupMessages).where(eq(groupMessages.id, groupMessageId));
      if (!gm || gm.status === "sent") return 0;
      const [s] = await tx.select().from(structures).where(eq(structures.id, gm.structureId));
      const batch = await tx
        .select()
        .from(groupMessageRecipients)
        .where(and(eq(groupMessageRecipients.groupMessageId, gm.id), isNull(groupMessageRecipients.sentAt)))
        .orderBy(groupMessageRecipients.userId)
        .limit(size)
        .for("update", { skipLocked: true });
      // Structure supprimée ou suspendue entre-temps : plus rien ne part, l'envoi est clos.
      const stop = !s || s.deletedAt || s.verification === "suspended";
      if (!batch.length && !stop) {
        // Lot vide : peut-être que des lignes sont réservées par un autre passage (SKIP LOCKED) ; on ne clôt que s'il
        // ne reste vraiment rien à envoyer (relecture du lot 20).
        const [left] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(groupMessageRecipients)
          .where(and(eq(groupMessageRecipients.groupMessageId, gm.id), isNull(groupMessageRecipients.sentAt)));
        if ((left?.n ?? 0) > 0) return left?.n ?? 0;
      }
      if (!batch.length || stop) {
        await tx.update(groupMessages).set({ status: "sent", sentAt: now() }).where(eq(groupMessages.id, gm.id));
        return 0;
      }
      await tx.update(groupMessages).set({ status: "sending" }).where(eq(groupMessages.id, gm.id));
      const event = gm.eventId ? ((await tx.select().from(events).where(eq(events.id, gm.eventId)))[0] ?? null) : null;
      const author = gm.authorId
        ? ((
            await tx
              .select({
                userId: profiles.userId,
                pseudo: profiles.pseudo,
                avatarKey: profiles.avatarKey,
                deletedAt: profiles.deletedAt,
              })
              .from(profiles)
              .where(eq(profiles.userId, gm.authorId))
          )[0] ?? null)
        : null;
      const recipients = await tx
        .select({
          userId: profiles.userId,
          pseudo: profiles.pseudo,
          deletedAt: profiles.deletedAt,
          suspendedUntil: profiles.suspendedUntil,
        })
        .from(profiles)
        .where(
          inArray(
            profiles.userId,
            batch.map((b) => b.userId),
          ),
        );
      const byId = new Map(recipients.map((r) => [r.userId, r]));
      // Lien d'avis (lot 27, § 11.2) : propre à chaque destinataire, celui de sa candidature pointée (véhicule).
      const reviewApp = new Map<string, string>();
      if (event) {
        const entered = await tx
          .select({ userId: applications.userId, applicationId: applications.id })
          .from(checkins)
          .innerJoin(applications, eq(applications.id, checkins.applicationId))
          .where(
            and(
              eq(checkins.eventId, event.id),
              eq(applications.kind, "vehicle"),
              inArray(
                applications.userId,
                batch.map((b) => b.userId),
              ),
            ),
          )
          .orderBy(asc(checkins.checkedInAt), asc(applications.id));
        for (const row of entered) if (!reviewApp.has(row.userId)) reviewApp.set(row.userId, row.applicationId);
      }
      // Bannis de la structure depuis la création de l'envoi (reprise tardive) : sautés.
      const banned = new Set(
        (
          await tx
            .select({ userId: structureBans.userId })
            .from(structureBans)
            .where(
              and(
                eq(structureBans.structureId, gm.structureId),
                inArray(
                  structureBans.userId,
                  batch.map((b) => b.userId),
                ),
              ),
            )
        ).map((b) => b.userId),
      );
      const at = now();
      let sent = 0;
      const published: { conversationId: string; userId: string; row: typeof messages.$inferSelect }[] = [];
      for (const r of batch) {
        const person = byId.get(r.userId);
        // Compte supprimé ou suspendu depuis l'envoi : sauté (ligne close, aucun message).
        if (
          !person ||
          person.deletedAt ||
          (person.suspendedUntil && person.suspendedUntil > at) ||
          banned.has(r.userId)
        ) {
          await markDone(tx, gm.id, r.userId, null, null);
          continue;
        }
        const conversation = await organizerConversation(tx, gm.structureId, r.userId, gm.authorId);
        if (conversation.closedAt && conversation.closedAt <= at) {
          await markDone(tx, gm.id, r.userId, conversation.id, null);
          continue;
        }
        // Longueur contrôlée à la création (pire cas du pseudo) : la coupe n'est qu'une garde.
        const applicationId = reviewApp.get(r.userId) ?? null;
        const body = composeBody(gm, {
          event,
          structureName: s.name,
          pseudo: person.pseudo,
          reviewLink: event
            ? applicationId
              ? reviewLink(env.PUBLIC_URL, applicationId)
              : `${env.PUBLIC_URL}/e/${event.slug}`
            : null,
        }).slice(0, GROUP_MESSAGE_BODY_MAX);
        const { row, created } = await insertGroupMessage(tx, conversation.id, gm, body);
        await markDone(tx, gm.id, r.userId, conversation.id, row.id);
        if (created) {
          await pushGroupMessage(tx, conversation.id, r.userId, s.name, body, author);
          published.push({ conversationId: conversation.id, userId: r.userId, row });
          // Remerciement (lot 27) : une ligne du Journal avec le lien d'avis, en plus du message de la Boîte.
          if (gm.thanks && event) {
            await notificationsService.notify(tx, r.userId, "event_thanks", {
              title: afterEventLabels.thanksJournalTitle(event.title),
              body: afterEventLabels.thanksJournalBody,
              eventId: event.id,
              data: { eventId: event.id, ...(applicationId ? { applicationId } : {}) },
              link: {
                label: afterEventLabels.thanksJournalAction,
                path: applicationId ? `/app/sorties?avis=${applicationId}` : `/e/${event.slug}`,
              },
            });
          }
        }
        sent += 1;
      }
      await tx
        .update(groupMessages)
        .set({ sentCount: sql`${groupMessages.sentCount} + ${sent}` })
        .where(eq(groupMessages.id, gm.id));
      const [left] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(groupMessageRecipients)
        .where(and(eq(groupMessageRecipients.groupMessageId, gm.id), isNull(groupMessageRecipients.sentAt)));
      const remaining = left?.n ?? 0;
      if (remaining === 0) {
        await tx.update(groupMessages).set({ status: "sent", sentAt: now() }).where(eq(groupMessages.id, gm.id));
      }
      after(() => {
        notificationsService.kick();
        for (const p of published) {
          publishToConversation(p.conversationId, [{ userId: p.userId, side: "member" }], "message.new", {
            message: serializeMessage(p.row, author, null),
          });
          realtime.publish(`user:${p.userId}`, "conversation.updated", { conversationId: p.conversationId });
          inboxService.publish(p.userId);
        }
      });
      if (remaining > 0) after(() => deps.jobs.send("messaging.group-send", { groupMessageId: gm.id }));
      return remaining;
    });
  },

  /**
   * Tâche de secours `messaging.group-sweep` (chaque minute, relecture du lot 20) : un envoi resté `queued` ou
   * `sending` sans mouvement depuis 2 minutes (lot suivant jamais planifié : pg-boss coupé, redémarrage, reprises
   * épuisées) repart d'un lot ; le lot se replanifie ensuite lui-même. Sans doublon (voir `sendBatch`).
   */
  async sweep(): Promise<number> {
    const stale = await db
      .select({ id: groupMessages.id })
      .from(groupMessages)
      .where(
        and(
          inArray(groupMessages.status, ["queued", "sending"]),
          // Horloge de la base : `updated_at` est posé par l'écriture elle-même.
          sql`${groupMessages.updatedAt} < now() - interval '2 minutes'`,
        ),
      )
      .limit(20);
    for (const { id } of stale) await this.sendBatch(id);
    return stale.length;
  },

  /** Envoie tout, lot après lot (scripts, seed, tests). */
  async drain(groupMessageId: string): Promise<void> {
    for (let i = 0; i < 100; i += 1) if ((await this.sendBatch(groupMessageId)) === 0) return;
  },
};

/** Texte d'un destinataire : objet en tête, variables du modèle remplacées (`{{pseudo}}` : le sien). */
function composeBody(
  gm: typeof groupMessages.$inferSelect,
  ctx: { event: EventRow | null; structureName: string; pseudo: string; reviewLink: string | null },
): string {
  const text = renderTemplate(gm.body, {
    pseudo: ctx.pseudo,
    "structure.name": ctx.structureName,
    "event.title": ctx.event?.title ?? null,
    "event.date": ctx.event ? formatDateTime(ctx.event.startsAt) : null,
    "event.city": ctx.event?.city ?? null,
    review_link: ctx.reviewLink,
  });
  return gm.subject ? `${gm.subject}\n\n${text}` : text;
}

/** Conversation `organizer` de la personne avec la structure (créée au besoin, une seule ligne en cas de course). */
async function organizerConversation(tx: Tx, structureId: string, userId: string, authorId: string | null) {
  const key = organizerKey(structureId, userId);
  const [inserted] = await tx
    .insert(conversations)
    .values({ kind: "organizer", structureId, directKey: key, createdBy: authorId })
    .onConflictDoNothing({ target: conversations.directKey })
    .returning();
  const conversation =
    inserted ?? (await tx.select().from(conversations).where(eq(conversations.directKey, key)))[0] ?? null;
  if (!conversation) throw new Error("Conversation introuvable après conflit");
  await ensureParticipant(tx, conversation.id, userId, "member");
  return conversation;
}

/** Écrit le message (au nom de la structure) sous le verrou de la conversation ; une seule fois par conversation. */
async function insertGroupMessage(tx: Tx, conversationId: string, gm: typeof groupMessages.$inferSelect, body: string) {
  const [locked] = await tx
    .select({ lastMessageAt: conversations.lastMessageAt })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .for("update");
  const at = nextMessageAt(locked?.lastMessageAt ?? null);
  const [row] = await tx
    .insert(messages)
    .values({
      conversationId,
      senderId: gm.authorId,
      kind: "text",
      body,
      clientId: gm.id,
      asStructure: true,
      groupMessageId: gm.id,
      createdAt: at,
    })
    .onConflictDoNothing({ target: [messages.conversationId, messages.clientId] })
    .returning();
  if (!row) {
    const [existing] = await tx
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.clientId, gm.id)));
    if (!existing) throw new Error("Message groupé introuvable après conflit");
    return { row: existing, created: false };
  }
  await tx
    .update(conversations)
    .set({
      lastMessageAt: at,
      lastMessagePreview: shorten(messagePreview({ kind: "text", body, deleted: false }), MESSAGE_PREVIEW_MAX),
      messagesCount: sql`${conversations.messagesCount} + 1`,
    })
    .where(eq(conversations.id, conversationId));
  return { row, created: true };
}

async function markDone(
  tx: Tx,
  groupMessageId: string,
  userId: string,
  conversationId: string | null,
  messageId: string | null,
) {
  await tx
    .update(groupMessageRecipients)
    .set({ conversationId, messageId, sentAt: now() })
    .where(and(eq(groupMessageRecipients.groupMessageId, groupMessageId), eq(groupMessageRecipients.userId, userId)));
}

/**
 * Push `message_received` (S12) : au plus un par conversation et par 5 minutes tant qu'il reste du non lu, jamais
 * pendant une sourdine ; heures calmes et préférences (« Nouveau message » coupé) appliquées à la livraison.
 */
async function pushGroupMessage(
  tx: Tx,
  conversationId: string,
  userId: string,
  structureName: string,
  body: string,
  author: { userId: string; pseudo: string; avatarKey: string | null; deletedAt: Date | null } | null,
) {
  const at = now();
  const since = new Date(at.getTime() - 5 * 60_000);
  const [claimed] = await tx
    .update(conversationParticipants)
    .set({ lastPushAt: at })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
        sql`(${conversationParticipants.mutedUntil} is null or ${conversationParticipants.mutedUntil} <= ${at})`,
        sql`(${conversationParticipants.lastPushAt} is null or ${conversationParticipants.lastPushAt} <= ${since}
          or ${conversationParticipants.lastReadAt} >= ${conversationParticipants.lastPushAt})`,
      ),
    )
    .returning({ userId: conversationParticipants.userId });
  if (!claimed) return;
  const preview = messagePreview({ kind: "text", body, deleted: false }, PUSH_PREVIEW_MAX);
  await notificationsService.notify(tx, userId, "message_received", {
    title: structureName,
    body: `${structureName} : ${preview}`,
    inJournal: false,
    data: {
      conversationId,
      actor:
        author && !author.deletedAt
          ? { userId: author.userId, pseudo: author.pseudo, avatarUrl: storage.url(author.avatarKey) }
          : undefined,
      link: `/app/boite/${conversationId}`,
    },
    link: { label: "Ouvrir la conversation", path: `/app/boite/${conversationId}` },
  });
}
