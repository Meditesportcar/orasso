// Lot 14 : professionnels (annuaire, remises par grade) et billetterie.
// Code déplacé tel quel depuis `scripts/seed.ts` (lot 15) ; appelé par `seed.ts`.
import type { Grade } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { staffAccount } from "./day-j";
import { createEvent, fakePhoto, now, parisAt } from "./helpers";
import { putRealPhoto } from "./photos";

let proPhotoNo = 0;

// --- Professionnels et billetterie (lot 14) ------------------------------------------------------------------------

export async function seedPros(hash: string) {
  if (await db.query.proProfiles.findFirst({ where: eq(t.proProfiles.slug, "garage-du-port") })) {
    console.log("Professionnels déjà présents.");
    return;
  }
  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  if (!structure) throw new Error("Structure MéditeSportCar absente");
  const damien = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'damien_66'` });
  if (!damien) throw new Error("Compte Damien_66 absent");
  const kinds = [
    {
      account: ["Garage_Port", "garage@orasso.local", "Gilles", "Marty"],
      pro: {
        slug: "garage-du-port",
        name: "Garage du Port",
        activities: ["garage", "preparation"],
        description:
          "Mécanique générale, préparation moteur et réglages châssis pour youngtimers et sportives. Atelier à Canet depuis 2009.",
        addressLine: "12 avenue du Port",
        postalCode: "66140",
        city: "Canet-en-Roussillon",
        department: "66",
        lat: 42.7044,
        lng: 3.0105,
        phone: "04 68 00 12 34",
        email: "contact@garage-du-port.example",
        website: "https://garage-du-port.example",
        hours: {
          mon: "8h-12h / 14h-18h",
          tue: "8h-12h / 14h-18h",
          wed: "8h-12h / 14h-18h",
          thu: "8h-12h / 14h-18h",
          fri: "8h-12h / 14h-17h",
          sat: "9h-12h",
        },
        siret: "35600000000048",
        verifiedAt: now,
      },
      discounts: { rodage: 5, route: 8, sport: 10, circuit: 12, legende: 15 },
      color: "#d4a017",
      partner: true,
      post: {
        title: "Révision d'automne",
        body: "Contrôle des niveaux et des freins offert pour toute révision avant le 15 novembre.",
      },
    },
    {
      account: ["Atelier_Covering", "covering@orasso.local", "Chloé", "Vidal"],
      pro: {
        slug: "atelier-covering-66",
        name: "Atelier Covering 66",
        activities: ["covering", "detailing"],
        description: "Covering intégral ou partiel, films de protection, personnalisation.",
        addressLine: "5 rue des Artisans",
        postalCode: "66000",
        city: "Perpignan",
        department: "66",
        lat: 42.6887,
        lng: 2.8948,
        phone: "04 68 00 56 78",
        hours: { mon: "9h-18h", tue: "9h-18h", wed: "9h-18h", thu: "9h-18h", fri: "9h-18h" },
        siret: "35600000000049",
        verifiedAt: now,
      },
      discounts: { route: 5, sport: 8, legende: 12 },
      color: "#1f4e79",
      partner: false,
      post: null,
    },
    {
      account: ["Detailing_Pyrenees", "detailing@orasso.local", "Karim", "Benali"],
      pro: {
        slug: "detailing-pyrenees",
        name: "Detailing Pyrénées",
        activities: ["detailing"],
        description: "Detailing à domicile : lavage, polish, protection céramique. Je me déplace chez toi.",
        interventionDepartments: ["66", "11", "09"],
        phone: "06 00 00 00 00",
      },
      discounts: { sport: 10 },
      color: "#8a1c1c",
      partner: false,
      post: null,
    },
  ] as const;

  for (const k of kinds) {
    const [pseudo, email, firstName, lastName] = k.account;
    const owner = await staffAccount(hash, pseudo, email, firstName, lastName);
    const logoKey = `seed/pros/${k.pro.slug}-logo.webp`;
    await fakePhoto(logoKey, k.color);
    const [pro] = await db
      .insert(t.proProfiles)
      .values({
        ...(k.pro as unknown as Omit<typeof t.proProfiles.$inferInsert, "ownerUserId" | "activities">),
        activities: [...k.pro.activities],
        ownerUserId: owner.id,
        logoKey,
        publishedAt: now,
      })
      .returning();
    if (!pro) throw new Error("fiche pro");
    for (let i = 0; i < 3; i++) {
      const key = `seed/pros/${k.pro.slug}-${i}.webp`;
      await putRealPhoto(key, "car", proPhotoNo++);
      await db.insert(t.proPhotos).values({ proId: pro.id, storageKey: key, position: i });
    }
    for (const [grade, percent] of Object.entries(k.discounts)) {
      await db.insert(t.proDiscounts).values({ proId: pro.id, grade: grade as Grade, percent });
    }
    if (k.partner)
      await db.insert(t.proPartnerLinks).values({ proId: pro.id, structureId: structure.id, acceptedAt: now });
    if (k.post) await db.insert(t.proPosts).values({ proId: pro.id, ...k.post });
    // Quelques abonnés et des chiffres de départ pour les statistiques.
    const fans = await db.select({ id: t.profiles.userId }).from(t.profiles).limit(6);
    await db
      .insert(t.proFollows)
      .values(fans.filter((f) => f.id !== owner.id).map((f) => ({ proId: pro.id, userId: f.id })))
      .onConflictDoNothing();
  }

  // Événements avec billetterie : billets gratuits ouverts, billets payants « bientôt » (aucune clé Stripe).
  const free = await createEvent(structure.id, damien.userId, {
    title: "Cars & Coffee de la Plage",
    slug: "cars-and-coffee-plage",
    format: "cars_and_coffee",
    description: "Café, croissants et belles mécaniques sur le front de mer. Entrée gratuite sur réservation.",
    startsAt: parisAt(12, 9),
    endsAt: parisAt(12, 13),
    addressLine: "Promenade de la Plage",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    department: "66",
    lat: 42.7049,
    lng: 3.0359,
    capacity: 40,
    publicAccess: "free_reservation",
    ticketsEnabled: true,
  });
  await db.insert(t.ticketTypes).values({ eventId: free.id, name: "Entrée visiteur", capacity: 120, priceCents: 0 });
  const paid = await createEvent(structure.id, damien.userId, {
    title: "Nuit des Moteurs",
    slug: "nuit-des-moteurs",
    format: "night",
    description: "Soirée exposition sur le port. Billetterie payante en mode présentation.",
    startsAt: parisAt(26, 19),
    endsAt: parisAt(26, 23),
    addressLine: "Quai du Port",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    department: "66",
    lat: 42.7055,
    lng: 3.0103,
    capacity: 60,
    publicAccess: "paid_orasso",
    ticketsEnabled: true,
  });
  await db.insert(t.ticketTypes).values({ eventId: paid.id, name: "Entrée", capacity: 200, priceCents: 1200 });
  console.log(
    "Pros : 3 fiches (dont 2 vérifiées), billets gratuits (Cars & Coffee de la Plage), billets payants « bientôt » (Nuit des Moteurs).",
  );
}
