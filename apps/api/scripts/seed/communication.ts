// Lot 20 : communication de l'organisateur. Modèles Orasso (lecture seule pour toutes les structures), une annonce
// épinglée et un message groupé aux retenus sur « Nocturne de Canet », les discussions du staff de MéditeSportCar.
// Idempotent : rien n'est recréé s'il existe déjà.
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { groupMessagesService } from "../../src/modules/communication/group-messages";
import { segmentRecipients } from "../../src/modules/communication/segments";
import { staffChatsService } from "../../src/modules/communication/staff-chats";

/** Modèles proposés par Orasso (docs/01 : « modèles de messages réutilisables d'un événement à l'autre »). */
const ORASSO_TEMPLATES = [
  {
    kind: "instructions" as const,
    name: "Consignes jour J",
    subject: "Consignes pour {{event.title}}",
    body: "Bonjour {{pseudo}},\n\nRendez-vous {{event.date}} à {{event.city}}. Arrive avec ton QR prêt sur ton téléphone, phares éteints à l'entrée, et suis les indications du staff pour le placement. Pas de démarrage bruyant ni de départ rapide : la route reste ouverte à tous.\n\nÀ très vite,\n{{structure.name}}",
  },
  {
    kind: "announcement" as const,
    name: "Météo incertaine",
    subject: "Météo incertaine",
    body: "La météo annoncée pour {{event.title}} est incertaine. L'événement passe en « Incertain » : nous confirmerons ici au plus tard la veille. Merci de garder un œil sur le fil de l'événement.",
  },
  {
    kind: "thanks" as const,
    name: "Remerciement",
    subject: "Merci d'être venu !",
    body: "Merci {{pseudo}} d'être venu à {{event.title}} ! Ton avis nous aide à faire mieux la prochaine fois : {{review_link}}\n\n{{structure.name}}",
  },
  {
    kind: "message" as const,
    name: "Rappel règlement",
    subject: "Rappel du règlement",
    body: "Bonjour {{pseudo}}, un petit rappel avant {{event.title}} : le règlement que tu as accepté s'applique sur place et sur la route (pas de burn, pas de départ rapide, respect des riverains). Merci de le relire sur la page de l'événement.",
  },
];

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

export async function seedCommunication() {
  for (const tpl of ORASSO_TEMPLATES) {
    const [existing] = await db
      .select({ id: t.messageTemplates.id })
      .from(t.messageTemplates)
      .where(and(isNull(t.messageTemplates.structureId), eq(t.messageTemplates.name, tpl.name)));
    if (!existing) await db.insert(t.messageTemplates).values(tpl);
  }

  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  const nocturne = await db.query.events.findFirst({ where: eq(t.events.slug, "nocturne-de-canet-2026") });
  const damien = await byPseudo("Damien_66");
  if (!structure || !nocturne || !damien) return;

  const [announcement] = await db
    .select({ id: t.eventAnnouncements.id })
    .from(t.eventAnnouncements)
    .where(and(eq(t.eventAnnouncements.eventId, nocturne.id), eq(t.eventAnnouncements.kind, "announcement")));
  if (!announcement) {
    await db.insert(t.eventAnnouncements).values({
      eventId: nocturne.id,
      authorId: damien.userId,
      kind: "announcement",
      audience: "public",
      body: "Musique coupée à 22 h, animation de clôture à 21 h sur le parking principal. Prévoyez une lampe : l'éclairage du fond du parking est faible.",
      pinned: true,
      publishedAt: new Date(Date.now() - 3 * 3_600_000),
    });
  }

  const [group] = await db
    .select({ id: t.groupMessages.id })
    .from(t.groupMessages)
    .where(eq(t.groupMessages.structureId, structure.id));
  if (!group) {
    const ids = await segmentRecipients(db, {
      segment: "accepted",
      structureId: structure.id,
      event: nocturne,
      authorId: damien.userId,
      limit: 5000,
    });
    if (ids.length) {
      const [gm] = await db
        .insert(t.groupMessages)
        .values({
          structureId: structure.id,
          eventId: nocturne.id,
          authorId: damien.userId,
          segment: "accepted",
          subject: "Accueil à partir de 18 h 30",
          body: "Bonjour {{pseudo}}, l'accueil de {{event.title}} ouvre à 18 h 30 par l'entrée nord. Garde ton QR prêt !",
          clientId: randomUUID(),
          recipientsCount: ids.length,
        })
        .returning();
      if (gm) {
        await db
          .insert(t.groupMessageRecipients)
          .values(ids.map((userId) => ({ groupMessageId: gm.id, userId })))
          .onConflictDoNothing();
        await groupMessagesService.drain(gm.id);
      }
    }
  }

  // Discussions du staff : la permanente de la structure et celle de la Nocturne, avec un premier message.
  const permanent = await staffChatsService.ensureStructureChat(db, structure.id);
  const eventChat = await staffChatsService.ensureEventChat(db, nocturne);
  for (const [chat, body] of [
    [permanent, "Bienvenue dans la discussion du staff de MéditeSportCar !"],
    [eventChat, "Briefing à 18 h devant la tente d'accueil. Gilets dans le coffre de ma voiture."],
  ] as const) {
    if (chat.messagesCount > 0) continue;
    const at = new Date(Date.now() - 3_600_000);
    await db.insert(t.messages).values({
      conversationId: chat.id,
      senderId: damien.userId,
      kind: "text",
      body,
      createdAt: at,
    });
    await db
      .update(t.conversations)
      .set({ lastMessageAt: at, lastMessagePreview: body.slice(0, 80), messagesCount: 1 })
      .where(eq(t.conversations.id, chat.id));
  }
}
