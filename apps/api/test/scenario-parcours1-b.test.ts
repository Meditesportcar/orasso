// Scénario du critère de fin du lot 06 (parcours n° 1, seconde moitié), par l'API HTTP, horloge simulée :
// retenu → QR signé → synchro du staff → vérification du QR avec la seule clé publique par un script séparé
// (scripts/verify-pass-offline.ts, sans base ni configuration) → scans de deux appareils dont un doublon → rapport
// → J+2 (tâche planifiée à la publication) → points et malus → contestation tranchée par l'organisateur.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { accessListSigningText, fromWallTime } from "@orasso/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, pool } from "../src/db/client";
import { devices } from "../src/db/schema";
import { ed25519Verify } from "../src/lib/signing";
import { notificationsService } from "../src/modules/notifications/service";
import { pointsService } from "../src/modules/points/service";
import {
  addMember,
  call,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "./helpers";

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeAll(async () => {
  await resetDb();
  clock = useClock(paris(10, 1, 10));
  ref = await seedReference();
});

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const script = fileURLToPath(new URL("../scripts/verify-pass-offline.ts", import.meta.url));
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

/** Vérification hors API, dans un autre processus, avec le seul fichier des clés publiques. */
function verifyOffline(keysFile: string, eventNo: number, payload: string) {
  const run = spawnSync(
    process.execPath,
    [tsxCli, script, "--keys", keysFile, "--event-no", String(eventNo), payload],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" },
    },
  );
  return { code: run.status, out: run.stdout.trim() ? JSON.parse(run.stdout.trim()) : null, err: run.stderr };
}

async function device(u: TestUser, name: string) {
  const [d] = await db.insert(devices).values({ userId: u.id, platform: "android", name }).returning();
  return d!.id;
}

describe("parcours n° 1, seconde moitié", () => {
  it("du QR signé au règlement de J+2 et à la contestation", async () => {
    // Organisation : structure vérifiée, staff Julie (scan + super staff) et Théo (scan), salon le 17/10.
    const damien = await signUp("Damien_66", { twoFactor: true });
    const structure = await createStructure(damien.id);
    const julie = await signUp("Julie_66");
    const theo = await signUp("Theo_66");
    await addMember(structure.id, julie.id, "staff", ["scan", "super_staff"]);
    await addMember(structure.id, theo.id, "staff", ["scan"]);
    const created = await call(damien, "POST", `/structures/${structure.id}/events`, {
      title: "Salon Argelès",
      addressLine: "1 quai du Port",
      format: "show",
      startsAt: paris(10, 17, 10).toISOString(),
      endsAt: paris(10, 17, 18).toISOString(),
      city: "Argelès-sur-Mer",
      department: "66",
      admittedVehicleTypes: ["car"],
      capacity: 50,
      admission: "filtered",
      registrationsOpenAt: paris(10, 2, 12).toISOString(),
    });
    expect(created.status).toBe(201);
    const eventId: string = created.json.id;
    expect((await call(damien, "POST", `/events/${eventId}/zones`, { code: "JDM", name: "JDM" })).status).toBe(201);
    expect((await call(damien, "POST", `/events/${eventId}/publish`)).status).toBe(200);
    const settleJob = clock.jobs.jobs.find((j) => j.name === "event.settle");
    expect(settleJob?.startAfter).toEqual(paris(10, 19, 18));
    // Le staff est rattaché à l'événement dès la publication.
    expect((await call(damien, "GET", `/events/${eventId}/staff`)).json).toHaveLength(2);

    // Trois passionnés candidatent et sont retenus : chacun reçoit son QR signé.
    clock.set(paris(10, 3, 9));
    const zone = (await call(damien, "GET", `/events/${eventId}/zones`)).json[0].id;
    const people: Record<string, { u: TestUser; applicationId: string; payload: string; passId: string }> = {};
    for (const pseudo of ["Kenji_66", "Lea_11", "Nina_34"]) {
      const u = await signUp(pseudo);
      const vehicle = await createVehicle(u.id, ref);
      const applied = await call(u, "POST", `/events/${eventId}/applications`, {
        vehicleIds: [vehicle.id],
        rulesAccepted: true,
      });
      expect(applied.status).toBe(201);
      const applicationId = applied.json[0].id;
      expect((await call(u, "GET", `/applications/${applicationId}/pass`)).status).toBe(404);
      const decided = await call(damien, "POST", `/events/${eventId}/applications/${applicationId}/decide`, {
        decision: "accept",
        zoneId: zone,
      });
      expect(decided.json.status).toBe("accepted");
      const pass = await call(u, "GET", `/applications/${applicationId}/pass`);
      expect(pass.json.payload).toMatch(/^OR1[A-Z2-7]{138}$/);
      people[pseudo] = { u, applicationId, payload: pass.json.payload, passId: pass.json.passId };
    }
    const eventNo: number = (await call(damien, "GET", `/events/${eventId}/staff/sync`)).json.event.eventNo;

    // Le staff dit s'il sera là ; verrouillage H−2 le jour J ; synchro de la liste d'accès signée.
    clock.set(paris(10, 16, 18));
    expect((await call(julie, "PUT", `/events/${eventId}/staff/me/presence`, { present: true })).status).toBe(200);
    expect((await call(theo, "PUT", `/events/${eventId}/staff/me/presence`, { present: false })).status).toBe(200);
    clock.set(paris(10, 17, 8, 5));
    const sync = await call(theo, "GET", `/events/${eventId}/staff/sync`);
    expect(sync.json.event.isLocked).toBe(true);
    expect(sync.json.entries).toHaveLength(3);
    const signingKey = sync.json.keys.find((k: { kid: number }) => k.kid === sync.json.signatureKid);
    const digest = createHash("sha256").update(accessListSigningText(sync.json)).digest();
    expect(
      ed25519Verify(
        digest,
        Buffer.from(sync.json.signature, "base64url"),
        Buffer.from(signingKey.publicKey, "base64url"),
      ),
    ).toBe(true);

    // Vérification locale du QR de Kenji avec la seule clé publique, par un script hors API.
    const keys = await call(null, "GET", "/keys");
    const dir = mkdtempSync(join(tmpdir(), "orasso-keys-"));
    const keysFile = join(dir, "keys.json");
    writeFileSync(keysFile, JSON.stringify(keys.json));
    const kenji = people.Kenji_66!;
    const ok = verifyOffline(keysFile, eventNo, kenji.payload);
    expect(ok.err).toBe("");
    expect(ok).toMatchObject({ code: 0, out: { valid: true, passId: kenji.passId, eventNo } });
    const tampered = kenji.payload.slice(0, 60) + (kenji.payload[60] === "A" ? "B" : "A") + kenji.payload.slice(61);
    expect(verifyOffline(keysFile, eventNo, tampered)).toMatchObject({ code: 1, out: { valid: false } });
    expect(verifyOffline(keysFile, eventNo + 1, kenji.payload)).toMatchObject({
      code: 1,
      out: { reason: "other_event" },
    });

    // Jour J : deux appareils sans réseau scannent ; Kenji passe deux fois (un doublon), Léa une fois, Nina ne vient pas.
    const julieDevice = await device(julie, "Pixel de Julie");
    const theoDevice = await device(theo, "iPhone de Théo");
    clock.set(paris(10, 17, 10, 30));
    const lea = people.Lea_11!;
    const fromJulie = [
      {
        kind: "scan",
        id: randomUUID(),
        passId: kenji.passId,
        decision: "ok",
        scannedAt: paris(10, 17, 9, 41).toISOString(),
      },
      {
        kind: "scan",
        id: randomUUID(),
        passId: lea.passId,
        decision: "ok",
        scannedAt: paris(10, 17, 9, 44).toISOString(),
      },
    ];
    const r1 = await call(julie, "POST", `/events/${eventId}/scans`, { deviceId: julieDevice, items: fromJulie });
    expect(r1.json.results.map((r: { result: string }) => r.result)).toEqual(["accepted", "accepted"]);
    expect(r1.json.results[0].zone).toEqual({ code: "JDM", name: "JDM" });
    const fromTheo = [
      {
        kind: "scan",
        id: randomUUID(),
        passId: kenji.passId,
        decision: "ok",
        scannedAt: paris(10, 17, 9, 43).toISOString(),
      },
    ];
    const r2 = await call(theo, "POST", `/events/${eventId}/scans`, { deviceId: theoDevice, items: fromTheo });
    expect(r2.json.results[0]).toMatchObject({ result: "duplicate_other_device", duplicateOf: fromJulie[0]!.id });
    // Rejeu du lot de Julie (réseau revenu) : réponse identique.
    const replay = await call(julie, "POST", `/events/${eventId}/scans`, { deviceId: julieDevice, items: fromJulie });
    expect(replay.json).toEqual(r1.json);

    // Rapport de doublons.
    const report = (await call(damien, "GET", `/events/${eventId}/scan-report`)).json;
    expect(report.totals).toMatchObject({ scans: 3, accepted: 2, checkins: 2, duplicates: 1, expected: 3 });
    expect(report.duplicates).toEqual([
      expect.objectContaining({
        pseudo: "Kenji_66",
        first: expect.objectContaining({ device: "Pixel de Julie", staff: "Julie_66" }),
        others: [expect.objectContaining({ device: "iPhone de Théo", staff: "Theo_66" })],
      }),
    ]);
    const live = (await call(damien, "GET", `/events/${eventId}/live`)).json;
    expect(live).toMatchObject({ arrived: 2, expected: 3, staffPresent: 1, staffExpected: 2 });

    // Le lendemain : « pointage en attente ». J+2 : la tâche planifiée à la publication règle les points.
    clock.set(paris(10, 18, 12));
    const nina = people.Nina_34!;
    expect((await call(nina.u, "GET", "/me/applications?scope=past")).json[0].pointsPending).toBe(true);
    clock.set(paris(10, 19, 18));
    expect(await pointsService.settleEvent(settleJob?.data.eventId as string)).toBe(true);
    await notificationsService.flush();
    const pts = async (u: TestUser) => (await call(u, "GET", "/me/points")).json.pointsSeason;
    expect(await pts(kenji.u)).toBe(20);
    expect(await pts(lea.u)).toBe(20);
    expect(await pts(nina.u)).toBe(-10);
    expect(await pts(julie)).toBe(20);
    expect(await pts(theo)).toBe(0);
    const ninaCard = (await call(nina.u, "GET", "/me/applications?scope=past")).json[0];
    expect(ninaCard).toMatchObject({ pointsPending: false, points: -10, malus: { canContest: true } });

    // Nina conteste ; l'organisateur accepte et pointe sa présence : malus annulé.
    clock.set(paris(10, 21, 9));
    const contest = await call(nina.u, "POST", `/applications/${nina.applicationId}/malus-contest`, {
      message: "J'étais là, garée hors zone, entrée par le parking visiteurs.",
    });
    expect(contest.status).toBe(201);
    const decided = await call(damien, "POST", `/malus-contests/${contest.json.id}/decide`, {
      decision: "accept",
      note: "Vue sur place par Julie",
      checkin: true,
    });
    expect(decided.json).toMatchObject({ status: "accepted", checkedIn: true });
    expect(await pts(nina.u)).toBe(0);
    const journal = (await call(nina.u, "GET", "/me/notifications")).json.items.map((n: { type: string }) => n.type);
    expect(journal).toEqual(expect.arrayContaining(["application_accepted", "malus_applied", "contest_decided"]));
    // Un seul scénario long (vérification hors ligne dans un autre processus) : sous charge il dépassait les 20 s par
    // défaut ; la comparaison ci-dessus ne dépend déjà pas de l'ordre, c'est le délai qui était instable.
  }, 120_000);
});
