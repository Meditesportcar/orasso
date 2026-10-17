// Cible « message » (lot 18) : le signaleur doit pouvoir lire la conversation. La copie du message et de ses 5 voisins
// avant et après (AS5) est prise **au moment du signalement**, parmi les messages que le signaleur lit ; l'équipe ne
// voit que cette copie, jamais la conversation en direct. Retrait : « Message retiré par la modération ».
import { MODERATION, type ReportContextMessage } from "@orasso/shared";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { conversations, messages, uploads } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { AppError, notFound } from "../../../lib/errors";
import { rulesOf } from "../../messaging/access";
import {
  actorOf,
  type MessageRow,
  publishToConversation,
  refreshPreview,
  requireAccess,
  senderProfiles,
} from "../../messaging/core";
import { goneView, type TargetRules, UUID_RE } from "./types";

async function messageRow(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db.select().from(messages).where(eq(messages.id, id));
  return row;
}

/** Copie : 5 messages avant, le message, 5 après (messages d'information exclus). */
async function snapshot(target: MessageRow): Promise<ReportContextMessage[]> {
  const pivot = sql`(select m2.created_at, m2.id from messages m2 where m2.id = ${target.id})`;
  const base = and(eq(messages.conversationId, target.conversationId), ne(messages.kind, "system"));
  const before = await db
    .select()
    .from(messages)
    .where(and(base, sql`(${messages.createdAt}, ${messages.id}) < ${pivot}`))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(MODERATION.contextAround);
  const after = await db
    .select()
    .from(messages)
    .where(and(base, sql`(${messages.createdAt}, ${messages.id}) > ${pivot}`))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(MODERATION.contextAround);
  const rows = [...before.reverse(), target, ...after];
  const senders = await senderProfiles(
    db,
    rows.map((m) => m.senderId),
  );
  return rows.map((m) => {
    const sender = m.senderId ? senders.get(m.senderId) : null;
    const removed = Boolean(m.deletedAt || m.moderatedAt);
    return {
      id: m.id,
      pseudo: sender && !sender.deletedAt ? sender.pseudo : "Compte supprimé",
      body: removed || m.kind === "image" ? null : m.body,
      note: removed ? "deleted" : m.kind === "image" ? "image" : null,
      createdAt: m.createdAt.toISOString(),
      reported: m.id === target.id,
    };
  });
}

export const messageTarget: TargetRules = {
  type: "message",
  async resolve(v, targetId) {
    const m = await messageRow(targetId);
    if (!m || m.kind === "system" || m.deletedAt || m.moderatedAt) throw notFound("Message introuvable");
    try {
      await requireAccess(actorOf(v), m.conversationId);
    } catch (error) {
      // Pas lecteur : on ne révèle rien du message (404 plutôt que 403).
      if (error instanceof AppError && error.status === 403 && error.code === "forbidden") {
        throw notFound("Message introuvable");
      }
      throw error;
    }
    return { ownerId: m.senderId, context: await snapshot(m) };
  },
  async view(report) {
    const reported = report.context?.find((c) => c.reported);
    const m = await messageRow(report.targetId);
    if (!m && !reported) return goneView("Message");
    return {
      title: `Message de ${reported?.pseudo ?? "Compte supprimé"}`,
      text: reported?.body ?? null,
      imageUrl: null,
      link: null,
      gone: !m,
      removed: Boolean(m?.moderatedAt),
    };
  },
  async remove(tx, _v, report, after) {
    const [m] = await tx.select().from(messages).where(eq(messages.id, report.targetId)).for("update");
    if (!m || m.moderatedAt) return [];
    await tx
      .update(messages)
      .set({ moderatedAt: now(), body: null, imageKey: null, imageWidth: null, imageHeight: null })
      .where(eq(messages.id, m.id));
    if (m.imageKey) await tx.delete(uploads).where(eq(uploads.key, m.imageKey));
    await refreshPreview(tx, m.conversationId);
    after(async () => {
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, m.conversationId));
      const rules = conversation ? rulesOf(conversation.kind) : null;
      if (!conversation || !rules) return;
      publishToConversation(m.conversationId, await rules.readers(db, conversation), "message.deleted", {
        messageId: m.id,
      });
    });
    return m.imageKey ? [m.imageKey] : [];
  },
};
