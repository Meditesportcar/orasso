// Lot 29 : de quoi essayer l'Explorer (liste, carte, affinités, distance, filtres) : des structures, des événements et
// des pros répartis sur l'Aude (11), l'Hérault (34) et la Haute-Garonne (31) en plus des Pyrénées-Orientales (66), tous
// avec une position. Kenji suit « Club Audois Passion » et a des centres d'intérêt (JDM, sportive) : trié par affinités,
// l'événement du club suivi arrive devant. Idempotent : repère l'événement « rassemblement-narbonne ».
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { createAccount, createEvent, fakePhoto, now, parisAt } from "./helpers";

type Place = { city: string; postalCode: string; department: string; lat: number; lng: number };

const NARBONNE: Place = { city: "Narbonne", postalCode: "11100", department: "11", lat: 43.1839, lng: 3.0035 };
const CARCASSONNE: Place = { city: "Carcassonne", postalCode: "11000", department: "11", lat: 43.213, lng: 2.3491 };
const MONTPELLIER: Place = { city: "Montpellier", postalCode: "34000", department: "34", lat: 43.6108, lng: 3.8767 };
const BEZIERS: Place = { city: "Béziers", postalCode: "34500", department: "34", lat: 43.344, lng: 3.2158 };
const SETE: Place = { city: "Sète", postalCode: "34200", department: "34", lat: 43.402, lng: 3.6967 };
const TOULOUSE: Place = { city: "Toulouse", postalCode: "31000", department: "31", lat: 43.6047, lng: 1.4442 };
const MURET: Place = { city: "Muret", postalCode: "31600", department: "31", lat: 43.4606, lng: 1.3267 };
const PRADES: Place = { city: "Prades", postalCode: "66500", department: "66", lat: 42.6167, lng: 2.4167 };
const CERET: Place = { city: "Céret", postalCode: "66400", department: "66", lat: 42.4861, lng: 2.7467 };

export async function seedExplorer(hash: string) {
  if (await db.query.events.findFirst({ where: eq(t.events.slug, "rassemblement-narbonne") })) {
    console.log("Explorer : événements et pros déjà présents.");
    return;
  }
  const categories = new Map(
    (await db.select({ id: t.categories.id, slug: t.categories.slug }).from(t.categories)).map((c) => [c.slug, c.id]),
  );
  const cat = (...slugs: string[]) => ({
    categoryIds: slugs.flatMap((s) => (categories.get(s) ? [categories.get(s) as string] : [])),
    makeIds: [],
    countries: [],
    text: null,
  });

  // --- Structures : une par département, vérifiées ---------------------------------------------------------------
  const clubs = [
    {
      slug: "club-audois-passion",
      name: "Club Audois Passion",
      place: NARBONNE,
      owner: ["Club_Audois", "club-audois@orasso.local", "Hélène", "Roux"],
    },
    {
      slug: "herault-mecaniques",
      name: "Hérault Mécaniques",
      place: MONTPELLIER,
      owner: ["Herault_Meca", "herault-meca@orasso.local", "Thomas", "Gil"],
    },
    {
      slug: "toulouse-auto-retro",
      name: "Toulouse Auto Rétro",
      place: TOULOUSE,
      owner: ["Toulouse_Retro", "toulouse-retro@orasso.local", "Inès", "Cazal"],
    },
  ] as const;
  const structures = new Map<string, { id: string; ownerId: string }>();
  for (const club of clubs) {
    const [pseudo, email, firstName, lastName] = club.owner;
    const existing = await db.query.user.findFirst({ where: eq(t.user.email, email) });
    const owner = existing
      ? { id: existing.id }
      : await createAccount(hash, {
          pseudo,
          email,
          firstName,
          lastName,
          departments: [club.place.department],
        });
    const logoKey = `seed/explorer/${club.slug}-logo.webp`;
    await fakePhoto(logoKey, "#2b2f36");
    const [s] = await db
      .insert(t.structures)
      .values({
        slug: club.slug,
        kind: "association",
        name: club.name,
        description: `${club.name} : rassemblements et sorties en ${club.place.city} et alentours.`,
        city: club.place.city,
        postalCode: club.place.postalCode,
        department: club.place.department,
        lat: club.place.lat,
        lng: club.place.lng,
        departments: [club.place.department],
        verification: "verified",
        verifiedAt: now,
        logoKey,
        inviteToken: randomBytes(12).toString("base64url"),
        createdBy: owner.id,
      })
      .returning();
    if (!s) throw new Error("structure");
    await db
      .insert(t.structureMembers)
      .values({ structureId: s.id, userId: owner.id, role: "owner", status: "active", joinedAt: now });
    structures.set(club.slug, { id: s.id, ownerId: owner.id });
  }

  // --- Événements ------------------------------------------------------------------------------------------------
  const audois = structures.get("club-audois-passion");
  const herault = structures.get("herault-mecaniques");
  const toulouse = structures.get("toulouse-auto-retro");
  if (!audois || !herault || !toulouse) throw new Error("structures");
  const events = [
    {
      s: audois,
      title: "Rassemblement de Narbonne",
      slug: "rassemblement-narbonne",
      format: "gathering",
      place: NARBONNE,
      address: "Parking des Halles",
      day: 9,
      criteria: cat("jdm", "sportive"),
      description: "Rassemblement mensuel du Club Audois Passion : JDM, sportives et youngtimers.",
    },
    {
      s: audois,
      title: "Cars & Coffee de Carcassonne",
      slug: "cars-coffee-carcassonne",
      format: "cars_and_coffee",
      place: CARCASSONNE,
      address: "Esplanade Pierre Pasteur",
      day: 16,
      criteria: cat("ancienne"),
      description: "Café du dimanche matin au pied de la Cité.",
    },
    {
      s: herault,
      title: "Exposition de Béziers",
      slug: "exposition-beziers",
      format: "exhibition",
      place: BEZIERS,
      address: "Allées Paul Riquet",
      day: 12,
      criteria: cat("allemande", "youngtimer"),
      description: "Exposition de voitures allemandes et youngtimers.",
    },
    {
      s: herault,
      title: "Nocturne du port de Sète",
      slug: "nocturne-port-sete",
      format: "night",
      place: SETE,
      address: "Quai de Bosc",
      day: 21,
      criteria: cat("sportive"),
      description: "Soirée exposition sur le port.",
    },
    {
      s: herault,
      title: "Salon des mécaniques de Montpellier",
      slug: "salon-montpellier",
      format: "show",
      place: MONTPELLIER,
      address: "Parc des expositions",
      day: 33,
      criteria: cat("jdm", "allemande", "italienne"),
      description: "Salon de l'automobile de collection et de la préparation.",
    },
    {
      s: toulouse,
      title: "Journée portes ouvertes à Muret",
      slug: "portes-ouvertes-muret",
      format: "open_house",
      place: MURET,
      address: "Zone de la Ramée",
      day: 14,
      criteria: cat("francaise", "ancienne"),
      description: "Portes ouvertes du club : atelier, bourse aux pièces et balade.",
    },
    {
      s: toulouse,
      title: "Rassemblement de Toulouse",
      slug: "rassemblement-toulouse",
      format: "gathering",
      place: TOULOUSE,
      address: "Prairie des Filtres",
      day: 24,
      criteria: cat("youngtimer", "francaise"),
      description: "Grand rassemblement toulousain.",
    },
  ] as const;
  for (const e of events) {
    await createEvent(e.s.id, e.s.ownerId, {
      title: e.title,
      slug: e.slug,
      format: e.format,
      description: e.description,
      startsAt: parisAt(e.day, 9),
      endsAt: parisAt(e.day, 13),
      addressLine: e.address,
      postalCode: e.place.postalCode,
      city: e.place.city,
      department: e.place.department,
      lat: e.place.lat,
      lng: e.place.lng,
      capacity: 80,
      admission: "open",
      criteria: e.criteria,
    });
  }
  // Deux événements de plus dans les Pyrénées-Orientales (le seed de base n'en a que quelques-uns).
  const base = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  const damien = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'damien_66'` });
  if (base && damien) {
    for (const e of [
      { title: "Balade de Prades", slug: "balade-prades", place: PRADES, day: 11, address: "Place de la République" },
      {
        title: "Cars & Coffee de Céret",
        slug: "cars-coffee-ceret",
        place: CERET,
        day: 18,
        address: "Boulevard La Fayette",
      },
    ]) {
      await createEvent(base.id, damien.userId, {
        title: e.title,
        slug: e.slug,
        format: "cars_and_coffee",
        startsAt: parisAt(e.day, 9),
        endsAt: parisAt(e.day, 12),
        addressLine: e.address,
        postalCode: e.place.postalCode,
        city: e.place.city,
        department: e.place.department,
        lat: e.place.lat,
        lng: e.place.lng,
        capacity: 60,
        admission: "open",
        criteria: cat("francaise"),
      });
    }
  }

  // --- Affinités de démonstration : Kenji suit le club audois et aime les JDM et les sportives --------------------
  const kenji = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'kenji_66'` });
  if (kenji) {
    await db
      .insert(t.structureFollows)
      .values({ structureId: audois.id, userId: kenji.userId, source: "manual" })
      .onConflictDoNothing();
    const interests = ["jdm", "sportive"].flatMap((s) => (categories.get(s) ? [categories.get(s) as string] : []));
    if (interests.length) {
      await db
        .insert(t.profileInterests)
        .values(interests.map((categoryId) => ({ userId: kenji.userId, categoryId })))
        .onConflictDoNothing();
    }
  }

  // --- Pros : répartis sur les départements, avec adresse (ou zone d'intervention) --------------------------------
  const pros = [
    {
      account: ["Garage_Narbonne", "garage-narbonne@orasso.local", "Paul", "Servat", "11"],
      slug: "garage-des-corbieres",
      name: "Garage des Corbières",
      activities: ["garage", "inspection"],
      place: NARBONNE,
      address: "8 route de Lézignan",
      description: "Mécanique, diagnostic et contrôle pour anciennes et youngtimers.",
    },
    {
      account: ["Detailing_Herault", "detailing-herault@orasso.local", "Sonia", "Marti", "34"],
      slug: "detailing-herault",
      name: "Detailing Hérault",
      activities: ["detailing", "covering"],
      place: MONTPELLIER,
      address: "22 rue de la Jasse",
      description: "Detailing, polish et films de protection.",
    },
    {
      account: ["Pieces_Toulouse", "pieces-toulouse@orasso.local", "Rémi", "Lasserre", "31"],
      slug: "pieces-retro-toulouse",
      name: "Pièces Rétro Toulouse",
      activities: ["parts"],
      place: TOULOUSE,
      address: "14 chemin de Larramet",
      description: "Pièces d'origine et reproductions pour voitures françaises des années 70 à 90.",
    },
    {
      account: ["Carrosserie_Prades", "carrosserie-prades@orasso.local", "Laurent", "Py", "66"],
      slug: "carrosserie-du-conflent",
      name: "Carrosserie du Conflent",
      activities: ["bodywork", "tint"],
      place: PRADES,
      address: "3 avenue du Canigou",
      description: "Carrosserie, peinture et vitres teintées.",
    },
    {
      account: ["Pneus_Beziers", "pneus-beziers@orasso.local", "Cécile", "Alary", "34"],
      slug: "pneus-et-jantes-beziers",
      name: "Pneus et Jantes Béziers",
      activities: ["tyres"],
      place: BEZIERS,
      address: "40 avenue de Rhodes",
      description: "Pneus, jantes et géométrie.",
    },
  ] as const;
  for (const p of pros) {
    const [pseudo, email, firstName, lastName, department] = p.account;
    const existing = await db.query.user.findFirst({ where: eq(t.user.email, email) });
    const owner = existing
      ? { id: existing.id }
      : await createAccount(hash, { pseudo, email, firstName, lastName, departments: [department] });
    if (await db.query.proProfiles.findFirst({ where: eq(t.proProfiles.slug, p.slug) })) continue;
    const logoKey = `seed/explorer/${p.slug}-logo.webp`;
    await fakePhoto(logoKey, "#d4a017");
    await db.insert(t.proProfiles).values({
      slug: p.slug,
      ownerUserId: owner.id,
      name: p.name,
      description: p.description,
      activities: [...p.activities],
      addressLine: p.address,
      postalCode: p.place.postalCode,
      city: p.place.city,
      department: p.place.department,
      lat: p.place.lat,
      lng: p.place.lng,
      logoKey,
      publishedAt: now,
    });
  }
  console.log(
    "Explorer : 3 structures (Aude, Hérault, Haute-Garonne), 9 événements localisés, 5 pros ; Kenji suit Club Audois Passion.",
  );
}
