// Seed des commentaires du Fil (lot R8k1) : sous la publication récente de Kenji_66, cinq commentaires dont « On se retrouve
// au port à 17 h 30 ? » (celui de la maquette), une réponse qui cite @Kenji_66 et des flammes ; une autre publication de Kenji_66
// aux commentaires coupés. Rejouable : rien n'est ajouté si la publication a déjà des commentaires. Les compteurs sont ceux
// que l'API tiendrait (commentaires non supprimés, réponses comprises).
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { HOUR, now } from "./helpers";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

/** [auteur, texte, il y a (heures), flammes de…]. */
const TOP: [string, string, number, string[]][] = [
  ["Lea_11", "On se retrouve au port à 17 h 30 ?", 2, ["Kenji_66", "Nina_34", "Marc_66", "Theo_66"]],
  ["Nina_34", "Hâte d'y être", 1.5, []],
  ["Marc_66", "Bon plan pour le café !", 1, ["Lea_11"]],
  ["Theo_66", "Belle photo, on voit bien la lumière du matin.", 0.7, []],
  ["Julie_66", "Il y avait du monde sur le plateau ?", 0.3, []],
];

export async function seedFeedComments() {
  const kenji = await byPseudo("Kenji_66");
  if (!kenji) {
    console.log("Commentaires du Fil : Kenji_66 absent, rien ajouté.");
    return;
  }
  const posts = (
    await db.select().from(t.feedPosts).where(eq(t.feedPosts.authorId, kenji.userId)).orderBy(t.feedPosts.createdAt)
  ).filter((p) => !p.deletedAt);
  const recent = posts.at(-1);
  const older = posts.at(-2);
  if (!recent) return;
  const [existing] = await db
    .select({ id: t.feedPostComments.id })
    .from(t.feedPostComments)
    .where(eq(t.feedPostComments.postId, recent.id))
    .limit(1);
  if (existing) {
    console.log("Commentaires du Fil : déjà présents.");
    return;
  }

  const ids = new Map<string, string>();
  const userOf = async (pseudo: string) => {
    const p = await byPseudo(pseudo);
    if (!p) throw new Error(`Compte du seed absent : ${pseudo}`);
    return p.userId;
  };
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR);

  let total = 0;
  const topIds: string[] = [];
  for (const [pseudo, text, ago, flames] of TOP) {
    const [row] = await db
      .insert(t.feedPostComments)
      .values({
        postId: recent.id,
        authorId: await userOf(pseudo),
        text,
        clientId: randomUUID(),
        reactionsCount: flames.length,
        createdAt: at(ago),
        updatedAt: at(ago),
      })
      .returning({ id: t.feedPostComments.id });
    if (!row) continue;
    ids.set(text, row.id);
    topIds.push(row.id);
    total += 1;
    for (const f of flames) {
      await db.insert(t.feedPostCommentReactions).values({ commentId: row.id, userId: await userOf(f) });
    }
  }

  // Une réponse (un seul niveau) qui cite @Kenji_66.
  const first = topIds[0];
  if (first) {
    const reply = "@Kenji_66 oui, devant le plateau JDM";
    const [row] = await db
      .insert(t.feedPostComments)
      .values({
        postId: recent.id,
        authorId: await userOf("Damien_66"),
        parentId: first,
        text: reply,
        clientId: randomUUID(),
        reactionsCount: 1,
        createdAt: at(1.2),
        updatedAt: at(1.2),
      })
      .returning({ id: t.feedPostComments.id });
    if (row) {
      total += 1;
      await db.insert(t.feedCommentMentions).values({ commentId: row.id, userId: kenji.userId });
      await db.insert(t.feedPostCommentReactions).values({ commentId: row.id, userId: await userOf("Lea_11") });
      await db.update(t.feedPostComments).set({ repliesCount: 1 }).where(eq(t.feedPostComments.id, first));
    }
  }
  await db.update(t.feedPosts).set({ commentsCount: total }).where(eq(t.feedPosts.id, recent.id));

  // Une publication aux commentaires coupés (la plus ancienne de Kenji_66).
  if (older) await db.update(t.feedPosts).set({ commentsOff: true }).where(eq(t.feedPosts.id, older.id));
  console.log(
    `Commentaires du Fil : ${total} commentaire(s) sous la publication de Kenji_66, commentaires coupés sur une autre.`,
  );
}
