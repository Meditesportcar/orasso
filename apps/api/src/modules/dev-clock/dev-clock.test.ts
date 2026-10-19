// Horloge simulée (lot 34a) : garde-fous (production, 404, droits, journal), avance et remise à zéro sans recul, et
// parcours de bout en bout (H-2 → verrouillage, J+2 → points et malus réglés une seule fois, offre de la liste d'attente
// expirée par l'avance, tâches pg-boss libérées). L'horloge est la vraie (heure système + décalage) : les dates des
// événements sont calculées depuis l'heure réelle.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CLOCK_OFFSET_HEADER, formatClockOffset, settleAt } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  signUpExtras,
  type TestUser,
  viewerOf,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { adminAuditLog, applications, devClock, events, pointEntries, profiles, session, user } from "../../db/schema";
import { env } from "../../env";
import { startJobs } from "../../jobs";
import { deps, MemoryJobQueue, now, systemClock } from "../../lib/deps";
import {
  currentOffsetMs,
  installDevClock,
  readStoredOffset,
  refreshOffset,
  setCachedOffset,
} from "../../lib/dev-clock";
import { applicationsService } from "../applications/service";
import { checkinsService } from "../checkins/service";
import { notificationsService } from "../notifications/service";
import { pointsService } from "../points/service";
import { staffService } from "../staff/service";

const DAY = 86_400_000;
const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";

let ref: Awaited<ReturnType<typeof seedReference>>;
let admin: TestUser;

async function resetClock() {
  await db.execute(sql`truncate dev_clock`);
  setCachedOffset(0);
}

beforeAll(async () => {
  env.DEV_CLOCK = true;
  await installDevClock({ poll: false });
});

beforeEach(async () => {
  env.DEV_CLOCK = true;
  deps.jobs = new MemoryJobQueue();
  await resetDb();
  await resetClock();
  ref = await seedReference();
  admin = await signUp("Equipe_Orasso", { twoFactor: true, role: "super_admin" });
});

afterEach(async () => {
  await notificationsService.flush();
});

afterAll(async () => {
  await resetClock();
  env.DEV_CLOCK = false;
  deps.clock = systemClock;
  await pool.end();
});

/** Inscription dont on garde le jeton porteur (plugin bearer), avec ou sans second facteur prouvé par la session. */
async function signUpBearer(pseudo: string, opts: { twoFactor: boolean; role: "super_admin" | "moderator" }) {
  const email = `${pseudo.toLowerCase()}-${randomUUID().slice(0, 6)}@orasso.test`;
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
  expect(res.status).toBe(200);
  const token = res.headers.get("set-auth-token");
  const { user: u } = (await res.json()) as { user: { id: string } };
  if (opts.twoFactor) {
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, u.id));
    await db.update(session).set({ secondFactor: "totp" }).where(eq(session.userId, u.id));
  }

  await db.update(profiles).set({ platformRole: opts.role }).where(eq(profiles.userId, u.id));
  return token as string;
}

const bearer = (token: string, method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      origin: ORIGIN,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

describe("garde-fous", () => {
  const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
  const probe = fileURLToPath(new URL("../../../test/fixtures/env-probe.ts", import.meta.url));
  const probeEnv = (extra: Record<string, string>) =>
    spawnSync(process.execPath, [tsxCli, probe], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        SystemRoot: process.env.SystemRoot ?? "",
        DATABASE_URL: "postgres://orasso:orasso@localhost:1/orasso",
        BETTER_AUTH_SECRET: "x".repeat(40),
        DEV_SKIP_2FA: "false",
        QR_SIGNING_KEYS: "0:unused",
        QR_SIGNING_ACTIVE_KID: "0",
        ...extra,
      },
    });

  it("l'API refuse de démarrer en production avec DEV_CLOCK, et l'accepte en développement", () => {
    const refused = probeEnv({ NODE_ENV: "production", DEV_CLOCK: "on" });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("DEV_CLOCK est interdit en production");
    expect(probeEnv({ NODE_ENV: "development", DEV_CLOCK: "on" }).status).toBe(0);
    // Posée à « off » ou vide en production : acceptée (elle n'est pas active).
    expect(probeEnv({ NODE_ENV: "production", DEV_CLOCK: "off" }).stderr).not.toContain("DEV_CLOCK");
    expect(probeEnv({ NODE_ENV: "production", DEV_CLOCK: "" }).stderr).not.toContain("DEV_CLOCK");
  });

  it("sans DEV_CLOCK : 404 partout, même pour le super admin, et aucun en-tête", async () => {
    env.DEV_CLOCK = false;
    for (const [method, path, body] of [
      ["GET", "/dev/clock"],
      ["GET", "/dev/clock/events"],
      ["POST", "/dev/clock/advance", { by: "1h" }],
      ["POST", "/dev/clock/reset"],
    ] as const) {
      const res = await call(admin, method, path, body);
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    expect(await call(null, "GET", "/dev/clock")).toMatchObject({ status: 404 });
    const raw = await app.request("/api/health");
    expect(raw.headers.get(CLOCK_OFFSET_HEADER)).toBeNull();
  });

  it("avec DEV_CLOCK : l'en-tête accompagne chaque réponse (même une erreur), le décalage en millisecondes", async () => {
    setCachedOffset(0);
    expect((await app.request("/api/health")).headers.get(CLOCK_OFFSET_HEADER)).toBe("0");
    expect((await app.request("/api/introuvable")).headers.get(CLOCK_OFFSET_HEADER)).toBe("0");
    const advanced = await call(admin, "POST", "/dev/clock/advance", { by: "2h" });
    expect(advanced.status).toBe(200);
    const res = await app.request("/api/health");
    expect(Number(res.headers.get(CLOCK_OFFSET_HEADER))).toBeGreaterThanOrEqual(2 * 3_600_000 - 1000);
  });

  it("réservé au super admin avec second facteur de session, en cookie comme en porteur", async () => {
    // Anonyme, passionné, modérateur, super admin sans second facteur : refusés.
    expect((await call(null, "GET", "/dev/clock")).status).toBe(401);
    const plain = await signUp("Kenji_66");
    expect((await call(plain, "GET", "/dev/clock")).status).toBe(403);
    expect((await call(plain, "POST", "/dev/clock/advance", { by: "1h" })).status).toBe(403);
    const moderator = await signUp("Modo_66", { twoFactor: true, role: "moderator" });
    expect((await call(moderator, "POST", "/dev/clock/advance", { by: "1h" })).status).toBe(403);
    const noFactor = await signUp("Admin_sans_2fa", { role: "super_admin" });
    const refused = await call(noFactor, "POST", "/dev/clock/advance", { by: "1h" });
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("two_factor_required");
    expect((await call(noFactor, "POST", "/dev/clock/reset")).status).toBe(403);
    expect(await readStoredOffset()).toBe(0);

    // Cookie : accepté.
    expect((await call(admin, "GET", "/dev/clock")).status).toBe(200);
    // Porteur : mêmes règles.
    const good = await signUpBearer("Admin_porteur", { twoFactor: true, role: "super_admin" });
    expect((await bearer(good, "GET", "/dev/clock")).status).toBe(200);
    expect((await bearer(good, "POST", "/dev/clock/advance", { by: "1h" })).status).toBe(200);
    const bad = await signUpBearer("Admin_porteur_sans_2fa", { twoFactor: false, role: "super_admin" });
    const badRes = await bearer(bad, "POST", "/dev/clock/advance", { by: "1h" });
    expect(badRes.status).toBe(403);
    expect(((await badRes.json()) as { error: { code: string } }).error.code).toBe("two_factor_required");
    const modBearer = await signUpBearer("Modo_porteur", { twoFactor: true, role: "moderator" });
    expect((await bearer(modBearer, "GET", "/dev/clock")).status).toBe(403);
    expect((await bearer("jeton-invalide", "GET", "/dev/clock")).status).toBe(401);
  });

  it("chaque changement est tracé dans admin_audit_log", async () => {
    await call(admin, "POST", "/dev/clock/advance", { by: "1d" });
    await call(admin, "POST", "/dev/clock/reset");
    const rows = await db.select().from(adminAuditLog).where(eq(adminAuditLog.actorUserId, admin.id));
    expect(rows.map((r) => r.action).sort()).toEqual(["dev_clock.advance", "dev_clock.reset"]);
    expect(rows.find((r) => r.action === "dev_clock.advance")?.reason).toContain("1d");
    // Un refus ne trace rien.
    const plain = await signUp("Kenji_66");
    await call(plain, "POST", "/dev/clock/advance", { by: "1h" });
    expect(await db.select().from(adminAuditLog).where(eq(adminAuditLog.actorUserId, plain.id))).toHaveLength(0);
  });
});

describe("avancer, jamais reculer, revenir à zéro", () => {
  it("durée, instant visé, jalon : le décalage s'ajoute et survit au redémarrage", async () => {
    const before = Date.now();
    const a = await call(admin, "POST", "/dev/clock/advance", { by: "2h" });
    expect(a.status).toBe(200);
    expect(a.json.offsetMs).toBeGreaterThanOrEqual(2 * 3_600_000 - 1000);
    expect(a.json.offsetMs).toBeLessThan(2 * 3_600_000 + 5000);
    // 1d4h ensuite : s'ajoute.
    const b = await call(admin, "POST", "/dev/clock/advance", { by: "1d4h" });
    expect(b.json.offsetMs).toBeGreaterThanOrEqual(DAY + 6 * 3_600_000 - 1000);
    // Instant visé.
    const target = new Date(before + 5 * DAY).toISOString();
    const c = await call(admin, "POST", "/dev/clock/advance", { to: target });
    expect(c.status).toBe(200);
    expect(Math.abs(Date.parse(c.json.now) - Date.parse(target))).toBeLessThan(5000);
    // « Redémarrage » : le cache est perdu, le décalage revient de la base.
    const stored = await readStoredOffset();
    setCachedOffset(0);
    expect(currentOffsetMs()).toBe(0);
    await refreshOffset();
    expect(currentOffsetMs()).toBe(stored);
    expect(now().getTime() - Date.now()).toBeGreaterThanOrEqual(5 * DAY - 5000);
    const status = await call(admin, "GET", "/dev/clock");
    expect(status.json).toMatchObject({ enabled: true });
    expect(status.json.offsetMs).toBe(stored);
  });

  it("pas de recul : un instant ou un jalon passé est refusé (409), le décalage ne bouge pas", async () => {
    await call(admin, "POST", "/dev/clock/advance", { by: "3d" });
    const offset = await readStoredOffset();
    const past = await call(admin, "POST", "/dev/clock/advance", { to: new Date(Date.now() + DAY).toISOString() });
    expect(past.status).toBe(409);
    const structure = await createStructure(admin.id);
    const e = await createEvent(structure.id, { startsAt: new Date(Date.now() + DAY) });
    const milestone = await call(admin, "POST", "/dev/clock/advance", { eventId: e.id, milestone: "start" });
    expect(milestone.status).toBe(409);
    // Durée nulle, négative ou illisible : 400.
    for (const by of ["0h", "-2h", "demain", ""]) {
      expect((await call(admin, "POST", "/dev/clock/advance", { by })).status, by).toBe(400);
    }
    // Entrée incohérente : 400.
    expect((await call(admin, "POST", "/dev/clock/advance", {})).status).toBe(400);
    expect((await call(admin, "POST", "/dev/clock/advance", { by: "1h", to: new Date().toISOString() })).status).toBe(
      400,
    );
    expect((await call(admin, "POST", "/dev/clock/advance", { milestone: "j+2" })).status).toBe(400);
    expect(await readStoredOffset()).toBe(offset);
    // La base elle-même refuse un décalage négatif.
    await expect(db.update(devClock).set({ offsetMs: -1 }).where(eq(devClock.id, 1))).rejects.toThrow();
  });

  it("la remise à zéro rend l'heure réelle, plusieurs fois de suite", async () => {
    await call(admin, "POST", "/dev/clock/advance", { by: "10d" });
    const r = await call(admin, "POST", "/dev/clock/reset");
    expect(r.status).toBe(200);
    expect(r.json.offsetMs).toBe(0);
    expect(await readStoredOffset()).toBe(0);
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(50);
    expect((await call(admin, "POST", "/dev/clock/reset")).json.offsetMs).toBe(0);
    expect((await app.request("/api/health")).headers.get(CLOCK_OFFSET_HEADER)).toBe("0");
    expect(formatClockOffset(0)).toBe("");
  });
});

describe("parcours de bout en bout", () => {
  async function organisation() {
    const orga = await signUp("Damien_66", { twoFactor: true });
    const structure = await createStructure(orga.id);
    const julie = await signUp("Julie_66");
    await addMember(structure.id, julie.id, "staff", ["scan"]);
    return { orga, structure, julie };
  }

  const form = (vehicleId: string) => ({
    vehicleIds: [vehicleId],
    rulesAccepted: true as const,
    followStructure: true,
    newsletterOptIn: false,
    companions: 0,
    message: null,
  });

  async function candidate(pseudo: string, eventId: string) {
    const u = await signUp(pseudo);
    const v = await viewerOf(u);
    const vehicle = await createVehicle(u.id, ref);
    const [a] = await applicationsService.apply(v, eventId, form(vehicle.id));
    return { u, v, applicationId: a!.id };
  }

  it("H-2 verrouille ; J+2 règle les points et le malus une seule fois, même après deux avances et un balayage", async () => {
    const { orga, structure, julie } = await organisation();
    const orgaV = await viewerOf(orga);
    const julieV = await viewerOf(julie);
    const startsAt = new Date(Date.now() + 6 * DAY);
    const e = await createEvent(structure.id, {
      startsAt,
      endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
      capacity: 10,
    });
    const present = await candidate("Kenji_66", e.id);
    const absent = await candidate("Lea_11", e.id);
    for (const c of [present, absent]) {
      await applicationsService.decide(orgaV, e.id, c.applicationId, {
        decision: "accept",
        sendReasons: true,
        note: null,
      });
    }

    // H-2 : verrouillage (trace `locked_at`), plus de candidature possible.
    expect((await db.query.events.findFirst({ where: eq(events.id, e.id) }))?.lockedAt).toBeNull();
    const lock = await call(admin, "POST", "/dev/clock/advance", { eventId: e.id, milestone: "h-2" });
    expect(lock.status).toBe(200);
    expect((await db.query.events.findFirst({ where: eq(events.id, e.id) }))?.lockedAt).not.toBeNull();
    const late = await signUp("Retardataire_66");
    const lateVehicle = await createVehicle(late.id, ref);
    await expect(applicationsService.apply(await viewerOf(late), e.id, form(lateVehicle.id))).rejects.toMatchObject({
      status: 423,
    });

    // Début : le staff pointe Kenji (« entré sans scan »).
    await call(admin, "POST", "/dev/clock/advance", { eventId: e.id, milestone: "start" });
    await staffService.setPresence(julieV, e.id, true);
    await checkinsService.create(julieV, e.id, { applicationId: present.applicationId, method: "manual", note: null });

    // J+2 : points et malus réglés.
    expect((await db.query.events.findFirst({ where: eq(events.id, e.id) }))?.settledAt).toBeNull();
    const settle = await call(admin, "POST", "/dev/clock/advance", { eventId: e.id, milestone: "j+2" });
    expect(settle.status).toBe(200);
    expect(settle.json.sweeps.every((s: { ok: boolean }) => s.ok)).toBe(true);
    const settled = await db.query.events.findFirst({ where: eq(events.id, e.id) });
    expect(settled?.settledAt).not.toBeNull();
    expect(now().getTime()).toBeGreaterThanOrEqual(settleAt(settled!).getTime());
    const entries = () => db.select().from(pointEntries).where(eq(pointEntries.eventId, e.id));
    const first = await entries();
    expect(first.filter((x) => x.userId === present.u.id).map((x) => x.points)).toEqual([20]);
    expect(first.filter((x) => x.userId === absent.u.id).map((x) => x.points)).toEqual([-10]);
    expect(first.filter((x) => x.userId === julie.id)).toHaveLength(1);
    const total = first.length;

    // Deuxième avance, balayage et tâche rejouée : rien de plus.
    expect((await call(admin, "POST", "/dev/clock/advance", { by: "1d" })).status).toBe(200);
    expect((await call(admin, "POST", "/dev/clock/advance", { eventId: e.id, milestone: "j+8" })).status).toBe(200);
    await pointsService.sweep();
    expect(await pointsService.settleEvent(e.id)).toBe(false);
    const again = await entries();
    expect(again).toHaveLength(total);
    expect(again.map((x) => x.id).sort()).toEqual(first.map((x) => x.id).sort());
    // Le jalon J+2 est maintenant passé : pas de recul.
    expect((await call(admin, "POST", "/dev/clock/advance", { eventId: e.id, milestone: "j+2" })).status).toBe(409);
  });

  it("l'avance fait expirer l'offre de la liste d'attente (24 h) ; l'offre suivante part, sans double expiration", async () => {
    const { structure } = await organisation();
    const e = await createEvent(structure.id, {
      startsAt: new Date(Date.now() + 10 * DAY),
      admission: "open",
      capacity: 1,
    });
    const a = await candidate("Libre_A", e.id);
    const b = await candidate("Libre_B", e.id);
    expect((await db.query.applications.findFirst({ where: eq(applications.id, b.applicationId) }))?.status).toBe(
      "waitlisted",
    );
    await applicationsService.withdraw(a.v, a.applicationId);
    const offered = await db.query.applications.findFirst({ where: eq(applications.id, b.applicationId) });
    expect(offered?.status).toBe("offered");

    // Une demi-journée plus tard : l'offre court encore.
    await call(admin, "POST", "/dev/clock/advance", { by: "6h" });
    expect((await db.query.applications.findFirst({ where: eq(applications.id, b.applicationId) }))?.status).toBe(
      "offered",
    );
    // Deux jours plus tard : expirée par le balayage lancé avec l'avance.
    const res = await call(admin, "POST", "/dev/clock/advance", { by: "2d" });
    expect(res.json.sweeps.find((s: { name: string }) => s.name === "waitlist.sweep")).toMatchObject({ ok: true });
    expect((await db.query.applications.findFirst({ where: eq(applications.id, b.applicationId) }))?.status).toBe(
      "expired",
    );
    expect(await applicationsService.expireDueOffers()).toBe(0);
  });

  it("les tâches pg-boss en attente dont l'échéance simulée est passée sont libérées et exécutées une seule fois", async () => {
    const { structure } = await organisation();
    const startsAt = new Date(Date.now() + 6 * DAY);
    const e = await createEvent(structure.id, { startsAt, endsAt: new Date(startsAt.getTime() + 8 * 3_600_000) });
    const boss = await startJobs({ work: true });
    try {
      const at = settleAt(e);
      await deps.jobs.send("event.settle", { eventId: e.id, at: at.toISOString() }, at);
      await deps.jobs.send(
        "event.lock",
        { eventId: e.id, at: new Date().toISOString() },
        new Date(startsAt.getTime() - 2 * 3_600_000),
      );
      const pending = async () =>
        (
          await db.execute<{ state: string; name: string }>(
            sql`select state, name from pgboss.job where data ->> 'eventId' = ${e.id} and name in ('event.lock', 'event.settle') order by name`,
          )
        ).rows;
      expect((await pending()).map((r) => r.state)).toEqual(["created", "created"]);

      // On ne passe pas par le balayage de points : seule la libération des tâches doit déclencher le règlement.
      const res = await call(admin, "POST", "/dev/clock/advance", { eventId: e.id, milestone: "j+2" });
      expect(res.status).toBe(200);
      expect(res.json.releasedJobs).toBeGreaterThanOrEqual(2);
      const deadline = Date.now() + 30_000;
      let rows = await pending();
      while (Date.now() < deadline && rows.some((r) => r.state !== "completed")) {
        await new Promise((r) => setTimeout(r, 500));
        rows = await pending();
      }
      expect(rows).toEqual([
        { name: "event.lock", state: "completed" },
        { name: "event.settle", state: "completed" },
      ]);
      expect((await db.query.events.findFirst({ where: eq(events.id, e.id) }))?.settledAt).not.toBeNull();
      // Une seconde avance ne ressort aucune tâche déjà exécutée.
      const second = await call(admin, "POST", "/dev/clock/advance", { by: "1h" });
      expect(second.json.releasedJobs).toBe(0);
      expect(await pending()).toHaveLength(2);
      // Le bilan à J+8, planifié par le règlement, n'était pas échu : il attend toujours son heure.
      const report = await db.execute<{ state: string }>(
        sql`select state from pgboss.job where name = 'event.report-refresh' and data ->> 'eventId' = ${e.id}`,
      );
      expect(report.rows.map((r) => r.state)).toEqual(["created"]);
    } finally {
      await boss.stop();
    }
  }, 60_000);

  it("la liste des événements propose les jalons de chacun", async () => {
    const { structure } = await organisation();
    const startsAt = new Date(Date.now() + 3 * DAY);
    const e = await createEvent(structure.id, { startsAt, title: "Salon de test" });
    const list = await call(admin, "GET", "/dev/clock/events");
    expect(list.status).toBe(200);
    const row = list.json.items.find((x: { id: string }) => x.id === e.id);
    expect(row.milestones.map((m: { milestone: string }) => m.milestone)).toEqual([
      "h-2",
      "start",
      "end",
      "j+2",
      "j+8",
    ]);
    expect(Date.parse(row.milestones[0].at)).toBe(startsAt.getTime() - 120 * 60_000);
    expect(Date.parse(row.milestones[3].at)).toBe(settleAt({ endsAt: e.endsAt }).getTime());
    // Un événement en brouillon ou passé depuis longtemps n'y figure pas.
    await createEvent(structure.id, { status: "draft" });
    const old = await createEvent(structure.id, { startsAt: new Date(Date.now() - 60 * DAY) });
    const ids = (await call(admin, "GET", "/dev/clock/events")).json.items.map((x: { id: string }) => x.id);
    expect(ids).toContain(e.id);
    expect(ids).not.toContain(old.id);
    expect(ids).toHaveLength(1);
  });
});
