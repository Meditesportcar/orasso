// Demandes de contact (lot 18, docs/01 « Social » ; lot R6b : D37) : on n'écrit pas librement à quelqu'un qui ne nous
// suit pas ; le message part en demande de contact, rangée à part, et **une seule demande est possible** (ligne unique par sens,
// jamais supprimée par son auteur : pas de harcèlement par suppression puis nouvelle demande). Le refus est
// silencieux (l'auteur voit toujours « Demande envoyée »). Une demande acceptée ouvre la conversation, sans abonnement
// (S11), avec le message comme premier message.
import {
  CONTACT_REQUESTS_PER_DAY,
  type ContactAcceptResult,
  type ContactRequestCreate,
  type ContactRequestResult,
  type ContactRequestView,
  directKey,
  MESSAGE_PREVIEW_MAX,
  messagePreview,
  shorten,
} from "@orasso/shared";
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { contactRequests, conversations, messages, notifications, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { profilesRepo } from "../profiles/repo";
import { rulesOf } from "./access";
import { canTalkDirect } from "./access/direct";
import { actorOf, ensureParticipant, publishToConversation, serializeMessage } from "./core";
import { inboxService } from "./inbox";
import { nextMessageAt } from "./service";

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

/** Sérialise les demandes d'une même paire (deux demandes croisées simultanées). */
async function lockPair(tx: Tx, a: string, b: string) {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`contact:${lo}:${hi}`}))`);
}

async function closeNotification(tx: Tx, userId: string, requestId: string) {
  await tx
    .update(notifications)
    .set({ readAt: now() })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "contact_request"),
        sql`${notifications.data} ->> 'contactRequestId' = ${requestId}`,
        sql`${notifications.readAt} is null`,
      ),
    );
}

export const contactsService = {
  /**
   * `POST /contact-requests {pseudo, message}` → `201` ; `409 use_direct` (la personne me suit, ou conversation déjà
   * ouverte et permise : écrire directement), `409 contact_request_exists` (déjà demandé, dans un sens ou dans
   * l'autre) ; 10 demandes par jour comptées en base.
   */
  async create(v: Viewer, input: ContactRequestCreate): Promise<ContactRequestResult> {
    if (actorOf(v).suspended) throw forbidden("Ton compte est suspendu : lecture seule.");
    const target = await profilesRepo.byPseudo(input.pseudo);
    if (!target || target.deletedAt || (target.suspendedUntil && target.suspendedUntil > now())) {
      throw notFound("Profil introuvable");
    }
    if (target.userId === v.user.id) throw validation("C'est ton propre compte.");
    const me = v.user.id;
    const [today] = await db
      .select({ n: count() })
      .from(contactRequests)
      .where(
        and(eq(contactRequests.fromUserId, me), gt(contactRequests.createdAt, new Date(now().getTime() - 86_400_000))),
      );
    if ((today?.n ?? 0) >= CONTACT_REQUESTS_PER_DAY) {
      throw new AppError(429, "rate_limited", "Trop de demandes de contact aujourd'hui : réessaie demain.", {
        retryAfter: 86_400,
      });
    }
    const id = await withTx(async (tx, after) => {
      await lockPair(tx, me, target.userId);
      const [conversation] = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.directKey, directKey(me, target.userId)));
      if (await canTalkDirect(tx, me, target.userId, conversation?.id)) {
        throw conflict("use_direct", "Tu peux déjà lui écrire directement.", {
          conversationId: conversation?.id ?? null,
        });
      }
      const existing = await tx
        .select({ id: contactRequests.id, from: contactRequests.fromUserId, status: contactRequests.status })
        .from(contactRequests)
        .where(
          sql`(${contactRequests.fromUserId} = ${me} and ${contactRequests.toUserId} = ${target.userId})
            or (${contactRequests.fromUserId} = ${target.userId} and ${contactRequests.toUserId} = ${me})`,
        );
      if (existing.some((r) => r.from === me)) {
        throw conflict("contact_request_exists", "Une seule demande de contact est possible.");
      }
      const incoming = existing.find((r) => r.from === target.userId && r.status === "pending");
      if (incoming) {
        throw conflict(
          "contact_request_exists",
          "Cette personne t'a déjà envoyé une demande : réponds-y dans ta Boîte.",
          {
            incomingId: incoming.id,
          },
        );
      }
      const [created] = await tx
        .insert(contactRequests)
        .values({ fromUserId: me, toUserId: target.userId, message: input.message, createdAt: now() })
        .returning({ id: contactRequests.id });
      if (!created) throw new Error("Demande de contact non enregistrée");
      await notificationsService.notify(tx, target.userId, "contact_request", {
        title: "Demande de contact",
        body: `${v.profile.pseudo} veut t'écrire.`,
        data: {
          contactRequestId: created.id,
          actor: { userId: me, pseudo: v.profile.pseudo, avatarUrl: storage.url(v.profile.avatarKey) },
          link: "/app/boite/demandes",
        },
        link: { label: "Voir la demande", path: "/app/boite/demandes" },
      });
      after(() => notificationsService.kick());
      after(() => inboxService.publish(target.userId));
      return created.id;
    }).catch((error) => {
      if (isUniqueViolation(error))
        throw conflict("contact_request_exists", "Une seule demande de contact est possible.");
      throw error;
    });
    return { id, pseudo: target.pseudo };
  },

  /**
   * `GET /me/contact-requests?direction=in|out`. Reçues : en attente, d'expéditeurs ni supprimés ni suspendus.
   * Envoyées : en attente ou refusées (le refus est silencieux : toutes affichées « Demande envoyée »).
   */
  async list(v: Viewer, direction: "in" | "out" | undefined): Promise<{ items: ContactRequestView[] }> {
    const me = v.user.id;
    const out: ContactRequestView[] = [];
    for (const dir of direction ? [direction] : (["in", "out"] as const)) {
      const rows = await db
        .select({ request: contactRequests, person: profiles })
        .from(contactRequests)
        .innerJoin(profiles, eq(profiles.userId, dir === "in" ? contactRequests.fromUserId : contactRequests.toUserId))
        .where(
          and(
            eq(dir === "in" ? contactRequests.toUserId : contactRequests.fromUserId, me),
            dir === "in"
              ? eq(contactRequests.status, "pending")
              : inArray(contactRequests.status, ["pending", "declined"]),
            sql`${profiles.deletedAt} is null`,
            sql`(${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${now()})`,
          ),
        )
        .orderBy(desc(contactRequests.createdAt));
      for (const { request, person } of rows) {
        out.push({
          id: request.id,
          direction: dir,
          message: request.message,
          createdAt: request.createdAt.toISOString(),
          person: {
            userId: person.userId,
            pseudo: person.pseudo,
            avatarUrl: storage.url(person.avatarKey),
            grade: person.grade,
          },
        });
      }
    }
    return { items: out };
  },

  /** Accepter : conversation à deux (existante ou créée) avec le message de la demande en premier message. */
  async accept(v: Viewer, id: string): Promise<ContactAcceptResult> {
    const me = v.user.id;
    const [request] = await db.select().from(contactRequests).where(eq(contactRequests.id, id));
    if (!request || request.toUserId !== me) throw notFound("Demande introuvable");
    if (actorOf(v).suspended) throw forbidden("Ton compte est suspendu : lecture seule.");
    const from = await profilesRepo.byUserId(request.fromUserId);
    if (!from || from.deletedAt) throw notFound("Demande introuvable");
    const { conversationId, first, readers } = await withTx(async (tx, after) => {
      await lockPair(tx, me, request.fromUserId);
      const [row] = await tx.select().from(contactRequests).where(eq(contactRequests.id, id)).for("update");
      if (!row || row.toUserId !== me) throw notFound("Demande introuvable");
      if (row.status !== "pending") throw conflict("conflict", "Cette demande a déjà été traitée");
      const key = directKey(me, row.fromUserId);
      const [inserted] = await tx
        .insert(conversations)
        .values({ kind: "direct", directKey: key, createdBy: row.fromUserId })
        .onConflictDoNothing({ target: conversations.directKey })
        .returning();
      const conversation =
        inserted ?? (await tx.select().from(conversations).where(eq(conversations.directKey, key)))[0];
      if (!conversation) throw new Error("Conversation introuvable");
      const [locked] = await tx
        .select({ lastMessageAt: conversations.lastMessageAt })
        .from(conversations)
        .where(eq(conversations.id, conversation.id))
        .for("update");
      await ensureParticipant(tx, conversation.id, me, "member");
      await ensureParticipant(tx, conversation.id, row.fromUserId, "member");
      const at = nextMessageAt(locked?.lastMessageAt ?? null);
      const [message] = await tx
        .insert(messages)
        .values({
          conversationId: conversation.id,
          senderId: row.fromUserId,
          kind: "text",
          body: row.message,
          createdAt: at,
        })
        .returning();
      await tx
        .update(conversations)
        .set({
          lastMessageAt: at,
          lastMessagePreview: shorten(
            messagePreview({ kind: "text", body: row.message, deleted: false }),
            MESSAGE_PREVIEW_MAX,
          ),
          messagesCount: sql`${conversations.messagesCount} + 1`,
        })
        .where(eq(conversations.id, conversation.id));
      await tx
        .update(contactRequests)
        .set({ status: "accepted", respondedAt: at, conversationId: conversation.id })
        .where(eq(contactRequests.id, id));
      await closeNotification(tx, me, id);
      const rules = rulesOf("direct");
      const readers = rules ? await rules.readers(tx, conversation) : [];
      after(() => {
        inboxService.publish(me);
        inboxService.publish(row.fromUserId);
      });
      return { conversationId: conversation.id, first: message, readers };
    });
    if (first) {
      publishToConversation(conversationId, readers, "message.new", {
        message: serializeMessage(
          first,
          { userId: from.userId, pseudo: from.pseudo, avatarKey: from.avatarKey, deletedAt: null },
          null,
        ),
      });
    }
    return { conversationId };
  },

  /** Refuser : silencieux pour l'auteur ; la demande reste (une seule demande, pour toujours). */
  async decline(v: Viewer, id: string) {
    await withTx(async (tx, after) => {
      const [row] = await tx.select().from(contactRequests).where(eq(contactRequests.id, id)).for("update");
      if (!row || row.toUserId !== v.user.id) throw notFound("Demande introuvable");
      if (row.status !== "pending") throw conflict("conflict", "Cette demande a déjà été traitée");
      await tx
        .update(contactRequests)
        .set({ status: "declined", respondedAt: now() })
        .where(eq(contactRequests.id, id));
      await closeNotification(tx, v.user.id, id);
      after(() => inboxService.publish(v.user.id));
    });
  },
};
