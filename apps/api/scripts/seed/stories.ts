// Lot R7f1 : six stories de démonstration, publiées par le vrai service (composition 9:16, floutage, notifications) à
// partir des photos du seed relues « aucune plaque lisible » (`NO_PLATE_REVIEWED`) : jamais une plaque lisible.
// Quatre auteurs : Kenji_66 (une « Mon abonnés » qui identifie Damien_66, une « Mon crew » de Roussillon Drift), Léa_11
// (publique), Marc_66 (compte privé), Théo_66, et Roues Libres 66 (casquette organisateur de Sarah_66, avec
// l'autocollant du Rassemblement du Lydia) ; lot R7h : une story publique de Kenji_66 avec ce même autocollant, qui
// identifie Roues Libres 66. Elles finissent dans 20 h. Idempotent : rien si des stories existent déjà.
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { notificationsService } from "../../src/modules/notifications/service";
import { storiesService } from "../../src/modules/stories/service";
import { uploadsService } from "../../src/modules/uploads/service";
import { reviewedNoPlateCar } from "./photos";

async function viewer(pseudo: string): Promise<Viewer | null> {
  const profile = await db.query.profiles.findFirst({
    where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}`,
  });
  if (!profile) return null;
  const [u] = await db.select().from(t.user).where(eq(t.user.id, profile.userId));
  return u ? { user: u as AuthUser, profile, session: { secondFactor: null } } : null;
}

export async function seedStories() {
  if (await db.query.stories.findFirst()) {
    console.log("Stories : déjà présentes.");
    return;
  }
  const [damien, kenji, lea, marc, theo, sarah] = await Promise.all(
    ["Damien_66", "Kenji_66", "Lea_11", "Marc_66", "Theo_66", "Sarah_66"].map(viewer),
  );
  if (!damien || !kenji || !lea || !marc || !theo || !sarah) {
    console.log("Stories : comptes absents, rien.");
    return;
  }
  const crew = await db.query.crews.findFirst({ where: eq(t.crews.slug, "roussillon-drift") });
  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") });
  const event = await db.query.events.findFirst({ where: eq(t.events.title, "Rassemblement du Lydia") });

  // Damien suit ceux dont on veut voir l'anneau dans sa barre.
  for (const who of [kenji, lea, marc, theo]) {
    await db
      .insert(t.userFollows)
      .values({ followerId: damien.user.id, followedId: who.user.id, status: "accepted", acceptedAt: new Date() })
      .onConflictDoNothing();
  }
  if (structure) {
    await db
      .insert(t.structureFollows)
      .values({ structureId: structure.id, userId: damien.user.id, source: "manual" })
      .onConflictDoNothing();
  }

  const shots: { who: Viewer; over: Record<string, unknown> }[] = [
    {
      who: kenji,
      over: {
        audience: "followers",
        caption: "Sortie du dimanche avec Damien !",
        placeLabel: "Canet-en-Roussillon",
        tags: [{ kind: "user", id: damien.user.id }],
      },
    },
    ...(crew
      ? [{ who: kenji, over: { audience: "crew", crewId: crew.id, caption: "Lavage du crew avant la balade" } }]
      : []),
    { who: lea, over: { audience: "public", caption: "Premier rassemblement de la saison", placeLabel: "Perpignan" } },
    { who: marc, over: { audience: "followers", caption: "Entre amis seulement" } },
    { who: theo, over: { audience: "followers", caption: "Le garage ce soir" } },
    ...(structure
      ? [
          {
            who: sarah,
            over: {
              audience: "public",
              persona: "organizer",
              structureId: structure.id,
              eventId: event?.id,
              caption: "Le Lydia vous attend, rangée JDM au fond !",
            },
          },
        ]
      : []),
    // Lot R7h : Kenji colle l'événement du Lydia sur une story publique, ce qui identifie Roues Libres 66 (l'organisateur
    // la retrouve dans « Mentions » et peut l'ajouter à sa story). Ajoutée en dernier pour ne pas décaler les photos.
    ...(event
      ? [{ who: kenji, over: { audience: "public", eventId: event.id, caption: "Le Lydia, c'est parti !" } }]
      : []),
  ];
  let i = 0;
  for (const { who, over } of shots) {
    const photo = await reviewedNoPlateCar(i++);
    if (!photo) continue;
    const up = await uploadsService.upload(
      who,
      "story",
      new File([new Uint8Array(photo.data)], photo.name, { type: "image/webp" }),
    );
    await storiesService.create(who, {
      uploadKey: up.key,
      noPlateConfirmed: true,
      persona: "fan",
      tags: [],
      ...over,
    } as never);
  }
  // « Dans 20 h » : créées il y a 4 h.
  await db.execute(
    sql`update stories set created_at = now() - interval '4 hours', expires_at = now() + interval '20 hours', updated_at = now()`,
  );
  await notificationsService.flush();
  console.log(`Stories : ${i} stories de démonstration (finissent dans 20 h).`);
}
