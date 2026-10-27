// Briques communes de la messagerie (lot 18) : accès recalculé à chaque appel, sérialisation des messages, diffusion
// WebSocket filtrée par les droits du moment.
import {
  type ConversationWriteBlock,
  MESSAGE_PREVIEW_MAX,
  type MessageAbout,
  type MessageView,
  messagePreview,
  shorten,
} from "@orasso/shared";
import { desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { conversationParticipants, conversations, events, messages, profiles, user } from "../../db/schema";
import { env } from "../../env";
import { now } from "../../lib/deps";
import { AppError, forbidden, notFound } from "../../lib/errors";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import type { Executor, Tx } from "../../lib/tx";
import { canSeeEvent, type SeeingUser } from "../invitations/access";
import { isSecondFactor } from "../security/passkey";
import { type ConversationRow, type KindRules, type Reader, rulesOf } from "./access";

export type MessageRow = typeof messages.$inferSelect;

/** Qui agit : la personne, la preuve de second facteur de sa session, sa suspension éventuelle. */
export type Actor = { userId: string; secondFactor: string | null; suspended: boolean };

export function actorOf(v: Viewer): Actor {
  return {
    userId: v.user.id,
    secondFactor: v.session?.secondFactor ?? null,
    suspended: Boolean(v.profile.suspendedUntil && v.profile.suspendedUntil > now()),
  };
}

/** Le côté structure d'une conversation est un espace organisateur : double authentification prouvée par la session. */
export const twoFactorOk = (secondFactor: string | null | undefined) =>
  env.DEV_SKIP_2FA || isSecondFactor(secondFactor);

export type Access = { conversation: ConversationRow; rules: KindRules; reader: Reader; readers: Reader[] };

/** Accès d'une personne à une conversation, ou `null` (pas lecteur, lecture expirée, sorte non livrée). */
export async function resolveAccess(
  ex: Executor,
  conversation: ConversationRow,
  userId: string,
): Promise<Access | null> {
  const rules = rulesOf(conversation.kind);
  if (!rules) return null;
  if (conversation.readableUntil && conversation.readableUntil <= now()) return null;
  const readers = await rules.readers(ex, conversation);
  const reader = readers.find((r) => r.userId === userId);
  return reader ? { conversation, rules, reader, readers } : null;
}

export async function loadConversation(id: string, ex: Executor = db): Promise<ConversationRow> {
  const [row] = await ex.select().from(conversations).where(eq(conversations.id, id));
  if (!row) throw notFound("Conversation introuvable");
  return row;
}

/**
 * Accès exigé : `403` pour qui n'est pas lecteur (aucun contenu, ni titre ni participants), `403 two_factor_required`
 * pour un organisateur dont la session n'a pas prouvé le second facteur.
 */
export async function requireAccess(actor: Actor, id: string, ex: Executor = db): Promise<Access> {
  const conversation = await loadConversation(id, ex);
  const access = await resolveAccess(ex, conversation, actor.userId);
  if (!access) throw forbidden("Tu ne participes pas à cette conversation");
  if (access.reader.side === "structure" && !twoFactorOk(actor.secondFactor)) {
    throw new AppError(403, "two_factor_required", "Double authentification obligatoire pour cet espace");
  }
  return access;
}

/** Pourquoi cette personne ne peut pas écrire ici (null : elle peut). */
export async function writeBlockOf(ex: Executor, actor: Actor, access: Access): Promise<ConversationWriteBlock | null> {
  if (access.conversation.closedAt && access.conversation.closedAt <= now()) return "closed";
  if (actor.suspended) return "suspended";
  if (access.reader.side === "structure" && !twoFactorOk(actor.secondFactor)) return "two_factor";
  return access.rules.writeBlock(ex, access.conversation, access.reader);
}

/** Erreur HTTP d'une écriture refusée. */
export function writeBlockError(block: ConversationWriteBlock): AppError {
  switch (block) {
    case "not_friends":
      return new AppError(409, "not_friends", "Cette personne ne te suit pas : envoie une demande de contact.");
    case "closed":
      return new AppError(403, "conversation_closed", "Cette conversation est fermée.");
    case "account_deleted":
      return new AppError(403, "conversation_closed", "Ce compte a été supprimé.");
    case "suspended":
      return forbidden("Ton compte est suspendu : lecture seule.");
    case "two_factor":
      return new AppError(403, "two_factor_required", "Double authentification obligatoire pour cet espace");
    case "structure_suspended":
      return forbidden("Cette structure est suspendue.");
  }
}

/** Ligne de participant (organisateur à son premier accès, ou premier message). */
export async function ensureParticipant(ex: Executor, conversationId: string, userId: string, side: Reader["side"]) {
  await ex
    .insert(conversationParticipants)
    .values({ conversationId, userId, role: side === "structure" ? "admin" : "member" })
    .onConflictDoNothing();
}

/** Le nom de fichier d'une image privée (dernier segment de la clé). */
export const imageNameOf = (key: string) => key.slice(key.lastIndexOf("/") + 1);

/** Le message est-il « de mon côté » (le mien, ou celui de ma structure) ? */
export const isMySide = (m: Pick<MessageRow, "senderId" | "asStructure">, reader: Reader) =>
  reader.side === "structure" ? m.asStructure : m.senderId === reader.userId;

type SenderProfile = { userId: string; pseudo: string; avatarKey: string | null; deletedAt: Date | null } | null;

/**
 * Lot M4 : les événements dont parlent des messages (« À propos de »), par identifiant, **tels que `reader` peut les
 * voir** (tour 2) : un événement privé sur invitation n'apparaît qu'à ses ayants droit (`canSeeEvent`) ; pour les
 * autres, l'étiquette est absente, sans rien de l'événement (ni titre, ni date, ni ville, ni lien).
 */
export async function aboutsOf(
  ex: Executor,
  rows: Pick<MessageRow, "aboutEventId">[],
  reader: SeeingUser,
): Promise<Map<string, MessageAbout>> {
  const ids = [...new Set(rows.map((r) => r.aboutEventId).filter((id): id is string => Boolean(id)))];
  const out = new Map<string, MessageAbout>();
  if (!ids.length) return out;
  const found = await ex
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      startsAt: events.startsAt,
      city: events.city,
      structureId: events.structureId,
      admission: events.admission,
      status: events.status,
    })
    .from(events)
    .where(inArray(events.id, ids));
  for (const e of found) {
    if (e.status === "draft" || !(await canSeeEvent(e, reader, ex))) continue;
    out.set(e.id, { eventId: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt.toISOString(), city: e.city });
  }
  return out;
}

/** Les lecteurs d'une conversation tels que `canSeeEvent` les attend (compte et adresse confirmée). */
export async function seeingUsersOf(ex: Executor, readers: Reader[]): Promise<Map<string, SeeingUser>> {
  const ids = [...new Set(readers.map((r) => r.userId))];
  if (!ids.length) return new Map();
  const rows = await ex
    .select({ id: user.id, email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(inArray(user.id, ids));
  return new Map(rows.map((u) => [u.id, { user: u }]));
}

export function serializeMessage(
  m: MessageRow,
  sender: SenderProfile,
  viewerId: string | null,
  readBy: MessageView["readBy"] = null,
  abouts: Map<string, MessageAbout> | null = null,
): MessageView {
  const deleted = Boolean(m.deletedAt || m.moderatedAt);
  const mine = viewerId !== null && m.senderId === viewerId;
  return {
    id: m.id,
    conversationId: m.conversationId,
    kind: m.kind,
    body: deleted || m.kind === "image" ? null : m.body,
    image:
      !deleted && m.imageKey
        ? {
            url: `/api/conversations/${m.conversationId}/images/${imageNameOf(m.imageKey)}`,
            width: m.imageWidth,
            height: m.imageHeight,
          }
        : null,
    // Compte supprimé : plus de pseudo ni de photo (son ancien pseudo n'est jamais réaffiché).
    sender:
      m.senderId && sender && !sender.deletedAt
        ? { userId: sender.userId, pseudo: sender.pseudo, avatarUrl: storage.url(sender.avatarKey) }
        : null,
    asStructure: m.asStructure,
    mine,
    // Diffusé à tous les lecteurs (l'appli rapproche son message en cours d'envoi) ; sans valeur pour un autre.
    clientId: viewerId === null || mine ? m.clientId : null,
    createdAt: m.createdAt.toISOString(),
    deleted,
    moderated: Boolean(m.moderatedAt),
    readBy,
    about: m.aboutEventId ? (abouts?.get(m.aboutEventId) ?? null) : null,
  };
}

export async function senderProfiles(ex: Executor, ids: (string | null)[]): Promise<Map<string, SenderProfile>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const out = new Map<string, SenderProfile>();
  if (!unique.length) return out;
  const rows = await ex
    .select({
      userId: profiles.userId,
      pseudo: profiles.pseudo,
      avatarKey: profiles.avatarKey,
      deletedAt: profiles.deletedAt,
    })
    .from(profiles)
    .where(inArray(profiles.userId, unique));
  for (const r of rows) out.set(r.userId, r);
  return out;
}

/** Dernier message (aperçu de la liste) ; recalcule le cache `last_message_*` de la conversation si demandé. */
export async function lastMessageOf(ex: Executor, conversationId: string): Promise<MessageRow | null> {
  const [row] = await ex
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);
  return row ?? null;
}

export async function refreshPreview(tx: Tx, conversationId: string) {
  const last = await lastMessageOf(tx, conversationId);
  await tx
    .update(conversations)
    .set({
      lastMessageAt: last?.createdAt ?? null,
      lastMessagePreview: last
        ? shorten(
            messagePreview({
              kind: last.kind,
              body: last.body,
              deleted: Boolean(last.deletedAt || last.moderatedAt),
            }),
            MESSAGE_PREVIEW_MAX,
          )
        : null,
    })
    .where(eq(conversations.id, conversationId));
}

/** Nombre de messages non lus de ce lecteur (pas les siens, pas ceux de son côté, pas les messages d'information). */
export async function unreadCountOf(ex: Executor, conversationId: string, reader: Reader): Promise<number> {
  // Comparaison entièrement en SQL : le marqueur garde la précision de la base (microsecondes).
  const side = reader.side === "structure" ? sql`and m.as_structure = false` : sql``;
  const result = await ex.execute(sql`
    select count(*)::int as n from messages m
    left join conversation_participants p on p.conversation_id = m.conversation_id and p.user_id = ${reader.userId}
    where m.conversation_id = ${conversationId} and m.deleted_at is null and m.moderated_at is null
      and m.kind <> 'system' and m.sender_id is distinct from ${reader.userId} ${side}
      and (p.last_read_message_at is null
        or (m.created_at, m.id) > (p.last_read_message_at, p.last_read_message_id))`);
  return Number((result.rows[0] as { n?: number } | undefined)?.n ?? 0);
}

/**
 * Diffusion sur `conversation:{id}` aux seules connexions de ses lecteurs du moment (et, côté structure, d'une session
 * qui a prouvé le second facteur) : une personne retirée ne reçoit plus rien, même abonnée.
 */
export function publishToConversation(conversationId: string, readers: Reader[], type: string, payload: unknown) {
  const byId = new Map(readers.map((r) => [r.userId, r]));
  realtime.publishTo(`conversation:${conversationId}`, type, payload, (socket) => {
    const reader = socket.userId ? byId.get(socket.userId) : undefined;
    if (!reader) return false;
    return reader.side === "member" || twoFactorOk(socket.secondFactor);
  });
}
