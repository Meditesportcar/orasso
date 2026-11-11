// Seed du lot R8c1 : de quoi voir le Fil à deux zones, le rail et « Pour ta sortie de … » sans rien préparer.
// - Damien_66 a vu une dizaine de publications sans interaction (zone B : « Tu es à jour », puis « Déjà vu ») ;
// - cinq publications ont assez de flammes récentes (3 à 6, de comptes en règle, sur les 7 derniers jours) pour un rail
//   « Ça plaît en ce moment » dans « Abonnements » (celles des comptes qu'il suit passent d'abord) et dans « Autour de moi » ;
// - une publication du journal d'une de ses sorties à venir (candidature retenue ou billet), au nom de la structure
//   organisatrice : « Pour ta sortie de samedi ».
// Rejouable : les lignes existantes ne sont jamais doublées (clés uniques, légende repérée).
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { storage } from "../../src/lib/storage";
import { feedPhotoKey } from "../../src/modules/feed/posts";
import { HOUR } from "./helpers";
import { reviewedNoPlateCar } from "./photos";

const OUTING_CAPTION = "Le programme de la journée est en ligne : retrouvez-nous dès l'ouverture des portes.";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

export async function seedFeedSeen() {
  const damien = await byPseudo("Damien_66");
  if (!damien) {
    console.log("Fil (cartes vues) : Damien_66 absent, rien ajouté.");
    return;
  }
  const at = Date.now();

  // Les publications visibles de Damien (publiques, comptes en règle, pas les siennes), des plus récentes aux plus anciennes.
  const candidates = await db
    .select({ id: t.feedPosts.id, authorId: t.feedPosts.authorId, persona: t.feedPosts.persona })
    .from(t.feedPosts)
    .innerJoin(t.profiles, eq(t.profiles.userId, t.feedPosts.authorId))
    .where(
      and(
        sql`${t.feedPosts.deletedAt} is null`,
        sql`${t.profiles.deletedAt} is null and ${t.profiles.bannedAt} is null and ${t.profiles.visibility} = 'public'`,
        sql`${t.feedPosts.authorId} <> ${damien.userId}`,
        sql`exists (select 1 from feed_post_photos ph where ph.post_id = ${t.feedPosts.id})`,
      ),
    )
    .orderBy(desc(t.feedPosts.createdAt));

  // --- Le rail : cinq publications, de préférence de comptes que Damien suit --------------------------------------------
  const follows = new Set(
    (
      await db
        .select({ id: t.userFollows.followedId })
        .from(t.userFollows)
        .where(and(eq(t.userFollows.followerId, damien.userId), eq(t.userFollows.status, "accepted")))
    ).map((r) => r.id),
  );
  const followed = candidates.filter((c) => c.persona === "fan" && follows.has(c.authorId));
  const others = candidates.filter((c) => !follows.has(c.authorId) || c.persona !== "fan");
  const hot = [...followed, ...others].slice(0, 5);
  const fans = await db
    .select({ id: t.profiles.userId })
    .from(t.profiles)
    .where(
      and(
        sql`${t.profiles.deletedAt} is null and ${t.profiles.bannedAt} is null`,
        sql`${t.profiles.userId} <> ${damien.userId}`,
        eq(t.profiles.official, false),
      ),
    )
    .orderBy(t.profiles.pseudo)
    .limit(8);
  let flamed = 0;
  for (const [index, post] of hot.entries()) {
    const wanted = Math.min(fans.length, 6 - (index % 4));
    const who = fans.filter((f) => f.id !== post.authorId).slice(0, wanted);
    if (who.length < 3) continue;
    const inserted = await db
      .insert(t.feedPostReactions)
      .values(
        who.map((f, k) => ({
          postId: post.id,
          userId: f.id,
          createdAt: new Date(at - (index + 1) * 5 * HOUR - k * 20 * 60_000),
        })),
      )
      .onConflictDoNothing()
      .returning({ id: t.feedPostReactions.postId });
    flamed += inserted.length;
    // Le compteur de la publication suit les flammes (une par compte).
    await db
      .update(t.feedPosts)
      .set({
        reactionsCount: sql`(select count(*)::int from feed_post_reactions r where r.post_id = ${t.feedPosts.id})`,
      })
      .where(eq(t.feedPosts.id, post.id));
  }

  // --- Une dizaine de cartes vues sans interaction (hors rail, pour que le rail et le neuf restent en haut) ---------------
  const hotIds = new Set(hot.map((p) => p.id));
  const seen = candidates.filter((c) => !hotIds.has(c.id)).slice(0, 10);
  if (seen.length) {
    await db
      .insert(t.feedSeen)
      .values(
        seen.map((p, i) => ({
          userId: damien.userId,
          cardId: `feed_post:${p.id}`,
          seenAt: new Date(at - 20 * 60_000 - i * 4 * 60_000),
        })),
      )
      .onConflictDoNothing();
  }

  // --- Le journal d'une sortie à venir de Damien --------------------------------------------------------------------------
  const outing = await db.execute<{ id: string; structure_id: string; poster: string | null }>(
    sql`select e.id::text as id, e.structure_id::text as structure_id,
        coalesce(e.poster_post_key, e.poster_key, e.poster_photo_key) as poster
      from events e
      where e.status = 'published' and e.ends_at > now()
        and (exists (select 1 from applications a where a.event_id = e.id and a.user_id = ${damien.userId}
              and a.kind = 'vehicle' and a.status = 'accepted')
          or exists (select 1 from tickets k where k.event_id = e.id and k.user_id = ${damien.userId} and k.status = 'valid'))
      order by e.starts_at limit 1`,
  );
  const event = outing.rows[0];
  let journal = "aucune sortie à venir pour Damien_66";
  if (event) {
    const already = await db.query.feedPosts.findFirst({
      where: and(eq(t.feedPosts.eventId, event.id), eq(t.feedPosts.caption, OUTING_CAPTION)),
    });
    if (already) journal = "déjà présente";
    else {
      const owner = await db.query.structureMembers.findFirst({
        where: and(eq(t.structureMembers.structureId, event.structure_id), eq(t.structureMembers.role, "owner")),
      });
      const structure = await db.query.structures.findFirst({ where: eq(t.structures.id, event.structure_id) });
      const photo = await reviewedNoPlateCar(4);
      if (owner && structure && (photo || event.poster)) {
        const createdAt = new Date(at - 5 * HOUR);
        const id = randomUUID();
        await db.insert(t.feedPosts).values({
          id,
          authorId: owner.userId,
          persona: "organizer",
          structureId: structure.id,
          eventId: event.id,
          eventRole: "organizer",
          caption: OUTING_CAPTION,
          department: structure.department ?? "66",
          createdAt,
          updatedAt: createdAt,
        });
        // Une photo du seed (aucune plaque lisible) ; sans elle, l'affiche de l'événement fait le visuel.
        if (photo) {
          const out = await sharp(photo.data)
            .resize(1080, 1350, { fit: "cover", position: "attention" })
            .webp({ quality: 80 })
            .toBuffer({ resolveWithObject: true });
          const key = feedPhotoKey(id, randomBytes(16).toString("hex"));
          await storage.put(key, out.data);
          await db.insert(t.feedPostPhotos).values({
            postId: id,
            storageKey: key,
            width: out.info.width,
            height: out.info.height,
            position: 0,
            plateBlurred: false,
            noPlateConfirmed: true,
          });
        }
        journal = "ajoutée";
      }
    }
  }
  console.log(
    `Fil (cartes vues) : ${seen.length} carte(s) vue(s) par Damien_66, ${hot.length} publication(s) pour le rail (${flamed} flamme(s) ajoutée(s)), publication du journal de sa sortie : ${journal}.`,
  );
}
