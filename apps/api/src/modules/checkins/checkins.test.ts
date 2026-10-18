// Jour J (ARCHITECTURE.md § 2.5, § 4) : scans idempotents, doublons entre appareils, horodatage, pass révoqué,
// pointage manuel et par plaque, synchro staff signée, présence et relances, inscription express.
import { createHash, randomUUID } from "node:crypto";
import {
  accessListSigningText,
  type Decide,
  encodePassMessage,
  encodePassPayload,
  fromWallTime,
  HOUR,
  MINUTE,
  type ScanBatchItem,
} from "@orasso/shared";
import { and, count, eq, sql } from "drizzle-orm";
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
import {
  accessPasses,
  checkins,
  devices,
  emailOutbox,
  eventStaff,
  expressInvites,
  notifications,
  profiles,
  scanEvents,
} from "../../db/schema";
import type { Viewer } from "../../lib/session";
import { ed25519Verify } from "../../lib/signing";
import { applicationsService } from "../applications/service";
import { notificationsService } from "../notifications/service";
import { staffService } from "../staff/service";
import { checkinsService } from "./service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

// Salon le samedi 17 octobre 2026, 10:00–18:00 ; verrouillé à 08:00.
const STARTS = paris(10, 17, 10);
const ENDS = paris(10, 17, 18);
const ACCEPT: Decide = { decision: "accept", sendReasons: true, note: null };

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let orgaV: Viewer;
let julie: TestUser; // scan + super staff
let julieV: Viewer;
let theo: TestUser; // scan
let theoV: Viewer;
let eventId: string;
let zoneJdm: string;
let julieDevice: string;
let theoDevice: string;
let people: { u: TestUser; v: Viewer; applicationId: string; passId: string; payload: string; plate: string }[];

async function device(userId: string, name: string) {
  const [d] = await db.insert(devices).values({ userId, platform: "android", name }).returning();
  return d!.id;
}

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 10, 12));
  const ref = await seedReference();
  orga = await signUp("Damien_66", { twoFactor: true });
  orgaV = await viewerOf(orga);
  const structureId = (await createStructure(orga.id)).id;
  julie = await signUp("Julie_66");
  theo = await signUp("Theo_66");
  await addMember(structureId, julie.id, "staff", ["scan", "super_staff"]);
  await addMember(structureId, theo.id, "staff", ["scan"]);
  julieV = await viewerOf(julie);
  theoV = await viewerOf(theo);
  const event = await createEvent(structureId, {
    startsAt: STARTS,
    endsAt: ENDS,
    capacity: 10,
    title: "Salon Argelès",
  });
  eventId = event.id;
  zoneJdm = (await createZone(eventId, "JDM")).id;
  people = [];
  for (const pseudo of ["Kenji_66", "Lea_11", "Nina_34"]) {
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
    await applicationsService.decide(orgaV, eventId, app!.id, { ...ACCEPT, zoneId: zoneJdm });
    const pass = (await call(u, "GET", `/applications/${app!.id}/pass`)).json;
    people.push({ u, v, applicationId: app!.id, passId: pass.passId, payload: pass.payload, plate: vehicle.plate! });
  }
  julieDevice = await device(julie.id, "Pixel de Julie");
  theoDevice = await device(theo.id, "iPhone de Théo");
  // Jour J, 09:30.
  clock.set(paris(10, 17, 9, 30));
});

type ScanItem = Extract<ScanBatchItem, { kind: "scan" }>;

/** Lecture telle que l'appli l'envoie (une décision locale « OK » par défaut). */
const scan = (passId: string | null, scannedAt: Date, over: Partial<ScanItem> = {}): ScanItem => ({
  kind: "scan",
  id: randomUUID(),
  passId,
  decision: "ok",
  reason: null,
  zoneCode: null,
  scannedAt,
  ...over,
});

describe("réception des scans", () => {
  it("premier scan : entrée enregistrée, zone renvoyée ; second appareil : doublon rapporté", async () => {
    const kenji = people[0]!;
    const first = scan(kenji.passId, paris(10, 17, 9, 12));
    const r1 = await checkinsService.receiveBatch(julieV, eventId, { deviceId: julieDevice, items: [first] });
    expect(r1.results[0]).toMatchObject({ result: "accepted", zone: { code: "JDM" } });
    expect(r1.results[0]?.checkedInAt).toBe(paris(10, 17, 9, 12).toISOString());

    const second = scan(kenji.passId, paris(10, 17, 9, 14), { decision: "already" });
    const r2 = await checkinsService.receiveBatch(theoV, eventId, { deviceId: theoDevice, items: [second] });
    expect(r2.results[0]).toMatchObject({ result: "duplicate_other_device", duplicateOf: first.id });

    const again = scan(kenji.passId, paris(10, 17, 9, 20));
    const r3 = await checkinsService.receiveBatch(julieV, eventId, { deviceId: julieDevice, items: [again] });
    expect(r3.results[0]).toMatchObject({ result: "duplicate_same_device", duplicateOf: first.id });

    const report = await checkinsService.report(orgaV, eventId);
    expect(report.totals).toMatchObject({ scans: 3, accepted: 1, checkins: 1, duplicates: 2, expected: 3 });
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0]).toMatchObject({
      pseudo: "Kenji_66",
      first: { scanId: first.id, device: "Pixel de Julie", staff: "Julie_66" },
    });
    expect(report.duplicates[0]?.others.map((o) => o.device).sort()).toEqual(["Pixel de Julie", "iPhone de Théo"]);
    expect(report.byDevice.find((d) => d.deviceName === "iPhone de Théo")).toMatchObject({ scans: 1, duplicates: 1 });
  });

  it("un scan plus ancien reçu ensuite réécrit l'entrée ; l'autre devient le doublon", async () => {
    const lea = people[1]!;
    const late = scan(lea.passId, paris(10, 17, 9, 25));
    await checkinsService.receiveBatch(julieV, eventId, { deviceId: julieDevice, items: [late] });
    // Théo était hors réseau : son scan de 09:05 arrive après.
    const early = scan(lea.passId, paris(10, 17, 9, 5));
    const r = await checkinsService.receiveBatch(theoV, eventId, { deviceId: theoDevice, items: [early] });
    expect(r.results[0]).toMatchObject({ result: "accepted", checkedInAt: paris(10, 17, 9, 5).toISOString() });
    const entry = await db.query.checkins.findFirst({ where: eq(checkins.applicationId, lea.applicationId) });
    expect(entry).toMatchObject({ sourceScanId: early.id, deviceId: theoDevice, method: "scan" });
    const old = await db.query.scanEvents.findFirst({ where: eq(scanEvents.id, late.id) });
    expect(old).toMatchObject({ serverResult: "duplicate_other_device", duplicateOfScanId: early.id });
  });

  it("lot rejoué : réponse identique, aucune écriture", async () => {
    const items = people.map((p, i) => scan(p.passId, paris(10, 17, 9, i)));
    const batch = { deviceId: julieDevice, items };
    const first = await checkinsService.receiveBatch(julieV, eventId, batch);
    const before = await db.select({ n: count() }).from(scanEvents);
    const replay = await checkinsService.receiveBatch(julieV, eventId, batch);
    expect(replay).toEqual(first);
    expect(await db.select({ n: count() }).from(scanEvents)).toEqual(before);
    expect(await db.select({ n: count() }).from(checkins)).toEqual([{ n: 3 }]);
    // Même identifiant envoyé par un autre staff : refusé, sans rien révéler.
    const stolen = await checkinsService.receiveBatch(theoV, eventId, { deviceId: theoDevice, items: [items[0]!] });
    expect(stolen.results[0]).toMatchObject({ result: "rejected", applicationId: null });
  });

  it("pass révoqué (désistement tardif) refusé ; pass inconnu signalé ; refus de l'appareil gardé", async () => {
    const nina = people[2]!;
    await applicationsService.withdraw(nina.v, nina.applicationId);
    const r = await checkinsService.receiveBatch(julieV, eventId, {
      deviceId: julieDevice,
      items: [
        scan(nina.passId, paris(10, 17, 9, 1)),
        scan(randomUUID(), paris(10, 17, 9, 2), { decision: "override" }),
        scan(people[0]!.passId, paris(10, 17, 9, 3), { decision: "refused", reason: "other_event" }),
      ],
    });
    expect(r.results.map((x) => x.result)).toEqual(["rejected", "unknown", "rejected"]);
    expect(await db.select({ n: count() }).from(checkins)).toEqual([{ n: 0 }]);
    const report = await checkinsService.report(orgaV, eventId);
    expect(report.totals).toMatchObject({ rejected: 2, unknown: 1, overrides: 1 });
  });

  it("QR relu par le serveur quand l'appareil n'a pas résolu le pass ; QR falsifié non reconnu", async () => {
    const kenji = people[0]!;
    const forgedMessage = encodePassMessage({ kid: 0, eventNo: 1, passId: kenji.passId });
    const forged = encodePassPayload(forgedMessage, new Uint8Array(64));
    const r = await checkinsService.receiveBatch(julieV, eventId, {
      deviceId: julieDevice,
      items: [
        scan(null, paris(10, 17, 9, 1), { rawPayload: forged, decision: "override" }),
        scan(null, paris(10, 17, 9, 2), { rawPayload: kenji.payload, decision: "override" }),
      ],
    });
    expect(r.results.map((x) => x.result)).toEqual(["unknown", "accepted"]);
  });

  it("horloge de l'appareil décalée de plus de 24 h : heure de réception", async () => {
    const r = await checkinsService.receiveBatch(julieV, eventId, {
      deviceId: julieDevice,
      items: [scan(people[0]!.passId, new Date(clock.now.getTime() - 3 * 24 * HOUR))],
    });
    expect(r.results[0]?.checkedInAt).toBe(clock.now.toISOString());
  });

  it("horloge hors de la fenêtre de l'événement (dans le futur, ou avant la veille) : heure de réception", async () => {
    const r = await checkinsService.receiveBatch(julieV, eventId, {
      deviceId: julieDevice,
      items: [
        scan(people[0]!.passId, new Date(clock.now.getTime() + 10 * HOUR)),
        scan(people[1]!.passId, paris(10, 15, 22)),
        scan(people[2]!.passId, new Date(clock.now.getTime() + 2 * MINUTE)),
      ],
    });
    expect(r.results.map((x) => x.checkedInAt)).toEqual([
      clock.now.toISOString(),
      clock.now.toISOString(),
      new Date(clock.now.getTime() + 2 * MINUTE).toISOString(),
    ]);
  });

  it("fenêtre : refusé avant la veille ; appareil d'un autre compte refusé", async () => {
    clock.set(paris(10, 15, 23));
    await expect(
      checkinsService.receiveBatch(julieV, eventId, {
        deviceId: julieDevice,
        items: [scan(people[0]!.passId, clock.now)],
      }),
    ).rejects.toMatchObject({ status: 423 });
    clock.set(paris(10, 17, 9));
    await expect(
      checkinsService.receiveBatch(julieV, eventId, {
        deviceId: theoDevice,
        items: [scan(people[0]!.passId, clock.now)],
      }),
    ).rejects.toMatchObject({ status: 400 });
    // Un passionné qui n'est pas du staff.
    await expect(
      checkinsService.receiveBatch(people[0]!.v, eventId, {
        deviceId: julieDevice,
        items: [scan(people[0]!.passId, clock.now)],
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("pointage manuel et par plaque", () => {
  it("manuel : 201 puis 200 ; par plaque : trouvées et non reconnues", async () => {
    const lea = people[1]!;
    const created = await call(julie, "POST", `/events/${eventId}/checkins`, { applicationId: lea.applicationId });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ method: "manual", created: true, pseudo: "Lea_11" });
    const again = await call(theo, "POST", `/events/${eventId}/checkins`, { applicationId: lea.applicationId });
    expect(again.status).toBe(200);
    expect(again.json.created).toBe(false);

    const kenji = people[0]!;
    const plates = await call(theo, "POST", `/events/${eventId}/checkins/by-plates`, {
      plates: [kenji.plate.toLowerCase().replaceAll("-", " "), "ZZ-999-ZZ"],
    });
    expect(plates.status).toBe(200);
    expect(plates.json.matched).toHaveLength(1);
    expect(plates.json.matched[0]).toMatchObject({
      applicationId: kenji.applicationId,
      method: "plate",
      created: true,
    });
    expect(plates.json.unmatched).toEqual(["ZZ-999-ZZ"]);

    const list = await call(theo, "GET", `/events/${eventId}/checkins?method=manual`);
    expect(list.json.map((x: { pseudo: string }) => x.pseudo)).toEqual(["Lea_11"]);
    // Recherche en ligne par début de plaque : la plaque n'est jamais renvoyée au staff.
    const found = await call(theo, "GET", `/events/${eventId}/search?q=${kenji.plate.slice(0, 3)}`);
    expect(found.json.some((x: { applicationId: string }) => x.applicationId === kenji.applicationId)).toBe(true);
    expect(found.text).not.toContain(kenji.plate.replaceAll("-", ""));
  });

  it("direct de l'équipe organisatrice : arrivés / attendus, staff présent", async () => {
    await checkinsService.receiveBatch(julieV, eventId, {
      deviceId: julieDevice,
      items: [scan(people[0]!.passId, paris(10, 17, 9))],
    });
    await staffService.setPresence(julieV, eventId, true);
    const live = await call(orga, "GET", `/events/${eventId}/live`);
    expect(live.json).toMatchObject({ arrived: 1, expected: 3, staffPresent: 1, staffExpected: 2 });
    expect(live.json.byZone[0]).toMatchObject({ code: "JDM", arrived: 1, expected: 3 });
    expect((await call(julie, "GET", `/events/${eventId}/live`)).status).toBe(403);
  });
});

describe("synchronisation du staff", () => {
  it("liste signée : vérifiable avec la clé publique, plaque hachée, coordonnées au super staff seulement", async () => {
    const res = await call(theo, "GET", `/events/${eventId}/staff/sync`);
    expect(res.status).toBe(200);
    const body = res.json;
    expect(body.entries).toHaveLength(3);
    expect(body.myRoles).toEqual(["scan"]);
    const kenji = body.entries.find((e: { pseudo: string }) => e.pseudo === "Kenji_66");
    expect(kenji).toMatchObject({
      status: "valid",
      zoneCode: "JDM",
      plateHint: people[0]!.plate.replaceAll("-", "").slice(0, 3),
    });
    expect(kenji.plateHash).toMatch(/^[0-9a-f]{16}$/);
    expect(kenji.contact).toBeUndefined();
    expect(res.text).not.toContain(people[0]!.plate);
    expect(res.text).not.toContain(people[0]!.plate.replaceAll("-", ""));
    // Signature : SHA-256 du JSON canonique, Ed25519, clé publiée.
    const key = body.keys.find((k: { kid: number }) => k.kid === body.signatureKid);
    const digest = createHash("sha256").update(accessListSigningText(body)).digest();
    expect(
      ed25519Verify(digest, Buffer.from(body.signature, "base64url"), Buffer.from(key.publicKey, "base64url")),
    ).toBe(true);
    // Altérée : refusée.
    body.entries[0].zoneCode = "VIP";
    const tampered = createHash("sha256").update(accessListSigningText(body)).digest();
    expect(
      ed25519Verify(tampered, Buffer.from(body.signature, "base64url"), Buffer.from(key.publicKey, "base64url")),
    ).toBe(false);

    const superStaff = (await call(julie, "GET", `/events/${eventId}/staff/sync`)).json;
    expect(superStaff.entries[0].contact).toMatchObject({ email: expect.stringContaining("@orasso.test") });
    const organizer = (await call(orga, "GET", `/events/${eventId}/staff/sync`)).json;
    expect(organizer.entries.some((e: { plate: string }) => e.plate === people[0]!.plate)).toBe(true);
    // Un passionné n'y a pas accès.
    expect((await call(people[0]!.u, "GET", `/events/${eventId}/staff/sync`)).status).toBe(403);
  });

  it("pass révoqué : ni véhicule, ni plaque, ni coordonnées dans la liste", async () => {
    await applicationsService.withdraw(people[2]!.v, people[2]!.applicationId);
    const body = (await call(julie, "GET", `/events/${eventId}/staff/sync`)).json;
    const nina = body.entries.find((e: { passId: string }) => e.passId === people[2]!.passId);
    expect(nina).toMatchObject({
      status: "revoked",
      revokedReason: "withdrawn",
      pseudo: "Nina_34",
      vehicleLabel: null,
      plateHint: null,
      plateHash: null,
      zoneCode: null,
      categories: [],
    });
    expect(nina.contact).toBeUndefined();
    const kenji = body.entries.find((e: { passId: string }) => e.passId === people[0]!.passId);
    expect(kenji.contact).toBeDefined();
  });

  it("le staff ne lit la liste que de la veille au règlement ; l'organisation toujours", async () => {
    const paths = [`/events/${eventId}/staff/sync`, `/events/${eventId}/checkins`, `/events/${eventId}/search?q=Ke`];
    clock.set(paris(10, 15, 23, 59));
    for (const p of paths) expect((await call(theo, "GET", p)).status).toBe(403);
    for (const p of paths) expect((await call(orga, "GET", p)).status).toBe(200);
    clock.set(paris(10, 16, 0, 1));
    for (const p of paths) expect((await call(theo, "GET", p)).status).toBe(200);
    clock.set(paris(10, 19, 18));
    for (const p of paths) expect((await call(theo, "GET", p)).status).toBe(403);
    for (const p of paths) expect((await call(orga, "GET", p)).status).toBe(200);
  });

  it("delta : une modification validée après la lecture, mais horodatée avant, n'est pas sautée", async () => {
    const full = (await call(theo, "GET", `/events/${eventId}/staff/sync`)).json;
    const newest = Math.max(...full.entries.map((e: { updatedAt: string }) => Date.parse(e.updatedAt)));
    expect(Date.parse(full.cursor)).toBeLessThan(newest);
    // Écriture faite juste avant la synchro (heure d'écriture < plus récente vue) mais validée juste après.
    await db
      .update(accessPasses)
      .set({ revokedAt: clock.now, revokedReason: "withdrawn", updatedAt: new Date(newest - 1) })
      .where(eq(accessPasses.id, people[2]!.passId));
    const delta = (await call(theo, "GET", `/events/${eventId}/staff/sync?since=${encodeURIComponent(full.cursor)}`))
      .json;
    expect(delta.entries.find((e: { passId: string }) => e.passId === people[2]!.passId)).toMatchObject({
      status: "revoked",
    });
  });

  it("delta : seules les entrées modifiées depuis le curseur", async () => {
    // Données plus anciennes que la marge du curseur.
    await db.execute(sql`update access_passes set updated_at = now() - interval '2 minutes'`);
    await db.execute(sql`update applications set updated_at = now() - interval '2 minutes'`);
    // La plus récente (celle du curseur, qui peut revenir) : Nina.
    await db.execute(
      sql`update access_passes set updated_at = now() - interval '1 minute' where id = ${people[2]!.passId}`,
    );
    const full = (await call(theo, "GET", `/events/${eventId}/staff/sync`)).json;
    await new Promise((r) => setTimeout(r, 5));
    await checkinsService.receiveBatch(julieV, eventId, {
      deviceId: julieDevice,
      items: [scan(people[1]!.passId, paris(10, 17, 9))],
    });
    const delta = (await call(theo, "GET", `/events/${eventId}/staff/sync?since=${encodeURIComponent(full.cursor)}`))
      .json;
    expect(delta.full).toBe(false);
    // Le curseur est inclusif (au milliseconde près) : la dernière entrée de la synchro précédente peut revenir.
    const pseudos = delta.entries.map((e: { pseudo: string }) => e.pseudo);
    expect(pseudos).toContain("Lea_11");
    expect(pseudos).not.toContain("Kenji_66");
    expect(delta.entries.find((e: { pseudo: string }) => e.pseudo === "Lea_11")).toMatchObject({
      checkinMethod: "scan",
    });
    const row = await db.query.eventStaff.findFirst({ where: eq(eventStaff.userId, theo.id) });
    expect(row?.syncedAt).toBeTruthy();
  });

  it("« Où je suis staff », présence, relances quotidiennes arrêtées le jour J, rappel au verrouillage", async () => {
    clock.set(paris(10, 14, 10));
    const mine = (await call(theo, "GET", "/me/staff-events")).json;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ roles: ["scan"], presence: "unknown", pendingSync: true, staffModeOpen: false });
    expect(await staffService.remindUnanswered()).toBe(2);
    expect(await staffService.remindUnanswered()).toBe(0); // une fois par jour
    await staffService.setPresence(theoV, eventId, false);
    clock.set(paris(10, 15, 10));
    expect(await staffService.remindUnanswered()).toBe(1); // Julie seulement
    clock.set(paris(10, 17, 7));
    expect(await staffService.remindUnanswered()).toBe(0); // jour J
    const staff = (await call(orga, "GET", `/events/${eventId}/staff`)).json;
    expect(staff.find((m: { pseudo: string }) => m.pseudo === "Julie_66")).toMatchObject({ reminderCount: 2 });

    clock.set(paris(10, 17, 8, 1));
    expect(await applicationsService.lockEvent(eventId)).toBe(true);
    const reminders = await db.query.notifications.findMany({
      where: and(eq(notifications.type, "staff_sync_reminder"), eq(notifications.eventId, eventId)),
    });
    expect(reminders.map((n) => n.userId)).toEqual([julie.id]); // Théo a dit « pas là »
  });

  it("rôles ajustés pour l'événement par l'équipe organisatrice", async () => {
    expect((await call(theo, "GET", `/events/${eventId}/applications`)).status).toBe(403);
    const patched = await call(orga, "PATCH", `/events/${eventId}/staff/${theo.id}`, { roles: ["scan", "filtering"] });
    expect(patched.status).toBe(200);
    expect(patched.json.roles).toEqual(["scan", "filtering"]);
    expect((await call(theo, "GET", `/events/${eventId}/applications`)).status).toBe(200);
  });
});

describe("terrain : alertes et main courante", () => {
  it("alerte et incident idempotents par clientId, seulement pour leur auteur", async () => {
    await staffService.setPresence(theoV, eventId, true);
    const clientId = randomUUID();
    const alert = await call(julie, "POST", `/events/${eventId}/alerts`, { clientId, message: "Besoin d'aide" });
    expect(alert.status).toBe(201);
    const again = await call(julie, "POST", `/events/${eventId}/alerts`, { clientId, message: "Besoin d'aide" });
    expect(again.json.id).toBe(alert.json.id);
    expect((await call(theo, "POST", `/events/${eventId}/alerts`, { clientId })).status).toBe(409);
    const notified = await db.query.notifications.findMany({ where: eq(notifications.type, "staff_alert") });
    expect(notified.map((n) => n.userId).sort()).toEqual([orga.id, theo.id].sort());

    const incident = { clientId: randomUUID(), occurredAt: clock.now.toISOString(), description: "Rayure au parking" };
    const i1 = await call(theo, "POST", `/events/${eventId}/incidents`, incident);
    expect(i1.status).toBe(201);
    expect((await call(theo, "POST", `/events/${eventId}/incidents`, incident)).json.id).toBe(i1.json.id);
    expect((await call(julie, "POST", `/events/${eventId}/incidents`, incident)).status).toBe(409);
    expect((await call(orga, "GET", `/events/${eventId}/incidents`)).json).toHaveLength(1);
  });
});

describe("inscription express", () => {
  it("lien par e-mail, compte + véhicule + QR + entrée express, session ouverte", async () => {
    const ref = await db.query.vehicleModels.findFirst();
    const invite = await call(julie, "POST", `/events/${eventId}/express-invites`, { email: "Nouveau@Exemple.fr" });
    expect(invite.status).toBe(201);
    const mails = await db.query.emailOutbox.findMany({ where: eq(emailOutbox.template, "express_invite") });
    expect(mails.map((m) => m.to)).toEqual(["nouveau@exemple.fr"]);
    const token = invite.json.url.split("/express/")[1];
    expect((await call(null, "GET", `/express/${token}`)).json).toMatchObject({
      used: false,
      email: "nouveau@exemple.fr",
    });
    const body = {
      pseudo: "Nouveau_66",
      password: "motdepasse-express-1",
      firstName: "Paul",
      lastName: "Nouveau",
      plate: "EX-123-PR",
      makeId: ref!.makeId,
      modelId: ref!.id,
    };
    // Lot 36 : conditions générales obligatoires ; mot de passe de 10 caractères au moins.
    expect((await call(null, "POST", `/express/${token}`, body)).status).toBe(400);
    expect(
      (await call(null, "POST", `/express/${token}`, { ...body, password: "court-123", termsAccepted: true })).status,
    ).toBe(400);
    const res = await call(null, "POST", `/express/${token}`, { ...body, termsAccepted: true });
    expect(res.status).toBe(201);
    expect(res.json.passPayload).toMatch(/^OR1/);
    const entry = await db.query.checkins.findFirst({ where: eq(checkins.applicationId, res.json.applicationId) });
    expect(entry).toMatchObject({ method: "express", staffUserId: julie.id });
    const created = await db.query.expressInvites.findFirst({ where: eq(expressInvites.email, "nouveau@exemple.fr") });
    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, created?.userId ?? "") });
    expect(profile?.termsAcceptedAt).toBeInstanceOf(Date);
    // Lien à usage unique.
    const reuse = await call(null, "POST", `/express/${token}`, {
      pseudo: "Autre_66",
      password: "motdepasse-express-2",
      firstName: "A",
      lastName: "B",
      unregistered: true,
      makeId: ref!.makeId,
      modelId: ref!.id,
      termsAccepted: true,
    });
    expect(reuse.status).toBe(409);
    expect((await call(null, "GET", `/express/${token}`)).json.used).toBe(true);
  });

  it("au plus 30 invitations par staff et par heure", async () => {
    for (let i = 0; i < 30; i++) {
      expect(
        (await call(theo, "POST", `/events/${eventId}/express-invites`, { email: `p${i}@exemple.fr` })).status,
      ).toBe(201);
    }
    expect((await call(theo, "POST", `/events/${eventId}/express-invites`, { email: "x@exemple.fr" })).status).toBe(
      429,
    );
    clock.advance(61 * MINUTE);
    expect((await call(theo, "POST", `/events/${eventId}/express-invites`, { email: "x@exemple.fr" })).status).toBe(
      201,
    );
  });

  it("refusée hors de la fenêtre du jour J", async () => {
    clock.set(paris(10, 12, 10));
    const invite = await call(julie, "POST", `/events/${eventId}/express-invites`, { email: "x@exemple.fr" });
    expect(invite.status).toBe(423);
    clock.advance(MINUTE);
  });
});
