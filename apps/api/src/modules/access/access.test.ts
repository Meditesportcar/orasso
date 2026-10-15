// QR d'inscription : émission à la retenue, révocation, remplacement, vérification avec la seule clé publique,
// rotation des clés (ARCHITECTURE.md § 3.1).
import { type Decide, fromWallTime, verifyPassPayload } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { accessPasses, signingKeys } from "../../db/schema";
import type { Viewer } from "../../lib/session";
import { ed25519Verify, parseKeys, signing } from "../../lib/signing";
import { applicationsService } from "../applications/service";
import { eventsService } from "../events/service";
import { notificationsService } from "../notifications/service";
import { accessService } from "./service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number) => fromWallTime({ year: 2026, month, day, hour, minute: 0 });

let orga: TestUser;
let orgaV: Viewer;
let kenji: TestUser;
let kenjiV: Viewer;
let eventId: string;
let applicationId: string;

const form = (vehicleIds: string[]) => ({
  vehicleIds,
  rulesAccepted: true as const,
  followStructure: true,
  newsletterOptIn: false,
  companions: 0,
  message: null,
});

const ACCEPT: Decide = { decision: "accept", sendReasons: true, note: null };
const REFUSE: Decide = { decision: "refuse", reasons: ["off_theme"], sendReasons: true, note: null };

/** Clés publiques telles que l'appli les reçoit (`GET /api/keys`). */
async function publishedKeys() {
  const res = await call(null, "GET", "/keys");
  expect(res.status).toBe(200);
  return new Map<number, Uint8Array>(
    res.json.keys.map((k: { kid: number; publicKey: string }) => [k.kid, Buffer.from(k.publicKey, "base64url")]),
  );
}

beforeEach(async () => {
  await resetDb();
  useClock(paris(6, 10, 10));
  const ref = await seedReference();
  orga = await signUp("Damien_66", { twoFactor: true });
  orgaV = await viewerOf(orga);
  const structureId = (await createStructure(orga.id)).id;
  eventId = (await createEvent(structureId, { startsAt: paris(6, 20, 18), endsAt: paris(6, 20, 23) })).id;
  kenji = await signUp("Kenji_66");
  kenjiV = await viewerOf(kenji);
  const v = await createVehicle(kenji.id, ref);
  const [app] = await applicationsService.apply(kenjiV, eventId, form([v.id]));
  applicationId = app?.id ?? "";
});

describe("QR d'inscription", () => {
  it("pas de QR tant que la candidature n'est pas retenue", async () => {
    expect((await call(kenji, "GET", `/applications/${applicationId}/pass`)).status).toBe(404);
  });

  it("émis à la retenue, vérifiable avec la seule clé publique, stable", async () => {
    await applicationsService.decide(orgaV, eventId, applicationId, ACCEPT);
    const res = await call(kenji, "GET", `/applications/${applicationId}/pass`);
    expect(res.status).toBe(200);
    expect(res.json.payload).toMatch(/^OR1[A-Z2-7]{138}$/);
    const check = verifyPassPayload(res.json.payload, await publishedKeys(), ed25519Verify);
    expect(check).toMatchObject({ ok: true, pass: { passId: res.json.passId, eventNo: res.json.eventNo } });
    // Relu : même QR (jamais régénéré).
    const again = await call(kenji, "GET", `/applications/${applicationId}/pass`);
    expect(again.json.payload).toBe(res.json.payload);
    // Le QR d'un autre n'est pas lisible.
    const other = await signUp("Lea_11");
    expect((await call(other, "GET", `/applications/${applicationId}/pass`)).status).toBe(404);
    expect((await call(orga, "GET", `/applications/${applicationId}/pass`)).status).toBe(404);
  });

  it("révoqué au désistement, à la retenue annulée et à l'annulation de l'événement", async () => {
    await applicationsService.decide(orgaV, eventId, applicationId, ACCEPT);
    await applicationsService.withdraw(kenjiV, applicationId);
    const res = await call(kenji, "GET", `/applications/${applicationId}/pass`);
    expect(res.json).toMatchObject({ payload: null, revokedReason: "withdrawn" });
    expect(res.json.revokedAt).toBeTruthy();
  });

  it("refus après retenue puis nouvelle retenue : nouveau QR, l'ancien remplacé", async () => {
    await applicationsService.decide(orgaV, eventId, applicationId, ACCEPT);
    const first = (await call(kenji, "GET", `/applications/${applicationId}/pass`)).json;
    await applicationsService.decide(orgaV, eventId, applicationId, REFUSE);
    expect((await call(kenji, "GET", `/applications/${applicationId}/pass`)).json.revokedReason).toBe("refused");
    await applicationsService.decide(orgaV, eventId, applicationId, ACCEPT);
    const second = (await call(kenji, "GET", `/applications/${applicationId}/pass`)).json;
    expect(second.passId).not.toBe(first.passId);
    expect(second.payload).not.toBe(first.payload);
    const rows = await db.query.accessPasses.findMany({ where: eq(accessPasses.applicationId, applicationId) });
    expect(rows.map((r) => r.revokedReason).sort()).toEqual([null, "refused"]);
  });

  it("annulation de l'événement : QR révoqués", async () => {
    await applicationsService.decide(orgaV, eventId, applicationId, ACCEPT);
    await eventsService.cancel(orgaV, eventId);
    expect((await call(kenji, "GET", `/applications/${applicationId}/pass`)).json.revokedReason).toBe("cancelled");
  });

  it("rotation : la nouvelle clé signe, l'ancienne vérifie toujours les QR émis", async () => {
    const before = signing.activeKid;
    await applicationsService.decide(orgaV, eventId, applicationId, ACCEPT);
    const old = (await call(kenji, "GET", `/applications/${applicationId}/pass`)).json.payload as string;
    const seed = (n: number) => Buffer.alloc(32, n).toString("base64");
    // La clé de démonstration (kid 0) reste listée, une nouvelle clé (kid 7) devient active.
    signing.configureForTests(
      JSON.stringify([
        { kid: 7, privateKey: seed(7) },
        { kid: 0, privateKey: Buffer.from(await demoSeed()).toString("base64") },
      ]),
      "7",
    );
    try {
      await applicationsService.decide(orgaV, eventId, applicationId, REFUSE);
      await applicationsService.decide(orgaV, eventId, applicationId, ACCEPT);
      const fresh = (await call(kenji, "GET", `/applications/${applicationId}/pass`)).json.payload as string;
      const keys = await publishedKeys();
      expect(verifyPassPayload(fresh, keys, ed25519Verify)).toMatchObject({ ok: true, pass: { kid: 7 } });
      expect(verifyPassPayload(old, keys, ed25519Verify)).toMatchObject({ ok: true, pass: { kid: before } });
    } finally {
      signing.configureForTests(
        JSON.stringify([{ kid: 0, privateKey: Buffer.from(await demoSeed()).toString("base64") }]),
        "0",
      );
    }
  });
});

describe("clé compromise et garde de production", () => {
  const demo = async () => JSON.stringify([{ kid: 0, privateKey: Buffer.from(await demoSeed()).toString("base64") }]);

  it("révocation : la clé sort de /keys et de la vérification serveur, les QR valides sont réémis", async () => {
    await applicationsService.decide(orgaV, eventId, applicationId, ACCEPT);
    const old = (await call(kenji, "GET", `/applications/${applicationId}/pass`)).json;
    signing.configureForTests(
      JSON.stringify([
        { kid: 7, privateKey: Buffer.alloc(32, 7).toString("base64") },
        { kid: 0, privateKey: Buffer.from(await demoSeed()).toString("base64") },
      ]),
      "7",
    );
    try {
      await expect(accessService.revokeSigningKey(7)).rejects.toThrow(/active/);
      expect(await accessService.revokeSigningKey(0)).toEqual({ reissued: 1 });
      const keys = await publishedKeys();
      expect([...keys.keys()]).not.toContain(0);
      expect([...(await signing.trustedKeys()).keys()]).not.toContain(0);
      expect(verifyPassPayload(old.payload, keys, ed25519Verify)).toMatchObject({ ok: false, reason: "unknown_key" });
      const fresh = (await call(kenji, "GET", `/applications/${applicationId}/pass`)).json;
      expect(fresh.passId).not.toBe(old.passId);
      expect(verifyPassPayload(fresh.payload, keys, ed25519Verify)).toMatchObject({ ok: true, pass: { kid: 7 } });
      const oldRow = await db.query.accessPasses.findFirst({ where: eq(accessPasses.id, old.passId) });
      expect(oldRow?.revokedReason).toBe("replaced");
    } finally {
      await db.update(signingKeys).set({ revokedAt: null }).where(eq(signingKeys.kid, 0));
      signing.configureForTests(await demo(), "0");
    }
  });

  it("production : clé de démonstration ou kid 0 refusés", async () => {
    const demoJson = await demo();
    expect(() => parseKeys(demoJson, "0", true)).toThrow(/interdits en production/);
    expect(() => parseKeys(undefined, undefined, true)).toThrow(/obligatoire/);
    const real = JSON.stringify([{ kid: 9, privateKey: Buffer.alloc(32, 9).toString("base64") }]);
    expect(parseKeys(real, "9", true).activeKid).toBe(9);
    // La base de test connaît la clé de démonstration (kid 0) non révoquée : démarrage refusé.
    signing.configureForTests(real, "9", true);
    try {
      await expect(signing.ensureSynced()).rejects.toThrow(/démonstration/);
    } finally {
      signing.configureForTests(await demo(), "0");
    }
  });
});

/** Graine de la clé de démonstration (même dérivation que `lib/signing.ts`). */
async function demoSeed() {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update("orasso-dev-qr-key-not-secret").digest();
}
