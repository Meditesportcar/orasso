// Lot 46 : prestataires v2 (prototype DA v2 : `s-missions`, `s-pcand`, `s-vitrine`). Sofia_66 tient le food truck
// « La Brasa » (grillades catalanes, menu de 4 plats, 16 A, 6 m de façade, pas d'eau, 80 km, zone 66 puis 11).
// Besoins : Nocturne de Canet (1 food truck, comblé par La Brasa, emplacement B2, arrivée 16 h), Expo Rivesaltes
// (2 food trucks, 1 comblé par La Caravane de Léa, électricité et eau ; La Brasa en attente), Rasso du lac (1 food truck,
// pas d'électricité, groupe autorisé), Salon auto rétro (2 food trucks). Deux événements passés avec l'avis de
// MéditeSportCar : Béziers Night (5/5) et C&C Narbonne (5/5 : le 4,8 du prototype arrondi, l'échelle est entière).
// `GET /missions?trade=food_truck` pour Sofia : 3 événements, dont « 1 place sur 2 » à Rivesaltes. Idempotent.
import { type MenuItem, parseMenuLines, vendorTypeLabels } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { withTx } from "../../src/lib/tx";
import { accessService } from "../../src/modules/access/service";
import { createAccount, createEvent, DAY, fakePhoto, now, parisAt } from "./helpers";

const MENU = parseMenuLines(
  ["Bocata de botifarra · 9 €", "Brochettes catalanes · 11 €", "Frites maison · 4 €", "Crema catalana · 4 €"].join(
    "\n",
  ),
).items satisfies MenuItem[];

export async function seedMissions(hash: string) {
  if (await db.query.providerProfiles.findFirst({ where: eq(t.providerProfiles.name, "La Brasa") })) {
    console.log("Missions des prestataires déjà présentes.");
    return;
  }
  const damien = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'damien_66'` });
  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  const nocturne = await db.query.events.findFirst({ where: eq(t.events.slug, "nocturne-de-canet-2026") });
  const expo = await db.query.events.findFirst({ where: eq(t.events.slug, "expo-rivesaltes-2026") });
  const caravane = await db.query.providerProfiles.findFirst({
    where: eq(t.providerProfiles.name, "La Caravane de Léa"),
  });
  if (!damien || !structure || !nocturne || !expo || !caravane) {
    throw new Error("Base de départ incomplète pour les missions (seed des prestataires d'abord)");
  }

  // --- Sofia et La Brasa ---------------------------------------------------------------------------------------
  const sofia = await createAccount(hash, {
    pseudo: "Sofia_66",
    email: "sofia@orasso.local",
    firstName: "Sofia",
    lastName: "Ferrer",
    departments: ["66", "11"],
  });
  const [brasa] = await db
    .insert(t.providerProfiles)
    .values({
      userId: sofia.id,
      type: "food_truck",
      name: "La Brasa",
      description: "Grillades catalanes au feu de bois : bocatas, brochettes, frites maison et crema catalana.",
      phone: "06 22 33 44 55",
      email: "sofia@orasso.local",
      instagram: "@labrasa.66",
      departments: ["66", "11"],
      trades: ["food_truck"],
      tagline: "Grillades catalanes",
      teamSize: 2,
      menu: MENU,
      powerNeed: "a16",
      frontageM: 6,
      waterNeed: false,
      radiusKm: 80,
    })
    .returning();
  if (!brasa) throw new Error("La Brasa");
  for (let i = 0; i < 2; i++) {
    const key = `seed/providers/la-brasa-${i}.webp`;
    await fakePhoto(key, i === 0 ? "#b5452a" : "#d4a017");
    await db.insert(t.providerPhotos).values({ providerId: brasa.id, storageKey: key, position: i });
  }

  // --- Événements qui cherchent un food truck ---------------------------------------------------------------------
  const lac = await createEvent(structure.id, damien.userId, {
    title: "Rasso du lac",
    slug: "rasso-du-lac-2026",
    format: "night",
    description: "Rassemblement nocturne au bord du lac de Villeneuve-de-la-Raho.",
    startsAt: parisAt(26, 19),
    endsAt: parisAt(26, 23, 30),
    addressLine: "Parking du lac",
    postalCode: "66180",
    city: "Villeneuve-de-la-Raho",
    department: "66",
    lat: 42.6406,
    lng: 2.9036,
    capacity: 80,
    vendorTypes: ["Food truck"],
  });
  const salon = await createEvent(structure.id, damien.userId, {
    title: "Salon auto rétro",
    slug: "salon-auto-retro-2026",
    format: "exhibition",
    description: "Salon des anciennes et youngtimers sur l'esplanade d'Argelès-sur-Mer.",
    startsAt: parisAt(40, 10),
    endsAt: parisAt(40, 19),
    addressLine: "Esplanade Charles-Trenet",
    postalCode: "66700",
    city: "Argelès-sur-Mer",
    department: "66",
    lat: 42.5461,
    lng: 3.0239,
    capacity: 120,
    vendorTypes: ["Food truck"],
  });
  const withFoodTruck = (vendorTypes: string[]) =>
    vendorTypes.includes(vendorTypeLabels.food_truck) ? vendorTypes : [...vendorTypes, vendorTypeLabels.food_truck];
  await db
    .update(t.events)
    .set({ vendorTypes: withFoodTruck(nocturne.vendorTypes) })
    .where(eq(t.events.id, nocturne.id));
  await db
    .update(t.events)
    .set({ vendorTypes: withFoodTruck(expo.vendorTypes) })
    .where(eq(t.events.id, expo.id));

  const need = async (eventId: string, values: Partial<typeof t.eventNeeds.$inferInsert>) => {
    const [row] = await db
      .insert(t.eventNeeds)
      .values({ eventId, trade: "food_truck", ...values })
      .returning();
    if (!row) throw new Error("besoin");
    return row;
  };
  const nocturneNeed = await need(nocturne.id, { quantity: 1, power: "a16", installAt: parisAt(2, 16) });
  const expoNeed = await need(expo.id, { quantity: 2, power: "a16", water: true, installAt: parisAt(10, 8) });
  await need(lac.id, {
    quantity: 1,
    power: "generator_ok",
    notes: "Pas de raccordement : groupe silencieux autorisé.",
  });
  await need(salon.id, { quantity: 2, power: "none" });

  // --- Événements passés (avis) -------------------------------------------------------------------------------
  const past = async (title: string, slug: string, daysAgo: number, place: Partial<typeof t.events.$inferInsert>) => {
    const startsAt = parisAt(-daysAgo, place.format === "cars_and_coffee" ? 9 : 19);
    return createEvent(structure.id, damien.userId, {
      title,
      slug,
      format: "night",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 4 * 3_600_000),
      publishedAt: new Date(startsAt.getTime() - 30 * DAY),
      registrationsOpenAt: new Date(startsAt.getTime() - 25 * DAY),
      settledAt: new Date(startsAt.getTime() + 2 * DAY),
      vendorTypes: ["Food truck"],
      ...place,
    });
  };
  const beziers = await past("Béziers Night", "beziers-night-2026", 51, {
    city: "Béziers",
    postalCode: "34500",
    department: "34",
    lat: 43.344,
    lng: 3.2158,
    addressLine: "Parking des arènes",
  });
  const narbonne = await past("C&C Narbonne", "c-et-c-narbonne-2026", 99, {
    format: "cars_and_coffee",
    city: "Narbonne",
    postalCode: "11100",
    department: "11",
    lat: 43.1839,
    lng: 3.0035,
    addressLine: "Parking du Palais du Travail",
  });

  // --- Candidatures de prestataires ---------------------------------------------------------------------------
  const apply = async (
    event: { id: string },
    userId: string,
    providerProfileId: string,
    status: "pending" | "accepted",
    createdAt: Date,
    extra: Partial<typeof t.applications.$inferInsert> = {},
  ) => {
    const [row] = await db
      .insert(t.applications)
      .values({
        eventId: event.id,
        userId,
        kind: "provider",
        providerProfileId,
        status,
        rulesAcceptedAt: createdAt,
        followStructure: false,
        decidedAt: status === "accepted" ? new Date(createdAt.getTime() + DAY) : null,
        decidedBy: status === "accepted" ? damien.userId : null,
        createdAt,
        ...extra,
      })
      .returning();
    if (!row) throw new Error("candidature prestataire");
    await db.insert(t.applicationEvents).values([
      {
        applicationId: row.id,
        fromStatus: null,
        toStatus: "pending",
        actor: "user",
        actorUserId: userId,
        at: createdAt,
      },
      ...(status === "accepted"
        ? [
            {
              applicationId: row.id,
              fromStatus: "pending" as const,
              toStatus: "accepted" as const,
              actor: "organizer" as const,
              actorUserId: damien.userId,
              at: new Date(createdAt.getTime() + DAY),
            },
          ]
        : []),
    ]);
    return row;
  };

  const brasaNocturne = await apply(nocturne, sofia.id, brasa.id, "accepted", new Date(now.getTime() - 8 * DAY), {
    needId: nocturneNeed.id,
    spotLabel: "B2",
    spotNote: "Allée centrale, prise 16 A au poteau.",
  });
  await withTx(async (tx) => void (await accessService.issue(tx, brasaNocturne)));
  const caravaneExpo = await apply(expo, caravane.userId, caravane.id, "accepted", new Date(now.getTime() - 4 * DAY), {
    needId: expoNeed.id,
  });
  await withTx(async (tx) => void (await accessService.issue(tx, caravaneExpo)));
  await apply(expo, sofia.id, brasa.id, "pending", new Date(now.getTime() - DAY), { needId: expoNeed.id });

  const reviews = [
    { event: beziers, rating: 5, comment: "Service rapide jusqu'à la fin, file bien gérée. On la reprend." },
    { event: narbonne, rating: 5, comment: "Très bonne file, menu adapté au matin." },
  ];
  for (const r of reviews) {
    const app = await apply(r.event, sofia.id, brasa.id, "accepted", new Date(r.event.startsAt.getTime() - 20 * DAY));
    await db.insert(t.providerReviews).values({
      providerProfileId: brasa.id,
      structureId: structure.id,
      eventId: r.event.id,
      applicationId: app.id,
      authorId: damien.userId,
      rating: r.rating,
      comment: r.comment,
      createdAt: new Date(r.event.endsAt.getTime() + DAY),
    });
  }
  console.log(
    "Missions : La Brasa (Sofia_66) retenue B2 sur la Nocturne, en attente à Rivesaltes (1 place sur 2), Rasso du lac et Salon auto rétro ouverts, 2 avis.",
  );
}
