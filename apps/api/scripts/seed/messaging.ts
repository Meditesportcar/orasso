// Lot 18 : messagerie de démonstration. Conversation Kenji ↔ Léa (amis, le dernier message de Léa non lu par Kenji),
// demande de contact de Nina à Kenji en attente, conversation de Julie avec MéditeSportCar à laquelle Damien
// (propriétaire) répond au nom de la structure. Idempotent (clés uniques des conversations et des demandes).
import { directKey, mediaKey, organizerKey } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

type Line = { from: string; body: string; asStructure?: boolean };

/** Conversation et ses messages (une minute d'écart), seulement si elle n'existe pas encore. */
async function conversation(
  key: string,
  values: { kind: "direct" | "organizer" | "media"; structureId?: string; mediaId?: string; createdBy: string },
  members: { userId: string; role: "member" | "admin" }[],
  lines: Line[],
  readUpTo: Record<string, number>,
) {
  const [existing] = await db.select().from(t.conversations).where(eq(t.conversations.directKey, key));
  if (existing) return false;
  const start = Date.now() - (lines.length + 5) * 60_000;
  await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(t.conversations)
      .values({ ...values, directKey: key })
      .returning();
    if (!c) throw new Error("Conversation non créée");
    const rows: (typeof t.messages.$inferSelect)[] = [];
    for (const [i, line] of lines.entries()) {
      const [m] = await tx
        .insert(t.messages)
        .values({
          conversationId: c.id,
          senderId: line.from,
          kind: "text",
          body: line.body,
          asStructure: line.asStructure ?? false,
          createdAt: new Date(start + i * 60_000),
        })
        .returning();
      if (m) rows.push(m);
    }
    const last = rows.at(-1);
    await tx
      .update(t.conversations)
      .set({
        lastMessageAt: last?.createdAt ?? null,
        lastMessagePreview: last?.body?.slice(0, 80) ?? null,
        messagesCount: rows.length,
      })
      .where(eq(t.conversations.id, c.id));
    for (const member of members) {
      const upTo = readUpTo[member.userId];
      const read = upTo === undefined ? undefined : rows[upTo];
      await tx.insert(t.conversationParticipants).values({
        conversationId: c.id,
        userId: member.userId,
        role: member.role,
        lastReadMessageId: read?.id ?? null,
        lastReadMessageAt: read?.createdAt ?? null,
        lastReadAt: read ? new Date() : null,
      });
    }
  });
  return true;
}

export async function seedMessaging() {
  const [kenji, lea, nina, julie, damien] = await Promise.all(
    ["Kenji_66", "Lea_11", "Nina_34", "Julie_66", "Damien_66"].map(byPseudo),
  );
  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  if (!kenji || !lea || !nina || !julie || !damien || !structure) {
    console.log("Messagerie : comptes de démonstration absents, rien ajouté.");
    return;
  }
  await conversation(
    directKey(kenji.userId, lea.userId),
    { kind: "direct", createdBy: kenji.userId },
    [
      { userId: kenji.userId, role: "member" },
      { userId: lea.userId, role: "member" },
    ],
    [
      { from: kenji.userId, body: "Salut Léa ! Tu viens à la Nocturne de Canet ?" },
      { from: lea.userId, body: "Oui, retenue hier soir 🎉 Tu montes avec la Supra ?" },
      { from: kenji.userId, body: "Évidemment. On se retrouve au péage du Boulou vers 19 h ?" },
      { from: lea.userId, body: "Parfait, je prends le café." },
    ],
    // Léa a tout lu ; Kenji n'a pas lu le dernier message de Léa.
    { [lea.userId]: 3, [kenji.userId]: 2 },
  );
  await db
    .insert(t.contactRequests)
    .values({
      fromUserId: nina.userId,
      toUserId: kenji.userId,
      message: "Salut Kenji, j'ai vu ta Supra au Cars & Coffee : tu as gardé la boîte d'origine ?",
    })
    .onConflictDoNothing();
  await conversation(
    organizerKey(structure.id, julie.userId),
    { kind: "organizer", structureId: structure.id, createdBy: julie.userId },
    [
      { userId: julie.userId, role: "member" },
      { userId: damien.userId, role: "admin" },
    ],
    [
      { from: julie.userId, body: "Bonjour, les motos sont-elles acceptées à la Nocturne de Canet ?" },
      {
        from: damien.userId,
        body: "Bonjour Julie, oui : candidate avec ta moto, on garde une zone pour les deux-roues.",
        asStructure: true,
      },
      { from: julie.userId, body: "Merci ! Et pour un passager ?" },
    ],
    { [julie.userId]: 2, [damien.userId]: 1 },
  );
  console.log("Messagerie : Kenji ↔ Léa, demande de contact de Nina à Kenji, Julie ↔ MéditeSportCar (Damien répond).");
}

/**
 * Lot R9i : la conversation de page Kenji_66 ↔ « Sud Cars » (Kenji est identifié par son pseudo sur l'album de la Côte Vermeille). Posée
 * après les albums (la page et l'album doivent exister). Kenji a tout lu ; la page (Leo_SudCars) a lu le message de Kenji. Rien pour
 * Damien_66 (les recettes ouvrent sa conversation) ni pour Lea_11 (identification retirée : refus). Idempotent (clé unique).
 */
export async function seedMediaConversation() {
  const kenji = await byPseudo("Kenji_66");
  const [leo] = await db.select({ id: t.user.id }).from(t.user).where(eq(t.user.email, "leo@orasso.local"));
  const media = leo ? await db.query.mediaProfiles.findFirst({ where: eq(t.mediaProfiles.userId, leo.id) }) : null;
  if (!kenji || !leo || !media) {
    console.log("Messagerie : page « Sud Cars » ou Kenji_66 absents, conversation de page non ajoutée.");
    return;
  }
  await conversation(
    mediaKey(media.id, kenji.userId),
    { kind: "media", mediaId: media.id, createdBy: kenji.userId },
    [
      { userId: kenji.userId, role: "member" },
      { userId: leo.id, role: "member" },
    ],
    [
      { from: kenji.userId, body: "Bonjour, je peux avoir la photo du port en grand ?" },
      { from: leo.id, body: "Oui, je te l'envoie ce soir." },
    ],
    { [kenji.userId]: 1, [leo.id]: 1 },
  );
  console.log("Messagerie : Kenji_66 ↔ la page « Sud Cars » (conversation de page).");
}
