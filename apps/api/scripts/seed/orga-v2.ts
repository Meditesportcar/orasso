// Lot 52 : casquette Organisateur v2. (1) Un brouillon « Expo de printemps » auquel il manque l'adresse et l'affiche
// (« Il manque : adresse, affiche. »). (2) L'engagement de l'équipe de MéditeSportCar sur les événements passés, pour des
// bulles de tailles différentes (lot C5 : de 27 événements pour le plus assidu à 2 pour le plus récent, `TEAM_ENGAGEMENT`). (3) Une structure « en vérification » dont le
// propriétaire est Pres_Vallespir (la structure de Damien est validée : sceau tournant). Idempotent, en dernier :
// les affiches générées de tous les événements sont déjà passées, le brouillon reste sans affiche.
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { TEAM_ENGAGEMENT } from "./da-v2";
import { createAccount, createEvent, DAY, now } from "./helpers";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

export async function seedOrgaV2(hash: string) {
  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  const damien = await byPseudo("Damien_66");
  if (!structure || !damien) {
    console.log("Organisateur v2 : MéditeSportCar absente, rien ajouté.");
    return;
  }

  // Brouillon incomplet : ni adresse ni affiche.
  if (!(await db.query.events.findFirst({ where: eq(t.events.slug, "expo-de-printemps-2027") }))) {
    const startsAt = new Date(now.getTime() + 150 * DAY);
    await createEvent(structure.id, damien.userId, {
      title: "Expo de printemps",
      slug: "expo-de-printemps-2027",
      format: "exhibition",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
      status: "draft",
      publishedAt: null,
      registrationsOpenAt: new Date(startsAt.getTime() - 40 * DAY),
      city: null,
      addressLine: null,
      postalCode: null,
      department: null,
      capacity: 60,
    });
  }

  // Le seed des affiches (lot 47) tourne avant celui-ci mais repasse sur tout événement sans style : le brouillon doit
  // rester sans affiche, à chaque exécution.
  await db
    .update(t.events)
    .set({ posterStyle: null, posterPostKey: null, posterStoryKey: null, posterPhotoKey: null, posterTitle: null })
    .where(eq(t.events.slug, "expo-de-printemps-2027"));

  // Engagement de l'équipe : les événements passés de la structure (éditions du lot C5 comprises), tenus par chacun
  // un nombre de fois différent.
  const past = await db.query.events.findMany({
    where: sql`${t.events.structureId} = ${structure.id} and ${t.events.status} = 'published' and ${t.events.endsAt} < now()`,
    orderBy: [sql`${t.events.startsAt} desc`],
  });
  const crew = TEAM_ENGAGEMENT;
  let rows = 0;
  for (const [pseudo, count] of crew) {
    const person = await byPseudo(pseudo);
    if (!person) continue;
    for (const event of past.slice(0, count)) {
      const inserted = await db
        .insert(t.eventStaff)
        .values({ eventId: event.id, userId: person.userId, presence: "present", presenceUpdatedAt: event.startsAt })
        .onConflictDoNothing()
        .returning({ id: t.eventStaff.id });
      rows += inserted.length;
    }
  }

  // Structure en cours de vérification.
  if (!(await db.query.structures.findFirst({ where: eq(t.structures.slug, "ecurie-du-vallespir") }))) {
    const owner = await createAccount(hash, {
      pseudo: "Pres_Vallespir",
      email: "pres_vallespir@orasso.local",
      departments: ["66"],
    });
    const [created] = await db
      .insert(t.structures)
      .values({
        slug: "ecurie-du-vallespir",
        kind: "association",
        name: "Écurie du Vallespir",
        description: "Structure de démonstration du lot 52 (vérification en cours).",
        city: "Amélie-les-Bains",
        department: "66",
        departments: ["66"],
        verification: "pending",
        rna: "W662000001",
        inviteToken: randomBytes(12).toString("base64url"),
        createdBy: owner.id,
      })
      .returning();
    if (created) {
      await db
        .insert(t.structureMembers)
        .values({ structureId: created.id, userId: owner.id, role: "owner", status: "active", joinedAt: now });
    }
  }
  console.log(
    `Organisateur v2 : brouillon « Expo de printemps », ${rows} présence(s) passée(s), Écurie du Vallespir (en vérification).`,
  );
}
