// Lot 48 : code tournant OR2. Le kit du titulaire porte le secret du pass, la synchro du staff aussi (vérification
// hors ligne) ; un pass antérieur reçoit son secret à la première demande ; le script hors ligne vérifie un OR2 fabriqué
// avec le secret et l'heure ; l'accueil drive pointe avec la méthode `drive`.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { type Decide, decideScan, fromWallTime, rotatingCodeAt } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createEvent,
  createStructure,
  createVehicle,
  createZone,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { accessPasses, checkins, devices } from "../../db/schema";
import type { Viewer } from "../../lib/session";
import { ed25519Verify } from "../../lib/signing";
import { applicationsService } from "../applications/service";
import { checkinsService } from "../checkins/service";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });
const ACCEPT: Decide = { decision: "accept", sendReasons: true, note: null };

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let structureId: string;
let theo: TestUser;
let theoV: Viewer;
let eventId: string;
let people: { u: TestUser; applicationId: string }[];

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 10, 12));
  const ref = await seedReference();
  orga = await signUp("Damien_66", { twoFactor: true });
  const orgaV = await viewerOf(orga);
  structureId = (await createStructure(orga.id)).id;
  theo = await signUp("Theo_66");
  await addMember(structureId, theo.id, "staff", ["scan"]);
  theoV = await viewerOf(theo);
  eventId = (await createEvent(structureId, { startsAt: paris(10, 17, 10), endsAt: paris(10, 17, 18) })).id;
  const zone = (await createZone(eventId, "JDM")).id;
  people = [];
  for (const pseudo of ["Kenji_66", "Lea_11"]) {
    const u = await signUp(pseudo);
    const v = await viewerOf(u);
    const vehicle = await createVehicle(u.id, ref);
    const [app] = await applicationsService.apply(v, eventId, {
      vehicleIds: [vehicle.id],
      rulesAccepted: true,
      followStructure: true,
      newsletterOptIn: false,
      companions: 0,
      message: null,
    });
    await applicationsService.decide(orgaV, eventId, app!.id, { ...ACCEPT, zoneId: zone });
    people.push({ u, applicationId: app!.id });
  }
  clock.set(paris(10, 17, 9, 30));
});

const script = fileURLToPath(new URL("../../../scripts/verify-pass-offline.ts", import.meta.url));
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

function verifyOffline(args: string[]) {
  const run = spawnSync(process.execPath, [tsxCli, script, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" },
  });
  return { code: run.status, out: run.stdout.trim() ? JSON.parse(run.stdout.trim()) : null, err: run.stderr };
}

describe("code tournant OR2", () => {
  it("le kit porte le secret (stable), l'en-tête du QR et l'ancien OR1", async () => {
    const kenji = people[0]!;
    const kit = (await call(kenji.u, "GET", `/applications/${kenji.applicationId}/pass`)).json;
    expect(kit.otpSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(kit.otpSecret, "base64url")).toHaveLength(32);
    expect(kit.payload).toMatch(/^OR1/);
    expect(kit).toMatchObject({ kind: "vehicle", spotLabel: null, mediaName: null });
    const again = (await call(kenji.u, "GET", `/applications/${kenji.applicationId}/pass`)).json;
    expect(again.otpSecret).toBe(kit.otpSecret);
    // Deux pass, deux secrets.
    const lea = (await call(people[1]!.u, "GET", `/applications/${people[1]!.applicationId}/pass`)).json;
    expect(lea.otpSecret).not.toBe(kit.otpSecret);
  });

  it("pass antérieur au lot 48 : secret généré à la première demande du kit, puis gardé", async () => {
    const kenji = people[0]!;
    await db.update(accessPasses).set({ otpSecret: null }).where(eq(accessPasses.applicationId, kenji.applicationId));
    const kit = (await call(kenji.u, "GET", `/applications/${kenji.applicationId}/pass`)).json;
    expect(kit.otpSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await db.query.accessPasses.findFirst({ where: eq(accessPasses.id, kit.passId) });
    expect(row?.otpSecret?.toString("base64url")).toBe(kit.otpSecret);
  });

  it("la synchro du staff porte le secret de chaque pass valide ; le code se vérifie hors ligne", async () => {
    const kenji = people[0]!;
    await db
      .update(accessPasses)
      .set({ otpSecret: null })
      .where(eq(accessPasses.applicationId, people[1]!.applicationId));
    const sync = (await call(theo, "GET", `/events/${eventId}/staff/sync`)).json;
    expect(sync.entries).toHaveLength(2);
    for (const e of sync.entries) expect(e.otpSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const kit = (await call(kenji.u, "GET", `/applications/${kenji.applicationId}/pass`)).json;
    const entry = sync.entries.find((e: { passId: string }) => e.passId === kit.passId);
    expect(entry.otpSecret).toBe(kit.otpSecret);

    // Le téléphone du participant fabrique le code ; celui du staff le décide avec la liste, sans réseau.
    const t = paris(10, 17, 9, 31);
    const code = rotatingCodeAt(Buffer.from(kit.otpSecret, "base64url"), kit.eventNo, kit.passId, t);
    const ctx = { eventNo: sync.event.eventNo, keys: new Map(), verify: ed25519Verify, findEntry: () => entry };
    expect(decideScan(code, { ...ctx, now: t })).toMatchObject({ decision: "ok", passId: kit.passId });
    expect(decideScan(code, { ...ctx, now: new Date(t.getTime() + 61_000) })).toMatchObject({ reason: "expired" });

    // Script hors ligne (autre processus, sans base) : authentique à l'heure, périmé 61 s après, faux avec un autre secret.
    const ok = verifyOffline([
      "--secret",
      kit.otpSecret,
      "--at",
      t.toISOString(),
      "--event-no",
      String(kit.eventNo),
      code,
    ]);
    expect(ok).toMatchObject({ code: 0, out: { valid: true, passId: kit.passId, slotOffset: 0 } });
    const late = verifyOffline(["--secret", kit.otpSecret, "--at", new Date(t.getTime() + 61_000).toISOString(), code]);
    expect(late).toMatchObject({ code: 1, out: { valid: false, reason: "expired" } });
    const other = verifyOffline(["--secret", Buffer.alloc(32, 7).toString("base64url"), "--at", t.toISOString(), code]);
    expect(other).toMatchObject({ code: 1, out: { valid: false, reason: "bad_mac" } });
    expect(verifyOffline([code]).code).toBe(2);
  });

  it("synchro différentielle : un secret généré pour un ancien pass part dans le delta", async () => {
    const full = (await call(theo, "GET", `/events/${eventId}/staff/sync`)).json;
    await db
      .update(accessPasses)
      .set({ otpSecret: null })
      .where(eq(accessPasses.applicationId, people[1]!.applicationId));
    const delta = (await call(theo, "GET", `/events/${eventId}/staff/sync?since=${encodeURIComponent(full.cursor)}`))
      .json;
    const lea = delta.entries.find((e: { pseudo: string }) => e.pseudo === "Lea_11");
    expect(lea?.otpSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("révoqué : plus de secret dans le kit ni dans la synchro", async () => {
    const kenji = people[0]!;
    await applicationsService.withdraw(await viewerOf(kenji.u), kenji.applicationId);
    const kit = (await call(kenji.u, "GET", `/applications/${kenji.applicationId}/pass`)).json;
    expect(kit).toMatchObject({ payload: null, otpSecret: null });
    const sync = (await call(theo, "GET", `/events/${eventId}/staff/sync`)).json;
    const revoked = sync.entries.find((e: { passId: string }) => e.passId === kit.passId);
    expect(revoked).toMatchObject({ status: "revoked" });
    expect(revoked.otpSecret ?? null).toBeNull();
  });
});

describe("accueil drive", () => {
  it("pointage `drive` en ligne et dans un lot hors ligne ; compté au rapport", async () => {
    const created = await call(theo, "POST", `/events/${eventId}/checkins`, {
      applicationId: people[0]!.applicationId,
      method: "drive",
    });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ method: "drive" });

    const [d] = await db.insert(devices).values({ userId: theo.id, platform: "android", name: "Pixel" }).returning();
    const res = await checkinsService.receiveBatch(theoV, eventId, {
      deviceId: d!.id,
      items: [
        {
          kind: "drive",
          id: randomUUID(),
          applicationId: people[1]!.applicationId,
          note: null,
          scannedAt: paris(10, 17, 9, 29),
        },
      ],
    });
    expect(res.results[0]).toMatchObject({ result: "accepted", applicationId: people[1]!.applicationId });
    const row = await db.query.checkins.findFirst({ where: eq(checkins.applicationId, people[1]!.applicationId) });
    expect(row?.method).toBe("drive");
    const report = (await call(orga, "GET", `/events/${eventId}/scan-report`)).json;
    expect(report.totals.byMethod.drive).toBe(2);
  });
});

describe("secrets et pointage réservés aux rôles qui pointent (relecture du lot 48)", () => {
  it("staff scan : secret reçu ; staff placement : pas de secret, pointage refusé", async () => {
    const scan = (await call(theo, "GET", `/events/${eventId}/staff/sync`)).json;
    for (const e of scan.entries) expect(e.otpSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const ines = await signUp("Ines_66");
    await addMember(structureId, ines.id, "staff", ["placement"]);
    const sync = await call(ines, "GET", `/events/${eventId}/staff/sync`);
    expect(sync.status).toBe(200);
    for (const e of sync.json.entries) expect(e.otpSecret ?? null).toBeNull();
    const delta = await call(
      ines,
      "GET",
      `/events/${eventId}/staff/sync?since=${encodeURIComponent("2020-01-01T00:00:00Z")}`,
    );
    for (const e of delta.json.entries) expect(e.otpSecret ?? null).toBeNull();

    const manual = await call(ines, "POST", `/events/${eventId}/checkins`, {
      applicationId: people[0]!.applicationId,
      method: "manual",
    });
    expect(manual.status).toBe(403);
    const [d] = await db.insert(devices).values({ userId: ines.id, platform: "android", name: "Pixel" }).returning();
    const batch = await call(ines, "POST", `/events/${eventId}/scans`, {
      deviceId: d!.id,
      items: [
        {
          kind: "manual",
          id: randomUUID(),
          applicationId: people[0]!.applicationId,
          note: null,
          scannedAt: paris(10, 17, 9, 29),
        },
      ],
    });
    expect(batch.status).toBe(403);
    const plates = await call(ines, "POST", `/events/${eventId}/checkins/by-plates`, { plates: ["AA-001-ZZ"] });
    expect(plates.status).toBe(403);
    // L'organisateur garde tout.
    const orgaSync = (await call(orga, "GET", `/events/${eventId}/staff/sync`)).json;
    for (const e of orgaSync.entries) expect(e.otpSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("première synchro : les secrets manquants posés en une requête, sans écraser un secret existant", async () => {
    const kenji = people[0]!;
    const kept = (await call(kenji.u, "GET", `/applications/${kenji.applicationId}/pass`)).json.otpSecret;
    await db
      .update(accessPasses)
      .set({ otpSecret: null })
      .where(eq(accessPasses.applicationId, people[1]!.applicationId));
    const sync = (await call(theo, "GET", `/events/${eventId}/staff/sync`)).json;
    const secrets = sync.entries.map((e: { otpSecret: string }) => e.otpSecret);
    expect(new Set(secrets).size).toBe(2);
    expect(secrets).toContain(kept);
  });
});
