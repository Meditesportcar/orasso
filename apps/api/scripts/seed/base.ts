// Données de base (lot 05) : catégories, référentiel des véhicules, comptes du prototype, événements, candidatures.
// Code déplacé tel quel depuis `scripts/seed.ts` (lot 15) ; appelé par `seed.ts`.
import { randomBytes } from "node:crypto";
import { fromWallTime, type RefusalReason } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { vehicleReference } from "../../src/db/seed/vehicle-reference";
import { startJobs } from "../../src/jobs";
import { deps } from "../../src/lib/deps";
import { scheduleEventJobs } from "../../src/modules/events/jobs";
import { syncVehicleReference } from "../../src/modules/vehicles/reference-sync";
import {
  type AppStatus,
  apply,
  between,
  createAccount,
  createEvent,
  createVehicle,
  DAY,
  now,
  type Person,
  parisAt,
  pick,
  type Ref,
  rand,
  SMALL,
} from "./helpers";

// --- Catégories -------------------------------------------------------------------------------------------------
const CATEGORIES: [string, string, number | null][] = [
  ["youngtimer", "Youngtimer", 20],
  ["ancienne", "Ancienne", 30],
  ["jdm", "JDM", null],
  ["allemande", "Allemande", null],
  ["francaise", "Française", null],
  ["italienne", "Italienne", null],
  ["americaine", "Américaine", null],
  ["sportive", "Sportive", null],
  ["supercar", "Supercar", null],
  ["preparee", "Préparée", null],
  ["stance", "Stance", null],
  ["drift", "Drift", null],
  ["track-day", "Track day", null],
  ["origine", "Origine", null],
  ["4x4", "4x4", null],
  ["utilitaire", "Utilitaire", null],
  ["moto", "Moto", null],
];

async function seedCategories() {
  const rows = await db
    .insert(t.categories)
    .values(CATEGORIES.map(([slug, label, minVehicleAge], position) => ({ slug, label, minVehicleAge, position })))
    .returning();
  return new Map(rows.map((c) => [c.slug, c.id]));
}

/** Lot M1 : « Track day » et « Origine » (styles de l'artefact) ajoutés à la fin d'une base déjà semée ; sans effet sinon. */
export async function seedMissingCategories() {
  const existing = new Set((await db.select({ slug: t.categories.slug }).from(t.categories)).map((c) => c.slug));
  if (existing.size === 0) return; // base vide : seedCategories s'en charge
  const [{ max } = { max: 0 }] = await db
    .select({ max: sql<number>`coalesce(max(${t.categories.position}), -1)` })
    .from(t.categories);
  const missing = CATEGORIES.filter(([slug]) => ["track-day", "origine"].includes(slug) && !existing.has(slug));
  if (!missing.length) return;
  await db
    .insert(t.categories)
    .values(missing.map(([slug, label, minVehicleAge], i) => ({ slug, label, minVehicleAge, position: max + 1 + i })))
    .onConflictDoNothing();
  console.log(`Catégories ajoutées : ${missing.map(([slug]) => slug).join(", ")}.`);
}

// --- Référentiel véhicules (+ « Autre » à chaque niveau) -------------------------------------------------------

/**
 * Lot R3c : le référentiel complet arrive par `syncVehicleReference` (idempotente, aussi lancée au démarrage de l'API).
 * Les véhicules tirés au hasard du seed restent pris dans la liste de départ (`vehicleReference`), dans son ordre :
 * le seed de démonstration ne change pas avec l'enrichissement de la liste.
 */
async function seedReference() {
  await syncVehicleReference();
  const rows = await db
    .select({
      makeId: t.vehicleMakes.id,
      makeName: t.vehicleMakes.name,
      country: t.vehicleMakes.country,
      modelId: t.vehicleModels.id,
      modelName: t.vehicleModels.name,
      type: t.vehicleModels.vehicleType,
      generationId: t.vehicleGenerations.id,
      generationName: t.vehicleGenerations.name,
      yearFrom: t.vehicleGenerations.yearFrom,
      yearTo: t.vehicleGenerations.yearTo,
    })
    .from(t.vehicleGenerations)
    .innerJoin(t.vehicleModels, eq(t.vehicleModels.id, t.vehicleGenerations.modelId))
    .innerJoin(t.vehicleMakes, eq(t.vehicleMakes.id, t.vehicleModels.makeId));
  const index = new Map<string, Ref>();
  for (const r of rows) {
    index.set(`${r.makeName}|${r.modelName}|${r.generationName}`, {
      makeId: r.makeId,
      modelId: r.modelId,
      generationId: r.generationId,
      type: r.type,
      country: r.country,
      makeName: r.makeName,
      modelName: r.modelName,
      yearFrom: r.yearFrom,
      yearTo: r.yearTo,
    });
  }
  const find = (make: string, model: string, gen: string) => {
    const r = index.get(`${make}|${model}|${gen}`);
    if (!r) throw new Error(`Référentiel : ${make} ${model} ${gen} introuvable`);
    return r;
  };
  const refs = vehicleReference.flatMap((make) =>
    make.models.flatMap((model) => model.generations.map((g) => find(make.name, model.name, g.name))),
  );
  const makes = new Set(rows.map((r) => r.makeId)).size;
  console.log(`Référentiel : ${makes} marques.`);
  return { refs, find };
}
export async function seedBase(hash: string) {
  const categories = await seedCategories();
  const { refs, find } = await seedReference();

  // Comptes nommés (prototype validé).
  const damien = await createAccount(
    hash,
    {
      pseudo: "Damien_66",
      email: "damien@orasso.local",
      firstName: "Damien",
      lastName: "Caron",
      departments: ["66"],
      phone: "06 00 00 00 66",
    },
    { platformRole: "super_admin", pointsSeason: 340, grade: "sport" },
  );
  const named = {
    sarah: await createAccount(hash, {
      pseudo: "Sarah_66",
      email: "sarah@orasso.local",
      firstName: "Sarah",
      lastName: "Martin",
      departments: ["66"],
    }),
    kenji: await createAccount(
      hash,
      {
        pseudo: "Kenji_66",
        email: "kenji@orasso.local",
        firstName: "Kenji",
        lastName: "Moreau",
        departments: ["66"],
        phone: "06 11 22 33 44",
      },
      { pointsSeason: 120, grade: "route" },
    ),
    lea: await createAccount(hash, {
      pseudo: "Lea_11",
      email: "lea@orasso.local",
      firstName: "Léa",
      lastName: "Garcia",
      departments: ["11"],
    }),
    nina: await createAccount(hash, {
      pseudo: "Nina_34",
      email: "nina@orasso.local",
      firstName: "Nina",
      lastName: "Roux",
      departments: ["34"],
    }),
    marc: await createAccount(hash, {
      pseudo: "Marc_66",
      email: "marc@orasso.local",
      firstName: "Marc",
      lastName: "Vidal",
      departments: ["66"],
    }),
    julie: await createAccount(hash, {
      pseudo: "Julie_66",
      email: "julie@orasso.local",
      firstName: "Julie",
      lastName: "Puig",
      departments: ["66"],
    }),
    theo: await createAccount(hash, {
      pseudo: "Theo_66",
      email: "theo@orasso.local",
      firstName: "Théo",
      lastName: "Ferrer",
      departments: ["66"],
    }),
  };

  // Structure MéditeSportCar (vérifiée), propriétaire Damien.
  const [structure] = await db
    .insert(t.structures)
    .values({
      slug: "meditesportcar",
      kind: "association",
      name: "MéditeSportCar",
      description:
        "Association de passionnés automobiles des Pyrénées-Orientales : rassemblements, expositions et nocturnes.",
      addressLine: "Port de Canet",
      postalCode: "66140",
      city: "Canet-en-Roussillon",
      department: "66",
      lat: 42.7055,
      lng: 3.0345,
      departments: ["66", "11"],
      socials: { instagram: "https://www.instagram.com/meditesportcar/" },
      verification: "verified",
      verifiedAt: now,
      badgeExpiresAt: new Date(now.getTime() + 365 * DAY),
      inviteToken: randomBytes(12).toString("base64url"),
      createdBy: damien.id,
    })
    .returning();
  if (!structure) throw new Error("structure");
  const member = (
    userId: string,
    role: "owner" | "co_organizer" | "staff",
    staffRoles: string[] = [],
    canDecide = false,
  ) => ({
    structureId: structure.id,
    userId,
    role,
    staffRoles,
    canDecide,
    status: "active" as const,
    joinedAt: now,
  });
  await db
    .insert(t.structureMembers)
    .values([
      member(damien.id, "owner"),
      member(named.sarah.id, "co_organizer"),
      member(named.julie.id, "staff", ["scan", "super_staff"]),
      member(named.marc.id, "staff", ["control"]),
      member(named.nina.id, "staff", ["placement"]),
      member(named.theo.id, "staff", ["scan"]),
    ]);

  // Véhicules nommés.
  const nv = {
    supra: await createVehicle(named.kenji, find("Toyota", "Supra", "Mk4"), categories, {
      year: 1997,
      powerHp: 330,
      plate: "AB-123-CD",
      color: "Blanc",
      engine: "3.0 biturbo 2JZ-GTE",
    }),
    rx7: await createVehicle(named.lea, find("Mazda", "RX-7", "FD"), categories, {
      year: 1994,
      powerHp: 255,
      color: "Rouge",
    }),
    s2000: await createVehicle(named.nina, find("Honda", "S2000", "AP1"), categories, {
      year: 2001,
      powerHp: 240,
      color: "Jaune",
    }),
    gti: await createVehicle(named.marc, find("Peugeot", "205", "GTI"), categories, {
      year: 1990,
      powerHp: 130,
      engine: "1.9",
      color: "Rouge",
    }),
    e30: await createVehicle(named.julie, find("BMW", "Série 3", "E30"), categories, { year: 1989, powerHp: 170 }),
    golf: await createVehicle(named.theo, find("Volkswagen", "Golf", "Mk2"), categories, {
      year: 1988,
      powerHp: 112,
      engine: "1.8 GTI",
    }),
    s14: await createVehicle(damien, find("Nissan", "200SX", "S14"), categories, {
      year: 1996,
      powerHp: 250,
      color: "Gris",
    }),
    e36: await createVehicle(damien, find("BMW", "Série 3", "E36"), categories, { year: 1995, powerHp: 193 }),
  };
  await createVehicle(damien, find("Peugeot", "106", "Rallye"), categories, {
    year: 1997,
    status: "sold",
    plate: null,
  });

  // Comptes générés (départements 66 / 11 / 34 / 31), 1 ou 2 véhicules chacun.
  const generatedCount = SMALL ? 26 : 120;
  const generated: { person: Person; vehicles: Awaited<ReturnType<typeof createVehicle>>[] }[] = [];
  const cars = refs.filter((r) => r.type === "car");
  const motos = refs.filter((r) => r.type === "moto");
  for (let i = 1; i <= generatedCount; i++) {
    const pseudo = `Pilote_${String(i).padStart(3, "0")}`;
    const person = await createAccount(hash, {
      pseudo,
      email: `pilote${i}@orasso.local`,
      departments: [pick(["66", "66", "11", "34", "31"])],
    });
    const vehicles = [];
    const n = rand() < 0.6 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      if (i === 3 && k === 0)
        vehicles.push(await createVehicle(person, find("Autre", "Autre", "Autre"), categories, { year: 1979 }));
      else if (i === 5 && k === 0) vehicles.push(await createVehicle(person, pick(motos), categories, {}));
      else if (i === 7 && k === 0)
        vehicles.push(await createVehicle(person, pick(cars), categories, { unregistered: true }));
      else vehicles.push(await createVehicle(person, pick(cars), categories, { powerHp: between(90, 450) }));
    }
    generated.push({ person, vehicles });
  }

  // Nocturne de Canet : dans 6 jours (J-6, prochain accès de Kenji comme l'artefact), 19:00–23:00.
  const nocturne = await createEvent(structure.id, damien.id, {
    title: "Nocturne de Canet",
    slug: "nocturne-de-canet-2026",
    format: "night",
    description: "La nocturne de l'automne sur le port : JDM, youngtimers et sportives, jusqu'à 23 h.",
    startsAt: parisAt(6, 19),
    endsAt: parisAt(6, 23),
    addressLine: "Parking du port",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    department: "66",
    lat: 42.7046,
    lng: 3.0352,
    capacity: SMALL ? 30 : 150,
    maxVehiclesPerUser: 2,
    criteria: {
      categoryIds: ["jdm", "youngtimer", "sportive"].map((s) => categories.get(s) as string),
      makeIds: [],
      countries: [],
      text: "Véhicules préparés ou d'origine, en bon état. Photos récentes.",
    },
    previewHours: 24,
    lockOffsetMinutes: 120,
    rulesText:
      "Règlement type Orasso : respect du lieu et des riverains, aucun rodéo, aucun burn, l'équipe organisatrice peut exclure.",
    instructions:
      "Musique coupée à 22 h, respectez le voisinage.\nDéparts au pas, aucun burn, exclusion immédiate.\nTravaux sur la D81 : prévoyez 10 min de plus.",
  });
  const zones = await db
    .insert(t.eventZones)
    .values([
      { eventId: nocturne.id, code: "JDM", name: "JDM", capacity: 30, position: 1 },
      { eventId: nocturne.id, code: "YNG", name: "Youngtimer", capacity: 22, position: 2 },
      { eventId: nocturne.id, code: "SPT", name: "Sportive", capacity: 15, position: 3 },
      { eventId: nocturne.id, code: "LIB", name: "Libre", capacity: 40, position: 4 },
    ])
    .returning();
  const zoneFor = (v: { ref: Ref; year: number | null }) => {
    const code =
      v.ref.country === "JP"
        ? "JDM"
        : (v.year ?? 2020) <= now.getUTCFullYear() - 20
          ? "YNG"
          : rand() < 0.4
            ? "SPT"
            : "LIB";
    return zones.find((z) => z.code === code)?.id ?? null;
  };

  // Répartition des candidatures (prototype : 27 à trier, 116 retenus, 12 en liste d'attente, 9 refusés…).
  const plan: [AppStatus, number][] = SMALL
    ? [
        ["accepted", 20],
        ["pending", 5],
        ["waitlisted", 6],
        ["offered", 1],
        ["refused", 3],
        ["withdrawn", 1],
      ]
    : [
        ["accepted", 116],
        ["pending", 27],
        ["waitlisted", 12],
        ["offered", 1],
        ["refused", 9],
        ["withdrawn", 1],
      ];
  const candidates: { id: string; ownerId: string; ref: Ref; year: number | null }[] = [
    nv.supra,
    nv.s14,
    nv.e36,
    nv.rx7,
    nv.s2000,
    nv.gti,
    nv.e30,
    nv.golf,
    ...generated.flatMap((g) => g.vehicles),
  ];
  const reasons: RefusalReason[][] = [
    ["off_theme"],
    ["insufficient_photos"],
    ["full"],
    ["criteria_not_met"],
    ["off_theme", "insufficient_photos"],
  ];
  let cursor = 0;
  let minutes = 0;
  for (const [status, n] of plan) {
    for (let k = 0; k < n; k++) {
      const v = candidates[cursor++];
      if (!v) throw new Error("Pas assez de véhicules générés pour le plan de candidatures");
      minutes += between(5, 90);
      await apply(nocturne, v, status, {
        decidedBy: damien.id,
        zoneId: zoneFor(v),
        rank: k + 1,
        createdAt: new Date(now.getTime() - 14 * DAY + minutes * 60_000),
        reasons: status === "refused" ? pick(reasons) : [],
      });
    }
  }

  // Autres événements de la structure.
  const expo = await createEvent(structure.id, damien.id, {
    title: "Expo Rivesaltes",
    slug: "expo-rivesaltes-2026",
    format: "exhibition",
    description: "Exposition de youngtimers et d'anciennes devant la mairie.",
    startsAt: parisAt(10, 10),
    endsAt: parisAt(10, 18),
    addressLine: "Place de l'Europe",
    postalCode: "66600",
    city: "Rivesaltes",
    department: "66",
    lat: 42.769,
    lng: 2.8728,
    capacity: 40,
    admittedVehicleTypes: ["car"],
    registrationsOpenAt: new Date(now.getTime() - 3 * DAY),
  });
  const candc = await createEvent(structure.id, damien.id, {
    title: "C&C Perpignan",
    slug: "c-et-c-perpignan-2026",
    format: "cars_and_coffee",
    description: "Cars & coffee du dimanche matin, ouvert à tous.",
    startsAt: parisAt(17, 9),
    endsAt: parisAt(17, 12),
    addressLine: "Parking du Palais des congrès",
    postalCode: "66000",
    city: "Perpignan",
    department: "66",
    lat: 42.7016,
    lng: 2.8954,
    capacity: null,
    admission: "open",
    admittedVehicleTypes: ["car", "moto", "truck"],
  });
  await createEvent(structure.id, damien.id, {
    title: "Hivernale 2027",
    slug: "hivernale-2027",
    format: "gathering",
    startsAt: fromWallTime({ year: 2027, month: 1, day: 24, hour: 10, minute: 0 }),
    endsAt: fromWallTime({ year: 2027, month: 1, day: 24, hour: 17, minute: 0 }),
    city: "Font-Romeu",
    department: "66",
    status: "draft",
    publishedAt: null,
    registrationsOpenAt: fromWallTime({ year: 2026, month: 12, day: 1, hour: 12, minute: 0 }),
  });
  const rest = generated.flatMap((g) => g.vehicles.slice(0, 1)).filter((v) => v.ref.type === "car");
  for (const [i, v] of rest.slice(0, SMALL ? 6 : 25).entries()) {
    await apply(expo, v, i % 3 === 0 ? "pending" : "accepted", {
      decidedBy: damien.id,
      createdAt: new Date(now.getTime() - 2 * DAY + i * 600_000),
    });
  }
  for (const [i, v] of rest.slice(-12).entries()) {
    await apply(candc, v, "accepted", { decidedBy: damien.id, createdAt: new Date(now.getTime() - DAY + i * 600_000) });
  }

  // Tâches planifiées (verrouillage, rappels, expiration de l'offre en cours), comme à une vraie publication.
  const boss = await startJobs({ work: false });
  for (const e of [nocturne, expo, candc]) await scheduleEventJobs(e);
  const offered = await db.query.applications.findFirst({ where: eq(t.applications.status, "offered") });
  if (offered?.offeredAt && offered.offerExpiresAt) {
    await deps.jobs.send(
      "waitlist.offer-expire",
      { applicationId: offered.id, offeredAt: offered.offeredAt.toISOString() },
      offered.offerExpiresAt,
    );
  }
  await boss.stop({ graceful: true });

  const [count] = await db.execute<{ n: number }>(sql`select count(*)::int as n from applications`).then((r) => r.rows);
  console.log(
    `Seed de base : ${1 + Object.keys(named).length + generatedCount} comptes, ` +
      `${count?.n ?? 0} candidatures. Connexion : damien@orasso.local (super admin, propriétaire de MéditeSportCar).`,
  );
}
