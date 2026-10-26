// Outils communs du seed (hasard reproductible, dates, comptes, véhicules, événements, candidatures).
// Code déplacé tel quel depuis `scripts/seed.ts` (lot 15) ; appelé par `seed.ts`.
import { randomBytes, randomUUID } from "node:crypto";
import { addDays, fromWallTime, normalizePlate, type RefusalReason, wallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { storage } from "../../src/lib/storage";
import type { EventRow } from "../../src/modules/events/repo";
import { ensureProfile } from "../../src/modules/profiles/service";
import { putRealPhoto } from "./photos";

/** `--small` : volumes réduits (voir `seed.ts`). */
export const SMALL = process.argv.slice(2).includes("--small");

// Hasard reproductible (mêmes données à chaque seed).
let seed = 66;
export const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
export const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
export const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

export const now = new Date();
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** Jour J à hh:mm, heure de Paris, `days` jours après aujourd'hui. */
export const parisAt = (days: number, hour: number, minute = 0) =>
  fromWallTime({ ...addDays(wallTime(now), days), hour, minute });

// --- Référentiel véhicules : ligne choisie pour un véhicule ---------------------------------------------
export type Ref = {
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

// --- Comptes ----------------------------------------------------------------------------------------------------
export type Person = { id: string; pseudo: string };

export async function createAccount(
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
let plateNo = 100;
let vehiclePhotoNo = 0;
const nextPlate = () => {
  const letters = "ABCDEFGHJKLMNPQRSTVWXYZ";
  const n = plateNo++;
  return `${letters[n % 23]}${letters[Math.floor(n / 23) % 23]}-${String(n).padStart(3, "0").slice(-3)}-${letters[(n * 7) % 23]}${letters[(n * 11) % 23]}`;
};

export async function fakePhoto(key: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#17191C"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><rect x="250" y="420" width="700" height="160" rx="60" fill="#17191C" opacity="0.55"/><circle cx="400" cy="590" r="70" fill="#0d0e10"/><circle cx="800" cy="590" r="70" fill="#0d0e10"/></svg>`;
  const out = await sharp(Buffer.from(svg)).webp({ quality: 70 }).toBuffer({ resolveWithObject: true });
  await storage.put(key, out.data);
  return out.info;
}

export async function createVehicle(
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
  // Lot R5a, tour 2 : plus de « Moto » ni d'« Utilitaire » (en pause : le type le dit déjà).
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
    // Lot C6 : de vraies photos (JohnGRD Photographie), motos pour les motos, jamais deux fois la même d'affilée.
    const info = await putRealPhoto(key, ref.type === "moto" ? "moto" : "car", vehiclePhotoNo++);
    await db.insert(t.vehiclePhotos).values({
      vehicleId: row.id,
      position,
      storageKey: key,
      width: info.width,
      height: info.height,
      bytes: info.size,
      // Lot R4b, tour 3 : la décision vraie de la photo regardée (aucune plaque lisible), sinon aucune.
      noPlateConfirmed: info.noPlate,
    });
  }
  return { ...row, ref };
}

// --- Événements -------------------------------------------------------------------------------------------------
export async function createEvent(
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

export type AppStatus = "pending" | "accepted" | "waitlisted" | "offered" | "refused" | "withdrawn";

export async function apply(
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
