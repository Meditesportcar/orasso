// Lot R9a : les abonnements d'une casquette et les stories de page. La Brasa (prestataire de Sofia_66) suit Roues Libres 66 et
// Sud Cars ; Roues Libres 66 suit La Brasa ; Damien_66 suit La Brasa et Sud Cars (il retrouve leurs stories dans sa barre,
// sous leurs clés `v:` et `m:`) ; une story vivante de La Brasa et une de Sud Cars, publiées par le vrai service (composition,
// notifications) à partir des photos du seed relues « aucune plaque lisible ». Rejouable : rien n'est dupliqué, et une page
// qui a déjà une story vivante n'en reçoit pas une seconde. Le seed ne pose aucune notification ni compteur à la main.
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { AppError } from "../../src/lib/errors";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { feedCommentsService } from "../../src/modules/feed/comments/service";
import { notificationsService } from "../../src/modules/notifications/service";
import { storiesService } from "../../src/modules/stories/service";
import { uploadsService } from "../../src/modules/uploads/service";
import { LYDIA_ORGA_POSTS, storeFeedPhoto } from "./feed";
import { KENJI_RECENT_POST } from "./feed-comments";
import { reviewedNoPlateCar } from "./photos";
import { isSeedAccount, isSeedPost } from "./seed-scope";

async function viewerOfUser(userId: string, secondFactor: string | null = null): Promise<Viewer | null> {
  const profile = await db.query.profiles.findFirst({ where: eq(t.profiles.userId, userId) });
  const [u] = await db.select().from(t.user).where(eq(t.user.id, userId));
  return profile && u ? { user: u as AuthUser, profile, session: { secondFactor } } : null;
}

type Page = { kind: "provider" | "media" | "structure"; id: string };

export async function seedPageFollows() {
  // Les pages de la graine se retrouvent par leur titulaire de la graine (compte `@orasso.local`), jamais par leur nom : une vraie page
  // de même nom n'est pas à elle.
  const seedUser = async (email: string) => (await db.query.user.findFirst({ where: eq(t.user.email, email) }))?.id;
  const sofiaId = await seedUser("sofia@orasso.local");
  const leoId = await seedUser("leo@orasso.local");
  const brasa = sofiaId
    ? await db.query.providerProfiles.findFirst({
        where: and(eq(t.providerProfiles.userId, sofiaId), isNull(t.providerProfiles.deletedAt)),
      })
    : null;
  const sudCars = leoId
    ? await db.query.mediaProfiles.findFirst({
        where: and(eq(t.mediaProfiles.userId, leoId), isNull(t.mediaProfiles.deletedAt)),
      })
    : null;
  const rouesLibres = await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") });
  const damien = await db.query.profiles.findFirst({
    where: and(sql`lower(${t.profiles.pseudo}) = 'damien_66'`, isSeedAccount(t.profiles.userId)),
  });
  if (!brasa || !sudCars || !rouesLibres || !damien) {
    console.log("Abonnements de pages : La Brasa, Sud Cars, Roues Libres 66 ou Damien_66 absents, rien.");
    return;
  }
  const follow = (follower: Page | { kind: "user"; id: string }, target: Page) =>
    db
      .insert(t.pageFollows)
      .values({ followerKind: follower.kind, followerId: follower.id, targetKind: target.kind, targetId: target.id })
      .onConflictDoNothing();
  const brasaPage: Page = { kind: "provider", id: brasa.id };
  const sudPage: Page = { kind: "media", id: sudCars.id };
  const rouesPage: Page = { kind: "structure", id: rouesLibres.id };
  await follow(brasaPage, rouesPage);
  await follow(brasaPage, sudPage);
  await follow(rouesPage, brasaPage);
  await follow({ kind: "user", id: damien.userId }, brasaPage);
  await follow({ kind: "user", id: damien.userId }, sudPage);

  // Une story vivante de chaque page, signée de la page (jamais du compte de son titulaire).
  const at = new Date();
  const live = async (column: typeof t.stories.providerId | typeof t.stories.mediaId, id: string) =>
    Boolean(
      await db.query.stories.findFirst({
        where: and(eq(column, id), isNull(t.stories.deletedAt), gt(t.stories.expiresAt, at)),
      }),
    );
  const shots = [
    {
      holder: brasa.userId,
      persona: "provider" as const,
      page: brasaPage,
      done: await live(t.stories.providerId, brasa.id),
      caption: "Le brasero est chaud : on vous attend au Lydia !",
    },
    {
      holder: sudCars.userId,
      persona: "media" as const,
      page: sudPage,
      done: await live(t.stories.mediaId, sudCars.id),
      caption: "Les premières images du Lydia arrivent.",
    },
  ];
  let i = 0;
  let made = 0;
  for (const shot of shots) {
    i++;
    if (shot.done) continue;
    const who = await viewerOfUser(shot.holder);
    const photo = await reviewedNoPlateCar(i + 8);
    if (!who || !photo) continue;
    try {
      const up = await uploadsService.upload(
        who,
        "story",
        new File([new Uint8Array(photo.data)], photo.name, { type: "image/webp" }),
      );
      const created = await storiesService.create(who, {
        uploadKey: up.key,
        noPlateConfirmed: true,
        persona: shot.persona,
        audience: "public",
        caption: shot.caption,
        tags: [],
      } as never);
      // « Dans 19 h » : créée il y a 5 h, après celles des autres dans la barre (rien ne décale l'ordre du seed existant).
      await db.execute(
        sql`update stories set created_at = now() - interval '5 hours', expires_at = now() + interval '19 hours', updated_at = now()
          where id = ${created.id}`,
      );
      made++;
    } catch (error) {
      // Titulaire suspendu ou banni (403), page suspendue, limite atteinte : la graine continue sans cette story.
      if (error instanceof AppError && [403, 404, 409, 429].includes(error.status)) {
        console.log(`Abonnements de pages : story de ${shot.persona} non posée (${error.status}).`);
        continue;
      }
      throw error;
    }
  }
  await seedPageFeed({ brasa, sudCars, rouesLibres });
  await notificationsService.flush();
  console.log(
    `Abonnements de pages : La Brasa, Sud Cars et Roues Libres 66 (5 liens), ${made} story(ies) de page ajoutée(s).`,
  );
}

/**
 * Lot R9a, partie 2 : de quoi lire le Fil de La Brasa (« Abonnements » non vide : publications de Roues Libres 66 et de Sud Cars,
 * un rail) et les commentaires en casquette (Roues Libres 66 commente une publication de Kenji_66, La Brasa lui répond).
 * Rejouable : une publication de Sud Cars, une flamme par compte, un commentaire par casquette (identifiants d'envoi fixes).
 */
/** Identifiant d'envoi fixe du premier commentaire du seed (le rejeu retrouve ainsi sa publication). */
const FIRST_COMMENT_ID = "00000000-0000-4000-8000-0000000009a1";
const SECOND_COMMENT_ID = "00000000-0000-4000-8000-0000000009a2";

async function seedPageFeed(pages: {
  brasa: { id: string; userId: string };
  sudCars: { id: string; userId: string };
  rouesLibres: { id: string };
}) {
  const at = Date.now();
  // Une publication de Sud Cars (média), avec une photo du seed relue « aucune plaque lisible ».
  if (!(await db.query.feedPosts.findFirst({ where: eq(t.feedPosts.mediaId, pages.sudCars.id) }))) {
    const id = crypto.randomUUID();
    const createdAt = new Date(at - 3 * 3_600_000);
    await db.insert(t.feedPosts).values({
      id,
      authorId: pages.sudCars.userId,
      persona: "media",
      mediaId: pages.sudCars.id,
      caption: "Les premières images du plateau arrivent dans l'album du Lydia.",
      department: "66",
      createdAt,
      updatedAt: createdAt,
    });
    if (!(await storeFeedPhoto(id, 9))) await db.delete(t.feedPosts).where(eq(t.feedPosts.id, id));
  }
  // Le rail « Ça plaît en ce moment » : trois flammes de comptes de la graine sur la plus récente des trois publications du seed de
  // Roues Libres 66 (journal du Lydia, identifiants fixes), jamais sur une publication réelle ; rien n'est refait si une de ces
  // flammes existe déjà.
  const [orgaPost] = await db
    .select()
    .from(t.feedPosts)
    .where(and(isNull(t.feedPosts.deletedAt), isSeedPost(LYDIA_ORGA_POSTS)))
    .orderBy(sql`${t.feedPosts.createdAt} desc`)
    .limit(1);
  if (orgaPost) {
    const fans = await db
      .select({ userId: t.profiles.userId })
      .from(t.profiles)
      .where(
        and(sql`lower(${t.profiles.pseudo}) in ('kenji_66', 'lea_11', 'marc_66')`, isSeedAccount(t.profiles.userId)),
      );
    const flamed = await db
      .select({ userId: t.feedPostReactions.userId })
      .from(t.feedPostReactions)
      .where(eq(t.feedPostReactions.postId, orgaPost.id));
    const done = fans.some((f) => flamed.some((r) => r.userId === f.userId));
    if (!done) {
      for (const f of fans) {
        await db.insert(t.feedPostReactions).values({ postId: orgaPost.id, userId: f.userId }).onConflictDoNothing();
      }
      await db.execute(
        sql`update feed_posts set reactions_count = (select count(*)::int from feed_post_reactions where post_id = ${orgaPost.id}) where id = ${orgaPost.id}`,
      );
    }
  }
  // Roues Libres 66 (son propriétaire, second facteur) commente une publication de Kenji_66, La Brasa lui répond.
  const owner = await db.query.structureMembers.findFirst({
    where: and(eq(t.structureMembers.structureId, pages.rouesLibres.id), eq(t.structureMembers.role, "owner")),
  });
  const sarah = owner ? await viewerOfUser(owner.userId, "totp") : null;
  const sofia = await viewerOfUser(pages.brasa.userId);
  if (!sarah || !sofia) return;
  // Rejeu : un commentaire du seed qui existe déjà (supprimé ou non) n'est jamais reposé ni rappelé par le service (supprimé : 409 ;
  // publication supprimée ou compte devenu privé : 404). La publication visée est celle du seed (légende), jamais « la dernière de
  // Kenji_66 » ; si elle manque ou est supprimée, rien n'est reporté sur une autre.
  const exists = (authorId: string, clientId: string) =>
    db.query.feedPostComments.findFirst({
      where: and(eq(t.feedPostComments.authorId, authorId), eq(t.feedPostComments.clientId, clientId)),
    });
  const already = await exists(sarah.user.id, FIRST_COMMENT_ID);
  const replied = await exists(sofia.user.id, SECOND_COMMENT_ID);
  if (already && replied) return;
  const kenji = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'kenji_66'` });
  // Publication de la graine seulement (identifiant fixe, ou légende et auteur pour une base posée avant `SEED_ADOPT_BEFORE`).
  const [post] = kenji
    ? await db
        .select()
        .from(t.feedPosts)
        .where(
          and(
            eq(t.feedPosts.authorId, kenji.userId),
            already ? eq(t.feedPosts.id, already.postId) : isSeedPost([KENJI_RECENT_POST]),
          ),
        )
        .limit(1)
    : [];
  if (!post || post.deletedAt) return;
  try {
    const first = already
      ? { id: already.id }
      : await feedCommentsService.create(
          sarah,
          post.id,
          {
            text: "Merci d'être venu ! On vous garde une place au prochain rassemblement.",
            clientId: FIRST_COMMENT_ID,
          },
          { kind: "structure", id: pages.rouesLibres.id, key: `s:${pages.rouesLibres.id}` },
        );
    if (!replied) {
      await feedCommentsService.create(
        sofia,
        post.id,
        { text: "Et le brasero vous attend aussi !", clientId: SECOND_COMMENT_ID, parentId: first.id },
        { kind: "provider", id: pages.brasa.id, key: `v:${pages.brasa.id}` },
      );
    }
  } catch (error) {
    // Publication devenue illisible (compte de Kenji_66 privé ou suspendu) ou commentaire parent supprimé : la graine continue.
    if (error instanceof AppError && [403, 404, 409, 429].includes(error.status)) {
      console.log(
        `Commentaires de pages : publication ou commentaire du seed indisponible (${error.status}), rien ajouté.`,
      );
      return;
    }
    throw error;
  }
}
