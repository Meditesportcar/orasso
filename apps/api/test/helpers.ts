// Outils des tests de l'API : base remise à zéro, comptes connectés, données minimales, horloge simulée.
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { app } from "../src/app";
import { db } from "../src/db/client";
import {
  categories,
  events,
  eventZones,
  profiles,
  proProfiles,
  session,
  structureMembers,
  structures,
  user,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
  vehiclePhotos,
  vehicles,
} from "../src/db/schema";
import { deps, MemoryJobQueue } from "../src/lib/deps";
import { resetRateLimits } from "../src/lib/rateLimit";
import type { Viewer } from "../src/lib/session";
import { settingsStore } from "../src/lib/settings";
import { notificationsService } from "../src/modules/notifications/service";
import { profilesRepo } from "../src/modules/profiles/repo";

const TABLES = [
  "user",
  "categories",
  "vehicle_makes",
  "vehicle_reference_seen",
  "structures",
  "email_outbox",
  "admin_audit_log",
  "notifications",
  "events",
  "seasons",
];

export async function resetDb() {
  resetRateLimits();
  // Lot 33 : réglages administrables gardés 60 s en mémoire, relus après la remise à zéro.
  settingsStore.invalidate();
  // Livraisons de notifications encore en cours (lancées sans attente par les services).
  await notificationsService.flush();
  await db.execute(sql.raw(`truncate ${TABLES.map((t) => `"${t}"`).join(", ")} cascade`));
}

/** Horloge simulée, remise en place avant chaque test. */
export function useClock(start: Date) {
  let current = start;
  deps.clock = { now: () => current };
  const jobs = new MemoryJobQueue();
  deps.jobs = jobs;
  return {
    jobs,
    set(d: Date) {
      current = d;
    },
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
    get now() {
      return current;
    },
  };
}

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";

/** Champs d'inscription obligatoires depuis le lot 41 (profil choisi, département, prénom et nom privés). */
export const signUpExtras = {
  mainProfile: "exhibitor",
  departments: ["66"],
  firstName: "Test",
  lastName: "Compte",
} as const;

export type TestUser = { id: string; pseudo: string; email: string; cookie: string };

/** Inscription par Better Auth (le profil est créé par le crochet d'inscription), session en cookie. */
export async function signUp(pseudo: string, opts: { twoFactor?: boolean; role?: "super_admin" | "moderator" } = {}) {
  const email = `${pseudo.toLowerCase()}-${randomBytes(3).toString("hex")}@orasso.test`;
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      email,
      password: "motdepasse-test-123",
      name: pseudo,
      termsAccepted: true,
      ...signUpExtras,
    }),
  });
  if (res.status !== 200) throw new Error(`Inscription ${res.status} : ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const { user: u } = (await res.json()) as { user: { id: string } };
  // TOTP activé et session qui l'a prouvé (comme après la saisie du code ; lot 15 : la preuve est portée par la session).
  if (opts.twoFactor) {
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, u.id));
    await db.update(session).set({ secondFactor: "totp" }).where(eq(session.userId, u.id));
  }
  if (opts.role) await db.update(profiles).set({ platformRole: opts.role }).where(eq(profiles.userId, u.id));
  const p = await profilesRepo.byUserId(u.id);
  return { id: u.id, pseudo: p?.pseudo ?? pseudo, email, cookie } satisfies TestUser;
}

/** Viewer pour appeler un service directement (sans HTTP). */
export async function viewerOf(u: TestUser): Promise<Viewer> {
  const row = await db.query.user.findFirst({ where: eq(user.id, u.id) });
  const profile = await profilesRepo.byUserId(u.id);
  if (!row || !profile) throw new Error("Utilisateur de test introuvable");
  // Hors requête HTTP : un compte TOTP est supposé connecté avec son code (session « totp »).
  return { user: row as Viewer["user"], profile, session: { secondFactor: row.twoFactorEnabled ? "totp" : null } };
}

/** Requête HTTP authentifiée sur l'application Hono (sans serveur). */
export async function call(u: TestUser | null, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      ...(u ? { cookie: u.cookie } : {}),
      origin: ORIGIN,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text, headers: res.headers };
}

/** Référentiel minimal : une marque, un modèle, une génération (et les « Autre »), deux catégories. */
export async function seedReference() {
  const [make] = await db.insert(vehicleMakes).values({ name: "BMW", slug: "bmw", country: "DE" }).returning();
  const [model] = await db
    .insert(vehicleModels)
    .values({ makeId: make!.id, name: "Série 3", slug: "serie-3", vehicleType: "car" })
    .returning();
  const [gen] = await db
    .insert(vehicleGenerations)
    .values({ modelId: model!.id, name: "E36", yearFrom: 1990, yearTo: 2000 })
    .returning();
  const [moto] = await db
    .insert(vehicleModels)
    .values({ makeId: make!.id, name: "R nineT", slug: "r-ninet", vehicleType: "moto" })
    .returning();
  const [youngtimer] = await db
    .insert(categories)
    .values({ slug: "youngtimer", label: "Youngtimer", minVehicleAge: 20 })
    .returning();
  const [jdm] = await db.insert(categories).values({ slug: "jdm", label: "JDM" }).returning();
  return {
    makeId: make!.id,
    modelId: model!.id,
    generationId: gen!.id,
    motoModelId: moto!.id,
    youngtimer: youngtimer!,
    jdm: jdm!,
  };
}

let plateCounter = 0;

/** Véhicule actif avec une photo (sans passer par sharp). */
export async function createVehicle(
  ownerId: string,
  ref: { makeId: string; modelId: string; generationId: string },
  overrides: Partial<typeof vehicles.$inferInsert> = {},
) {
  const plate = `AA-${String(++plateCounter).padStart(3, "0")}-ZZ`;
  const [v] = await db
    .insert(vehicles)
    .values({
      ownerId,
      vehicleType: "car",
      makeId: ref.makeId,
      modelId: ref.modelId,
      generationId: ref.generationId,
      year: 1995,
      plate,
      plateNormalized: plate.replaceAll("-", ""),
      ...overrides,
    })
    .returning();
  await db
    .insert(vehiclePhotos)
    .values({ vehicleId: v!.id, position: 1, storageKey: `test/${v!.id}.webp`, width: 10, height: 10, bytes: 10 });
  return v!;
}

export async function createStructure(ownerId: string, verified = true) {
  const [s] = await db
    .insert(structures)
    .values({
      slug: `club-${randomBytes(3).toString("hex")}`,
      kind: "association",
      name: "Club de test",
      department: "66",
      inviteToken: randomBytes(8).toString("hex"),
      verification: verified ? "verified" : "unverified",
      verifiedAt: verified ? new Date() : null,
      createdBy: ownerId,
    })
    .returning();
  await db
    .insert(structureMembers)
    .values({ structureId: s!.id, userId: ownerId, role: "owner", status: "active", joinedAt: new Date() });
  return s!;
}

export async function addMember(
  structureId: string,
  userId: string,
  role: "co_organizer" | "staff",
  staffRoles: string[] = [],
  canDecide = false,
) {
  await db.insert(structureMembers).values({ structureId, userId, role, staffRoles, canDecide, status: "active" });
}

/** Événement publié, ouvert aux candidatures. */
export async function createEvent(structureId: string, overrides: Partial<typeof events.$inferInsert> = {}) {
  const startsAt = overrides.startsAt ?? new Date(Date.now() + 10 * 86_400_000);
  const [e] = await db
    .insert(events)
    .values({
      plateSalt: randomBytes(16),
      structureId,
      slug: `evenement-${randomBytes(4).toString("hex")}`,
      title: "Rassemblement de test",
      // Lot 36 : adresse obligatoire (publication refusée sans elle).
      addressLine: "1 quai du Port",
      city: "Canet-en-Roussillon",
      format: "gathering",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 4 * 3_600_000),
      admittedVehicleTypes: ["car", "moto", "truck"],
      admission: "filtered",
      status: "published",
      publishedAt: new Date(0),
      registrationsOpenAt: new Date(0),
      ...overrides,
    })
    .returning();
  return e!;
}

/** Fiche pro publiée (insérée directement). */
export async function createPro(ownerId: string, overrides: Partial<typeof proProfiles.$inferInsert> = {}) {
  const [p] = await db
    .insert(proProfiles)
    .values({
      slug: `pro-${randomBytes(3).toString("hex")}`,
      ownerUserId: ownerId,
      name: "Garage de test",
      activities: ["garage"],
      city: "Perpignan",
      department: "66",
      publishedAt: new Date(0),
      ...overrides,
    })
    .returning();
  return p!;
}

export async function createZone(eventId: string, code: string) {
  const [z] = await db.insert(eventZones).values({ eventId, code, name: code }).returning();
  return z!;
}

/**
 * Suspension par le vrai chemin de la modération (lot 32) : un signalement du profil, puis la sanction prononcée par un
 * super administrateur (double authentification de session) sur `POST /admin/reports/:id/sanction`.
 */
export async function suspendByModeration(
  target: TestUser,
  kind: "suspension_7d" | "suspension_30d" | "ban" = "suspension_30d",
) {
  const tag = randomBytes(3).toString("hex");
  const reporter = await signUp(`Signaleur_${tag}`);
  const admin = await signUp(`Admin_${tag}`, { twoFactor: true, role: "super_admin" });
  const report = await call(reporter, "POST", "/reports", {
    targetType: "profile",
    targetId: target.id,
    reason: "insult",
  });
  if (report.status !== 201) throw new Error(`Signalement ${report.status} : ${report.text}`);
  const sanction = await call(admin, "POST", `/admin/reports/${report.json.id}/sanction`, { kind });
  if (sanction.status !== 200) throw new Error(`Sanction ${sanction.status} : ${sanction.text}`);
}
