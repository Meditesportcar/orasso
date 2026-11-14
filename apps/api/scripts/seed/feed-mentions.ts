// Seed des mentions et de l'épingle (vague R8, lot R8a2). Rejouable : une publication épinglée dans le journal du
// Rassemblement du Lydia (Roues Libres 66) ; les mentions de La Brasa (« Sur place ») et de Kenji_66 (« Passionnés ») sont
// matérialisées par la reprise (`backfillMentions`, sans notification) ; une mention masquée (Julie_66, masquée sur la
// fiche du Lydia par Sarah_66) ; une publication d'un compte privé (Marc_66) rattachée au Lydia, qui n'apparaît nulle part.
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { backfillMentions } from "../../src/modules/feed/mentions";
import { ensureSeedPost, LYDIA_ORGA_POSTS } from "./feed";
import { HOUR } from "./helpers";
import { isSeedAccount, isSeedPost, seedPostId } from "./seed-scope";

const LYDIA_SLUG = "rassemblement-du-lydia";
export const JULIE_CAPTION = "J'y serai avec la Clio : à samedi au pied du Lydia !";
export const MARC_CAPTION = "Compte privé : cette publication ne doit apparaître sur aucune fiche.";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({
    where: and(sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}`, isSeedAccount(t.profiles.userId)),
  });

export async function seedFeedMentions() {
  const lydia = await db.query.events.findFirst({ where: eq(t.events.slug, LYDIA_SLUG) });
  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") });
  const sarah = await byPseudo("Sarah_66");
  if (!lydia || !structure || !sarah) {
    console.log("Mentions : Lydia, Roues Libres 66 ou Sarah_66 absents, rien ajouté.");
    return;
  }
  const at = Date.now();

  // Publications de passionnés rattachées au Lydia : Julie_66 (compte public, sa mention sera masquée) et Marc_66 (compte
  // privé : elle ne doit apparaître ni dans « Passionnés » ni dans un compteur).
  for (const [pseudo, caption, hoursAgo, photoIndex] of [
    ["Julie_66", JULIE_CAPTION, 6, 9],
    ["Marc_66", MARC_CAPTION, 7, 11],
  ] as const) {
    const person = await byPseudo(pseudo);
    if (!person) continue;
    // Identifiant fixe, rattachement au Lydia courant, jamais recréée si supprimée, pas de doublon auteur + légende sur le Lydia
    // courant (ancienne base) : voir `ensureSeedPost` (`feed.ts`).
    const createdAt = new Date(at - hoursAgo * HOUR);
    await ensureSeedPost(
      seedPostId(`mention:${pseudo}:${caption}`),
      {
        authorId: person.userId,
        persona: "fan",
        eventId: lydia.id,
        eventRole: "attendee",
        caption,
        department: "66",
        createdAt,
        updatedAt: createdAt,
      },
      photoIndex,
    );
  }

  // Les mentions de toutes les publications rattachées, citées ou signées « collaboration » (reprise : sans notification).
  const { posts, created } = await backfillMentions();

  // Une mention masquée : celle de Julie_66 sur la fiche du Lydia (la publication reste à Julie, qui n'en sait rien).
  const julie = await byPseudo("Julie_66");
  if (julie) {
    // La publication de la graine seulement (identifiant fixe) : une vraie publication de Julie_66 de même légende n'est jamais masquée.
    const post = await db.query.feedPosts.findFirst({
      where: eq(t.feedPosts.id, seedPostId(`mention:Julie_66:${JULIE_CAPTION}`)),
    });
    if (post && !post.deletedAt) {
      await db
        .update(t.feedPostMentions)
        .set({ hiddenAt: new Date(at - HOUR), hiddenBy: sarah.userId })
        .where(
          and(
            eq(t.feedPostMentions.postId, post.id),
            eq(t.feedPostMentions.targetKind, "event"),
            eq(t.feedPostMentions.targetId, lydia.id),
            sql`${t.feedPostMentions.hiddenAt} is null`,
          ),
        );
    }
  }

  // Une publication épinglée dans le journal du Lydia : la plus récente avec photo, si aucune n'est épinglée.
  const pinned = await db.query.feedPosts.findFirst({
    where: and(
      eq(t.feedPosts.eventId, lydia.id),
      isNotNull(t.feedPosts.pinnedAt),
      sql`${t.feedPosts.deletedAt} is null`,
    ),
  });
  if (!pinned) {
    const candidate = await db.execute<{ id: string }>(sql`select p.id from feed_posts p
      where p.persona = 'organizer' and p.structure_id = ${structure.id} and p.event_id = ${lydia.id}
        and p.event_role = 'organizer' and p.deleted_at is null and ${isSeedPost(LYDIA_ORGA_POSTS, "p")}
        and exists (select 1 from feed_post_photos ph where ph.post_id = p.id)
      order by p.created_at desc limit 1`);
    const id = candidate.rows[0]?.id;
    if (id)
      await db
        .update(t.feedPosts)
        .set({ pinnedAt: new Date(at) })
        .where(eq(t.feedPosts.id, id));
  }
  console.log(
    `Mentions : ${posts} publications relues, ${created} mentions créées ; épingle du Lydia posée si besoin.`,
  );
}
