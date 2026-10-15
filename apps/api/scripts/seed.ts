// Seed de démonstration (ARCHITECTURE.md § 7, étape 7), repris des données du prototype validé.
// Usage : pnpm db:seed [--reset] [--small]
//   --reset  vide les données (comptes compris) avant de recommencer ; sans lui, le seed ne fait rien s'il est déjà là.
//   --small  volumes réduits (Nocturne de Canet : 5 à trier, 20 retenus, 6 en liste d'attente, 3 refusés).
// Comptes de démonstration : mot de passe SEED_PASSWORD du .env (voir .env.example), e-mails en @orasso.local.
import { randomBytes, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { addDays, fromWallTime, normalizePlate, type RefusalReason, wallTime } from "@orasso/shared";
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";

import { db, pool } from "../src/db/client";
import * as t from "../src/db/schema";
import { vehicleReference } from "../src/db/seed/vehicle-reference";
import { startJobs } from "../src/jobs";
import { deps } from "../src/lib/deps";
import { slugify } from "../src/lib/slug";
import { dataDir, storage } from "../src/lib/storage";
import { scheduleEventJobs } from "../src/modules/events/jobs";
import type { EventRow } from "../src/modules/events/repo";
import { ensureProfile } from "../src/modules/profiles/service";

const args = new Set(process.argv.slice(2));
const RESET = args.has("--reset");
const SMALL = args.has("--small");
const PASSWORD = process.env.SEED_PASSWORD || "orasso-demo-2026";

// Hasard reproductible (mêmes données à chaque seed).
let seed = 66;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const now = new Date();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Jour J à hh:mm, heure de Paris, `days` jours après aujourd'hui. */
const parisAt = (days: number, hour: number, minute = 0) =>
  fromWallTime({ ...addDays(wallTime(now), days), hour, minute });

const TABLES = [
  "user",
  "categories",
  "vehicle_makes",
  "structures",
  "events",
  "email_outbox",
  "admin_audit_log",
  "notifications",
];

async function reset() {
  await db.execute(sql.raw(`truncate ${TABLES.map((x) => `"${x}"`).join(", ")} cascade`));
  const boss = await db.execute(
    sql`select 1 from information_schema.tables where table_schema = 'pgboss' and table_name = 'job'`,
  );
  if (boss.rows.length) {
    await db.execute(sql`delete from pgboss.job where name like 'event.%' or name like 'waitlist.%'`);
  }
  await rm(join(dataDir, "storage", "seed"), { recursive: true, force: true });
  console.log("Données vidées.");
}

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

// --- Référentiel véhicules (+ « Autre » à chaque niveau) -------------------------------------------------------
type Ref = {
  makeId: string;
  modelId: string;
  generationId: string | null;
  type: "car" | "moto" | "truck";
  country: string | null;
  makeName: string;
  modelName: string;
  yearFrom: number | null;
  yearTo: number | null;
};

async function seedReference() {
  const refs: Ref[] = [];
  const index = new Map<string, Ref>();
  const all = [...vehicleReference, { name: "Autre", country: "", models: [] }];
  const makes = await db
    .insert(t.vehicleMakes)
    .values(
      all.map((m) => ({
        name: m.name,
        slug: slugify(m.name),
        country: m.country || null,
        isOther: m.name === "Autre",
      })),
    )
    .returning();
  for (const [i, make] of makes.entries()) {
    const source = all[i];
    if (!source) continue;
    const models = await db
      .insert(t.vehicleModels)
      .values([
        ...source.models.map((m) => ({ makeId: make.id, name: m.name, slug: slugify(m.name), vehicleType: m.type })),
        { makeId: make.id, name: "Autre", slug: "autre", vehicleType: "car" as const, isOther: true },
      ])
      .returning();
    for (const [j, model] of models.entries()) {
      const gens = source.models[j]?.generations ?? [];
      const genRows = await db
        .insert(t.vehicleGenerations)
        .values([
          ...gens.map((g) => ({ modelId: model.id, name: g.name, yearFrom: g.yearFrom, yearTo: g.yearTo })),
          { modelId: model.id, name: "Autre", isOther: true },
        ])
        .returning();
      for (const g of genRows) {
        const ref: Ref = {
          makeId: make.id,
          modelId: model.id,
          generationId: g.id,
          type: model.vehicleType,
          country: make.country,
          makeName: make.name,
          modelName: model.name,
          yearFrom: g.yearFrom,
          yearTo: g.yearTo,
        };
        index.set(`${make.name}|${model.name}|${g.name}`, ref);
        if (!g.isOther && !model.isOther) refs.push(ref);
      }
    }
  }
  const find = (make: string, model: string, gen: string) => {
    const r = index.get(`${make}|${model}|${gen}`);
    if (!r) throw new Error(`Référentiel : ${make} ${model} ${gen} introuvable`);
    return r;
  };
  console.log(`Référentiel : ${makes.length} marques.`);
  return { refs, find };
}

// --- Comptes ----------------------------------------------------------------------------------------------------
type Person = { id: string; pseudo: string };

async function createAccount(
  hash: string,
  p: { pseudo: string; email: string; firstName?: string; lastName?: string; departments: string[]; phone?: string },
  extra: Partial<typeof t.profiles.$inferInsert> = {},
): Promise<Person> {
  const id = randomUUID().replaceAll("-", "");
  await db.insert(t.user).values({ id, name: p.pseudo, email: p.email, emailVerified: true });
  await db
    .insert(t.account)
    .values({ id: randomUUID(), userId: id, accountId: id, providerId: "credential", password: hash });
  await ensureProfile({ id, name: p.pseudo });
  await db
    .update(t.profiles)
    .set({
      firstName: p.firstName ?? null,
      lastName: p.lastName ?? null,
      phone: p.phone ?? null,
      departments: p.departments,
      ...extra,
    })
    .where(eq(t.profiles.userId, id));
  return { id, pseudo: p.pseudo };
}

// --- Véhicules et photos factices ---------------------------------------------------------------------------------
const PALETTE = ["#d4a017", "#2b2f36", "#8a1c1c", "#1f4e79", "#e8e4da", "#3a5f3a", "#6b6f76", "#c0c0c0"];
let plateNo = 100;
const nextPlate = () => {
  const letters = "ABCDEFGHJKLMNPQRSTVWXYZ";
  const n = plateNo++;
  return `${letters[n % 23]}${letters[Math.floor(n / 23) % 23]}-${String(n).padStart(3, "0").slice(-3)}-${letters[(n * 7) % 23]}${letters[(n * 11) % 23]}`;
};

async function fakePhoto(key: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#17191C"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><rect x="250" y="420" width="700" height="160" rx="60" fill="#17191C" opacity="0.55"/><circle cx="400" cy="590" r="70" fill="#0d0e10"/><circle cx="800" cy="590" r="70" fill="#0d0e10"/></svg>`;
  const out = await sharp(Buffer.from(svg)).webp({ quality: 70 }).toBuffer({ resolveWithObject: true });
  await storage.put(key, out.data);
  return out.info;
}

async function createVehicle(
  owner: Person,
  ref: Ref,
  categories: Map<string, string>,
  v: {
    year?: number;
    powerHp?: number;
    plate?: string | null;
    status?: "active" | "sold";
    unregistered?: boolean;
    engine?: string;
    weightKg?: number;
    color?: string;
  },
) {
  const year = v.year ?? (ref.yearFrom ? between(ref.yearFrom, ref.yearTo ?? Math.min(ref.yearFrom + 6, 2025)) : 2005);
  const status = v.status ?? "active";
  const plate = v.unregistered || status !== "active" ? (v.plate ?? null) : (v.plate ?? nextPlate());
  const [row] = await db
    .insert(t.vehicles)
    .values({
      ownerId: owner.id,
      vehicleType: ref.type,
      makeId: ref.makeId,
      modelId: ref.modelId,
      generationId: ref.generationId,
      year,
      color: v.color ?? null,
      engine: v.engine ?? null,
      powerHp: v.powerHp ?? null,
      weightKg: v.weightKg ?? null,
      plate,
      plateNormalized: plate && !v.unregistered ? normalizePlate(plate) : null,
      unregistered: v.unregistered ?? false,
      status,
      archivedAt: status === "active" ? null : now,
    })
    .returning();
  if (!row) throw new Error("véhicule");
  const slugs = new Set<string>();
  const age = now.getUTCFullYear() - year;
  if (ref.type === "moto") slugs.add("moto");
  if (ref.type === "truck") slugs.add("utilitaire");
  const byCountry: Record<string, string> = {
    JP: "jdm",
    DE: "allemande",
    FR: "francaise",
    IT: "italienne",
    US: "americaine",
  };
  if (ref.country && byCountry[ref.country] && ref.type === "car") slugs.add(byCountry[ref.country] as string);
  if (age >= 30) slugs.add("ancienne");
  else if (age >= 20) slugs.add("youngtimer");
  if ((v.powerHp ?? 0) >= 200) slugs.add("sportive");
  const ids = [...slugs].flatMap((s) => (categories.get(s) ? [categories.get(s) as string] : []));
  if (ids.length)
    await db.insert(t.vehicleCategories).values(ids.map((categoryId) => ({ vehicleId: row.id, categoryId })));
  const photos = between(1, 3);
  for (let position = 1; position <= photos; position++) {
    const key = `seed/${row.id}-${position}.webp`;
    const info = await fakePhoto(key, pick(PALETTE));
    await db.insert(t.vehiclePhotos).values({
      vehicleId: row.id,
      position,
      storageKey: key,
      width: info.width,
      height: info.height,
      bytes: info.size,
    });
  }
  return { ...row, ref };
}

// --- Événements -------------------------------------------------------------------------------------------------
async function createEvent(
  structureId: string,
  createdBy: string,
  values: Partial<typeof t.events.$inferInsert> & {
    title: string;
    slug: string;
    format: (typeof t.events.$inferInsert)["format"];
    startsAt: Date;
    endsAt: Date;
  },
) {
  const [row] = await db
    .insert(t.events)
    .values({
      plateSalt: randomBytes(16),
      structureId,
      admittedVehicleTypes: ["car", "moto"],
      admission: "filtered",
      status: "published",
      publishedAt: new Date(now.getTime() - 20 * DAY),
      registrationsOpenAt: new Date(now.getTime() - 14 * DAY),
      createdBy,
      ...values,
    })
    .returning();
  if (!row) throw new Error("événement");
  return row;
}

type AppStatus = "pending" | "accepted" | "waitlisted" | "offered" | "refused" | "withdrawn";

async function apply(
  event: EventRow,
  vehicle: { id: string; ownerId: string },
  status: AppStatus,
  opts: { decidedBy: string; zoneId?: string | null; rank?: number; createdAt: Date; reasons?: RefusalReason[] },
) {
  const decided = status !== "pending";
  const [row] = await db
    .insert(t.applications)
    .values({
      eventId: event.id,
      userId: vehicle.ownerId,
      vehicleId: vehicle.id,
      status,
      rulesAcceptedAt: opts.createdAt,
      followStructure: true,
      companions: between(0, 2),
      decidedAt: decided ? new Date(opts.createdAt.getTime() + HOUR) : null,
      decidedBy: decided && status !== "withdrawn" ? opts.decidedBy : null,
      refusalReasons: opts.reasons ?? [],
      waitlistRank: status === "waitlisted" ? (opts.rank ?? null) : null,
      waitlistedAt: status === "waitlisted" || status === "offered" ? new Date(opts.createdAt.getTime() + HOUR) : null,
      offeredAt: status === "offered" ? now : null,
      offerExpiresAt: status === "offered" ? new Date(now.getTime() + 20 * HOUR) : null,
      withdrawnAt: status === "withdrawn" ? new Date(now.getTime() - DAY) : null,
      zoneId: status === "accepted" ? (opts.zoneId ?? null) : null,
      createdAt: opts.createdAt,
    })
    .returning();
  if (!row) throw new Error("candidature");
  const journal: (typeof t.applicationEvents.$inferInsert)[] = [
    {
      applicationId: row.id,
      fromStatus: null,
      toStatus: "pending",
      actor: "user",
      actorUserId: vehicle.ownerId,
      at: opts.createdAt,
    },
  ];
  const at = new Date(opts.createdAt.getTime() + HOUR);
  if (status === "offered") {
    journal.push({
      applicationId: row.id,
      fromStatus: "pending",
      toStatus: "waitlisted",
      actor: "organizer",
      actorUserId: opts.decidedBy,
      at,
    });
    journal.push({ applicationId: row.id, fromStatus: "waitlisted", toStatus: "offered", actor: "system", at: now });
  } else if (status === "withdrawn") {
    journal.push({
      applicationId: row.id,
      fromStatus: "pending",
      toStatus: "accepted",
      actor: "organizer",
      actorUserId: opts.decidedBy,
      at,
    });
    journal.push({
      applicationId: row.id,
      fromStatus: "accepted",
      toStatus: "withdrawn",
      actor: "user",
      actorUserId: vehicle.ownerId,
      at: new Date(now.getTime() - DAY),
    });
  } else if (status !== "pending") {
    journal.push({
      applicationId: row.id,
      fromStatus: "pending",
      toStatus: status,
      actor: "organizer",
      actorUserId: opts.decidedBy,
      at,
    });
  }
  await db.insert(t.applicationEvents).values(journal);
  await db
    .insert(t.structureFollows)
    .values({ structureId: event.structureId, userId: vehicle.ownerId, source: "application" })
    .onConflictDoNothing();
  return row;
}

// --- Programme ----------------------------------------------------------------------------------------------------
async function main() {
  if (RESET) await reset();
  else if (await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") })) {
    console.log("Seed déjà présent : rien à faire (pnpm db:seed --reset pour recommencer).");
    return;
  }
  const hash = await hashPassword(PASSWORD);
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

  // Nocturne de Canet : dans 2 jours, 19:00–23:00.
  const nocturne = await createEvent(structure.id, damien.id, {
    title: "Nocturne de Canet",
    slug: "nocturne-de-canet-2026",
    format: "night",
    description: "La nocturne de l'automne sur le port : JDM, youngtimers et sportives, jusqu'à 23 h.",
    startsAt: parisAt(2, 19),
    endsAt: parisAt(2, 23),
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
      "Règlement type Orasso : respect du lieu et des riverains, aucun rodéo, aucun burn, l'organisateur peut exclure.",
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
    `Seed terminé : ${1 + Object.keys(named).length + generatedCount} comptes, ` +
      `${count?.n ?? 0} candidatures. Connexion : damien@orasso.local (super admin, propriétaire de MéditeSportCar).`,
  );
}

try {
  await main();
} finally {
  await pool.end();
}
