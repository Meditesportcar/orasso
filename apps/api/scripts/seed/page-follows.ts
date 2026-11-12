// Lot R9a : les abonnements d'une casquette et les stories de page. La Brasa (prestataire de Sofia_66) suit Roues Libres 66 et
// Sud Cars ; Roues Libres 66 suit La Brasa ; Damien_66 suit La Brasa et Sud Cars (il retrouve leurs stories dans sa barre,
// sous leurs clés `v:` et `m:`) ; une story vivante de La Brasa et une de Sud Cars, publiées par le vrai service (composition,
// notifications) à partir des photos du seed relues « aucune plaque lisible ». Rejouable : rien n'est dupliqué, et une page
// qui a déjà une story vivante n'en reçoit pas une seconde. Le seed ne pose aucune notification ni compteur à la main.
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { notificationsService } from "../../src/modules/notifications/service";
import { storiesService } from "../../src/modules/stories/service";
import { uploadsService } from "../../src/modules/uploads/service";
import { reviewedNoPlateCar } from "./photos";

async function viewerOfUser(userId: string): Promise<Viewer | null> {
  const profile = await db.query.profiles.findFirst({ where: eq(t.profiles.userId, userId) });
  const [u] = await db.select().from(t.user).where(eq(t.user.id, userId));
  return profile && u ? { user: u as AuthUser, profile, session: { secondFactor: null } } : null;
}

type Page = { kind: "provider" | "media" | "structure"; id: string };

export async function seedPageFollows() {
  const brasa = await db.query.providerProfiles.findFirst({
    where: and(eq(t.providerProfiles.name, "La Brasa"), isNull(t.providerProfiles.deletedAt)),
  });
  const sudCars = await db.query.mediaProfiles.findFirst({
    where: and(eq(t.mediaProfiles.name, "Sud Cars"), isNull(t.mediaProfiles.deletedAt)),
  });
  const rouesLibres = await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") });
  const damien = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'damien_66'` });
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
  }
  await notificationsService.flush();
  console.log(
    `Abonnements de pages : La Brasa, Sud Cars et Roues Libres 66 (5 liens), ${made} story(ies) de page ajoutée(s).`,
  );
}
