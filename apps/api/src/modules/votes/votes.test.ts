// Lot R7l1 : votes à thème (création par rôle, modes de candidats, QR, ouverture, clôture, une voix par vote, classement
// caché, notification, règlement du podium 15 / 10 / 5, façade du prix du public). Horloge simulée, base de test.
import { type Decide, fromWallTime, notificationTypes, shouldDeliver } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addMember,
  allCategoriesId as allCategoriesIdOf,
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
  adminAuditLog,
  applications,
  assistanceRequests,
  audiencePrizeResults,
  audienceVotes,
  eventPresences,
  events,
  eventVoteCandidates,
  eventVotes,
  notifications,
  passportStamps,
  platformSettings,
  pointEntries,
  scanEvents,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
  vehicles,
  vehicleTrophies,
} from "../../db/schema";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { settingsStore } from "../../lib/settings";
import { applicationsService } from "../applications/service";
import { audiencePrizeService } from "../audience-prize/service";
import { checkinsService } from "../checkins/service";
import { notificationsService } from "../notifications/service";
import { pointsService } from "../points/service";
import { votesLifecycle } from "./lifecycle";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0, year = 2026) =>
  fromWallTime({ year, month, day, hour, minute });

// Nocturne de test : samedi 17 octobre 2026, 19:00-22:30 ; règlement le lundi 19 à 22:30.
const STARTS = paris(10, 17, 19);
const ENDS = paris(10, 17, 22, 30);
const SETTLE = paris(10, 19, 22, 30);
const ACCEPT: Decide = { decision: "accept", sendReasons: true, note: null };

type Person = { u: TestUser; v: Viewer; applicationId: string; vehicleId: string };
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;
let jpRef: { makeId: string; modelId: string; generationId: string };
let orga: TestUser;
let orgaV: Viewer;
let coOrga: TestUser;
let staff: TestUser;
let staffV: Viewer;
let outsider: TestUser;
let structureId: string;
let eventId: string;
let zoneA: string;
let p: Record<"kenji" | "lea" | "nina" | "marc", Person>;

async function enroll(
  eid: string,
  u: TestUser,
  v: Viewer,
  vehicleRef: typeof ref | typeof jpRef = ref,
  zoneId?: string,
) {
  const vehicle = await createVehicle(u.id, vehicleRef);
  const [app] = await applicationsService.apply(v, eid, {
    vehicleIds: [vehicle.id],
    rulesAccepted: true,
    followStructure: false,
    newsletterOptIn: false,
    companions: 0,
    message: null,
  });
  await applicationsService.decide(orgaV, eid, app!.id, { ...ACCEPT, ...(zoneId ? { zoneId } : {}) });
  return { applicationId: app!.id, vehicleId: vehicle.id };
}

async function checkin(person: Pick<Person, "applicationId">, at: Date, eid = eventId) {
  clock.set(at);
  return checkinsService.create(staffV, eid, { applicationId: person.applicationId, method: "manual", note: null });
}

const api = (u: TestUser | null, method: string, path = "", body?: unknown, eid = eventId) =>
  call(u, method, `/events/${eid}/votes${path}`, body);

/** Les quatre exposants entrés ; il est 20 h. */
async function enterAll() {
  await checkin(p.kenji, paris(10, 17, 19, 2));
  await checkin(p.lea, paris(10, 17, 19, 5));
  await checkin(p.nina, paris(10, 17, 19, 10));
  await checkin(p.marc, paris(10, 17, 19, 12));
  clock.set(paris(10, 17, 20));
}

const japanese = {
  title: "Plus belle japonaise",
  candidateMode: "origins",
  candidateFilter: { countries: ["JP"] },
  openMode: "manual",
};

/** Un vote à thème créé par l'organisateur ; renvoie son identifiant. */
async function createTheme(body: Record<string, unknown> = japanese, by: TestUser = orga) {
  const res = await api(by, "POST", "", body);
  expect(res.status).toBe(201);
  return res.json.id as string;
}

const allCategoriesId = () => allCategoriesIdOf(eventId);

const voteFor = (u: TestUser, voteId: string, applicationId: string) =>
  api(u, "PUT", `/${voteId}/vote`, { applicationId });

/** Une connexion WebSocket simulée, abonnée à un canal. */
function listen(channel: string) {
  const messages: { type: string; payload: Record<string, unknown> }[] = [];
  const socket = { send: (data: string) => messages.push(JSON.parse(data)), userId: undefined };
  realtime.subscribe(channel, socket);
  return { messages, stop: () => realtime.unsubscribeAll(socket) };
}

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 10, 12));
  ref = await seedReference();
  // Un constructeur japonais (la marque de référence est allemande).
  const [toyota] = await db.insert(vehicleMakes).values({ name: "Toyota", slug: "toyota", country: "JP" }).returning();
  const [supra] = await db
    .insert(vehicleModels)
    .values({ makeId: toyota!.id, name: "Supra", slug: "supra", vehicleType: "car" })
    .returning();
  const [mk4] = await db
    .insert(vehicleGenerations)
    .values({ modelId: supra!.id, name: "Mk4", yearFrom: 1993, yearTo: 2002 })
    .returning();
  jpRef = { makeId: toyota!.id, modelId: supra!.id, generationId: mk4!.id };
  orga = await signUp("Damien_66", { twoFactor: true });
  orgaV = await viewerOf(orga);
  structureId = (await createStructure(orga.id)).id;
  coOrga = await signUp("Coorga_66", { twoFactor: true });
  await addMember(structureId, coOrga.id, "co_organizer");
  staff = await signUp("Julie_66");
  await addMember(structureId, staff.id, "staff", ["scan"]);
  staffV = await viewerOf(staff);
  outsider = await signUp("Carl_75");
  eventId = (
    await createEvent(structureId, {
      title: "Béziers Night",
      format: "night",
      department: "66",
      startsAt: STARTS,
      endsAt: ENDS,
      capacity: 20,
    })
  ).id;
  zoneA = (await createZone(eventId, "ZA")).id;
  p = {} as typeof p;
  for (const [key, pseudo, vehicleRef, zone] of [
    ["kenji", "Kenji_66", jpRef, undefined],
    ["lea", "Lea_11", jpRef, undefined],
    ["nina", "Nina_34", ref, zoneA],
    ["marc", "Marc_66", ref, zoneA],
  ] as const) {
    const u = await signUp(pseudo);
    const v = await viewerOf(u);
    p[key] = { u, v, ...(await enroll(eventId, u, v, vehicleRef, zone)) };
  }
});

describe("création et droits", () => {
  it("le propriétaire et le co-organisateur créent ; le staff, un participant et un visiteur non", async () => {
    expect((await api(orga, "POST", "", japanese)).status).toBe(201);
    expect((await api(coOrga, "POST", "", { ...japanese, title: "Plus belle italienne" })).status).toBe(201);
    expect((await api(staff, "POST", "", japanese)).status).toBe(403);
    expect((await api(p.kenji.u, "POST", "", japanese)).status).toBe(403);
    expect((await api(outsider, "POST", "", japanese)).status).toBe(403);
    expect((await api(null, "POST", "", japanese)).status).toBe(401);
    const manage = await api(orga, "GET", "/manage");
    // « Toutes catégories » présent d'office + les deux votes à thème, dans l'ordre de création.
    expect(manage.json.items.map((i: { title: string }) => i.title)).toEqual([
      "Toutes catégories",
      "Plus belle japonaise",
      "Plus belle italienne",
    ]);
    expect(manage.json.canWrite).toBe(true);
  });

  it("le staff lit la console (lecture seule), pas un participant", async () => {
    await createTheme();
    const read = await api(staff, "GET", "/manage");
    expect(read.status).toBe(200);
    expect(read.json.canWrite).toBe(false);
    expect((await api(p.kenji.u, "GET", "/manage")).status).toBe(403);
    expect((await api(outsider, "GET", "/manage")).status).toBe(403);
    // Écritures du staff refusées : ouvrir, clore, ordre, retirer.
    const id = (read.json.items as { id: string; kind: string }[]).find((i) => i.kind === "theme")!.id;
    for (const [method, path] of [
      ["POST", `/${id}/open`],
      ["POST", `/${id}/close`],
      ["DELETE", `/${id}`],
      ["PATCH", `/${id}`],
    ] as const) {
      expect((await api(staff, method, path, method === "PATCH" ? { title: "Autre titre" } : undefined)).status).toBe(
        403,
      );
    }
  });

  it("validation : titre, filtre, heure, durée", async () => {
    for (const bad of [
      { ...japanese, title: "A" },
      { ...japanese, title: "x".repeat(61) },
      { ...japanese, candidateFilter: null },
      { ...japanese, candidateFilter: { countries: ["japon"] } },
      { ...japanese, openMode: "at" },
      { ...japanese, opensAt: paris(10, 17, 21).toISOString() },
      { ...japanese, durationMinutes: 0 },
      { title: "Au choix", candidateMode: "hand", candidateFilter: { countries: ["JP"] }, openMode: "manual" },
      { title: "Une zone", candidateMode: "zone", candidateFilter: null, openMode: "manual" },
    ]) {
      expect((await api(orga, "POST", "", bad)).status).toBe(400);
    }
    // Une zone d'un autre événement n'existe pas pour celui-ci.
    const other = await createEvent(structureId, { startsAt: paris(11, 7, 19), endsAt: paris(11, 7, 23) });
    const foreign = await createZone(other.id, "ZZ");
    const res = await api(orga, "POST", "", {
      title: "Zone étrangère",
      candidateMode: "zone",
      candidateFilter: { zoneId: foreign.id },
      openMode: "manual",
    });
    expect(res.status).toBe(400);
  });

  it("« Toutes catégories » est créé d'office avec l'événement, une seule fois, retirable et il ne revient pas", async () => {
    const created = await call(orga, "POST", `/structures/${structureId}/events`, {
      title: "Nocturne de Canet",
      format: "gathering",
      startsAt: paris(11, 7, 19).toISOString(),
      endsAt: paris(11, 7, 23, 30).toISOString(),
      addressLine: "Quai du Port",
      postalCode: "66140",
      city: "Canet-en-Roussillon",
      lat: 42.7,
      lng: 3.03,
      admittedVehicleTypes: ["car"],
      admission: "filtered",
      registrationsOpenAt: paris(10, 2, 10).toISOString(),
    });
    expect(created.status).toBe(201);
    const rows = await db.query.eventVotes.findMany({ where: eq(eventVotes.eventId, created.json.id) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "all_categories",
      title: "Toutes catégories",
      rareStamp: true,
      openMode: "first_entry",
    });
    // Retiré par l'organisateur : il ne revient pas (ni à la lecture, ni à la création d'un autre vote).
    expect((await api(orga, "DELETE", `/${rows[0]!.id}`, undefined, created.json.id)).status).toBe(200);
    expect((await api(orga, "GET", "/manage", undefined, created.json.id)).json.items).toHaveLength(0);
    await api(orga, "POST", "", japanese, created.json.id);
    expect((await api(orga, "GET", "/manage", undefined, created.json.id)).json.items).toHaveLength(1);
    const again = await db.query.eventVotes.findMany({ where: eq(eventVotes.eventId, created.json.id) });
    expect(again.filter((r) => r.kind === "all_categories")).toHaveLength(1);
  });

  it("autant de votes qu'on veut (au-delà de 9), plafond technique à 50", async () => {
    for (let i = 0; i < 12; i++) await createTheme({ ...japanese, title: `Concours ${i + 1}` });
    expect((await api(orga, "GET", "/manage")).json.items).toHaveLength(13);
    // 36 votes de plus en base : 49, puis le 50e (le plafond), puis le 51e refusé.
    await db.insert(eventVotes).values(
      Array.from({ length: 36 }, (_, i) => ({
        eventId,
        title: `Vote ${i}`,
        kind: "theme" as const,
        candidateMode: "all" as const,
        openMode: "manual" as const,
        position: 20 + i,
      })),
    );
    expect((await api(orga, "POST", "", { ...japanese, title: "Le cinquantième" })).status).toBe(201);
    const over = await api(orga, "POST", "", { ...japanese, title: "Le cinquante et unième" });
    expect(over.status).toBe(409);
    expect(over.json.error.code).toBe("too_many_votes");
  });

  it("modèles : les 9 titres", async () => {
    const res = await api(p.kenji.u, "GET", "/templates");
    expect(res.status).toBe(200);
    expect(res.json.items.map((t: { title: string }) => t.title)).toEqual([
      "Plus belle japonaise",
      "Plus belle allemande",
      "Plus belle italienne",
      "Plus belle américaine",
      "Plus belle youngtimer",
      "Plus belle préparation",
      "Meilleure décoration de Noël",
      "Concours de rupteur",
      "Plus beau son",
    ]);
    expect((await api(null, "GET", "/templates")).status).toBe(401);
  });

  it("ordre : l'organisateur range ses votes ; une liste incomplète est refusée", async () => {
    const a = await createTheme({ ...japanese, title: "Premier" });
    const b = await createTheme({ ...japanese, title: "Second" });
    const all = await allCategoriesId();
    expect((await api(orga, "PUT", "/order", { ids: [b, a] })).status).toBe(400);
    const ok = await api(orga, "PUT", "/order", { ids: [b, all, a] });
    expect(ok.status).toBe(200);
    expect(ok.json.items.map((i: { title: string }) => i.title)).toEqual(["Second", "Toutes catégories", "Premier"]);
    expect((await api(staff, "PUT", "/order", { ids: [a, b, all] })).status).toBe(403);
  });

  it("modifier : avant l'ouverture seulement ; « Toutes catégories » ne se modifie pas", async () => {
    await enterAll();
    const id = await createTheme();
    const patched = await api(orga, "PATCH", `/${id}`, { title: "Japonaises et plus", durationMinutes: 30 });
    expect(patched.status).toBe(200);
    expect(patched.json).toMatchObject({ title: "Japonaises et plus", durationMinutes: 30 });
    // Changer le mode des candidats sans filtre repart de zéro.
    expect((await api(orga, "PATCH", `/${id}`, { candidateMode: "all" })).json.candidateFilter).toBeNull();
    expect((await api(orga, "PATCH", `/${id}`, { candidateMode: "origins" })).status).toBe(400);
    expect((await api(orga, "POST", `/${id}/open`)).status).toBe(200);
    const locked = await api(orga, "PATCH", `/${id}`, { title: "Trop tard" });
    expect(locked.status).toBe(409);
    expect(locked.json.error.code).toBe("vote_locked");
    const fixed = await api(orga, "PATCH", `/${await allCategoriesId()}`, { title: "Autre" });
    expect(fixed.status).toBe(409);
    expect(fixed.json.error.code).toBe("vote_fixed");
  });

  it("retirer : sans voix seulement ; avec des voix, on clôt", async () => {
    await enterAll();
    const id = await createTheme({ ...japanese, candidateMode: "all", candidateFilter: null, title: "Tous" });
    await api(orga, "POST", `/${id}/open`);
    expect((await voteFor(p.nina.u, id, p.kenji.applicationId)).status).toBe(200);
    const refused = await api(orga, "DELETE", `/${id}`);
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("vote_has_voices");
    const empty = await createTheme({ ...japanese, title: "Vide" });
    expect((await api(orga, "DELETE", `/${empty}`)).status).toBe(200);
    expect((await db.query.eventVotes.findFirst({ where: eq(eventVotes.id, empty) }))?.deletedAt).toBeInstanceOf(Date);
    expect((await api(p.kenji.u, "GET", `/${empty}`)).status).toBe(404);
  });
});

describe("candidats", () => {
  it("tous, origine, zone : les véhicules entrés qui correspondent", async () => {
    await enterAll();
    const all = await allCategoriesId();
    const jp = await createTheme();
    const zone = await createTheme({
      title: "Zone A",
      candidateMode: "zone",
      candidateFilter: { zoneId: zoneA },
      openMode: "manual",
    });
    const ids = async (vote: string) =>
      ((await api(p.kenji.u, "GET", `/${vote}/candidates`)).json.items as { applicationId: string }[])
        .map((i) => i.applicationId)
        .sort();
    expect(await ids(all)).toEqual([p.kenji, p.lea, p.nina, p.marc].map((x) => x.applicationId).sort());
    expect(await ids(jp)).toEqual([p.kenji, p.lea].map((x) => x.applicationId).sort());
    expect(await ids(zone)).toEqual([p.nina, p.marc].map((x) => x.applicationId).sort());
    // Un véhicule entré plus tard rejoint un vote « tous » (comportement du lot 49).
    const late = await signUp("Pedro_66");
    clock.set(paris(10, 12, 12)); // les inscriptions se figent à l'approche du début
    const pedro = await enroll(eventId, late, await viewerOf(late));
    await checkin(pedro, paris(10, 17, 20, 30));
    expect(await ids(all)).toContain(pedro.applicationId);
    expect(await ids(jp)).not.toContain(pedro.applicationId);
  });

  it("à la main : choisis à l'avance, grisés tant qu'ils ne sont pas entrés, puis éligibles", async () => {
    const id = await createTheme({ title: "Concours de rupteur", candidateMode: "hand", openMode: "manual" });
    for (const x of [p.kenji, p.lea, p.nina]) {
      const add = await api(orga, "POST", `/${id}/candidates`, { applicationId: x.applicationId });
      expect(add.status).toBe(200);
    }
    // Aucun n'est entré : la grille les montre grisés, ils ne comptent pas encore.
    clock.set(paris(10, 17, 18, 30));
    const grid = await api(p.marc.u, "GET", `/${id}/candidates`);
    expect(grid.json.items.map((i: { eligible: boolean }) => i.eligible)).toEqual([false, false, false]);
    expect((await api(p.marc.u, "GET", `/${id}`)).json.candidatesCount).toBe(0);
    // Deux entrent, le vote se lance, la troisième reste grisée et ne reçoit pas de voix.
    await checkin(p.kenji, paris(10, 17, 19, 2));
    await checkin(p.lea, paris(10, 17, 19, 5));
    await checkin(p.marc, paris(10, 17, 19, 6));
    expect((await api(orga, "POST", `/${id}/open`)).status).toBe(200);
    const open = await api(p.marc.u, "GET", `/${id}/candidates`);
    expect(open.json.items.map((i: { eligible: boolean }) => i.eligible)).toEqual([true, true, false]);
    const refused = await voteFor(p.marc.u, id, p.nina.applicationId);
    expect(refused.status).toBe(400);
    // Nina entre : elle devient éligible.
    await checkin(p.nina, paris(10, 17, 19, 30));
    expect((await voteFor(p.marc.u, id, p.nina.applicationId)).status).toBe(200);
    expect(
      (await api(p.marc.u, "GET", `/${id}/candidates`)).json.items.every((i: { eligible: boolean }) => i.eligible),
    ).toBe(true);
  });

  it("à la main : les retenues non entrées ne sont plus servies après l'événement (règle des absents)", async () => {
    const id = await createTheme({ title: "Concours de rupteur", candidateMode: "hand", openMode: "manual" });
    await api(orga, "POST", `/${id}/candidates`, { applicationId: p.nina.applicationId });
    clock.set(ENDS);
    expect((await api(p.marc.u, "GET", `/${id}/candidates`)).json.items).toEqual([]);
  });

  it("les candidats ne changent plus une fois le vote ouvert ; retrait avant l'ouverture", async () => {
    await enterAll();
    const id = await createTheme({ title: "Concours de rupteur", candidateMode: "hand", openMode: "manual" });
    await api(orga, "POST", `/${id}/candidates`, { applicationId: p.kenji.applicationId });
    await api(orga, "POST", `/${id}/candidates`, { applicationId: p.lea.applicationId });
    await api(orga, "POST", `/${id}/candidates`, { applicationId: p.nina.applicationId });
    const removed = await api(orga, "DELETE", `/${id}/candidates/${p.nina.applicationId}`);
    expect(removed.json.handCandidates).toHaveLength(2);
    // Même candidature ajoutée deux fois : une seule ligne.
    await api(orga, "POST", `/${id}/candidates`, { applicationId: p.kenji.applicationId });
    expect(await db.query.eventVoteCandidates.findMany({ where: eq(eventVoteCandidates.voteId, id) })).toHaveLength(2);
    expect((await api(orga, "POST", `/${id}/open`)).status).toBe(200);
    const late = await api(orga, "POST", `/${id}/candidates`, { applicationId: p.marc.applicationId });
    expect(late.status).toBe(409);
    expect(late.json.error.code).toBe("vote_locked");
    expect((await api(orga, "DELETE", `/${id}/candidates/${p.kenji.applicationId}`)).status).toBe(409);
  });

  it("choisir des candidats : seulement un vote « à la main », seulement une candidature retenue de l'événement", async () => {
    const jp = await createTheme();
    const notHand = await api(orga, "POST", `/${jp}/candidates`, { applicationId: p.kenji.applicationId });
    expect(notHand.status).toBe(409);
    expect(notHand.json.error.code).toBe("not_hand");
    const hand = await createTheme({ title: "Au choix", candidateMode: "hand", openMode: "manual" });
    // Une candidature d'un autre événement, un identifiant inconnu : refusés.
    const other = await createEvent(structureId, { startsAt: paris(11, 7, 19), endsAt: paris(11, 7, 23) });
    const foreign = await enroll(other.id, p.kenji.u, p.kenji.v);
    expect((await api(orga, "POST", `/${hand}/candidates`, { applicationId: foreign.applicationId })).status).toBe(400);
    // Une candidature refusée n'est pas retenue.
    const [refusedApp] = await db
      .update(applications)
      .set({ status: "refused" })
      .where(eq(applications.id, p.marc.applicationId))
      .returning();
    expect(refusedApp?.status).toBe("refused");
    expect((await api(orga, "POST", `/${hand}/candidates`, { applicationId: p.marc.applicationId })).status).toBe(400);
    expect((await api(staff, "POST", `/${hand}/candidates`, { applicationId: p.kenji.applicationId })).status).toBe(
      403,
    );
  });

  it("par QR : un accès valide d'un véhicule entré s'ajoute (sans lecture enregistrée) ; non entré, invalide, autre événement : refusés", async () => {
    await checkin(p.kenji, paris(10, 17, 19, 2));
    const id = await createTheme({ title: "Concours de rupteur", candidateMode: "hand", openMode: "manual" });
    const passOf = async (x: Person, eid = eventId, appId = x.applicationId) =>
      (await call(x.u, "GET", `/applications/${appId}/pass`)).json.payload as string;
    const scansBefore = (await db.select().from(scanEvents)).length;
    const ok = await api(orga, "POST", `/${id}/candidates`, { qr: await passOf(p.kenji) });
    expect(ok.status).toBe(200);
    expect(ok.json.handCandidates).toMatchObject([
      { applicationId: p.kenji.applicationId, source: "scan", entered: true },
    ]);
    expect((await db.select().from(scanEvents)).length).toBe(scansBefore);
    // Retenue mais pas entrée : on ne l'ajoute pas par QR (elle est sur place, mais pas pointée).
    const notIn = await api(orga, "POST", `/${id}/candidates`, { qr: await passOf(p.lea) });
    expect(notIn.status).toBe(409);
    expect(notIn.json.error.code).toBe("not_checked_in");
    // QR forgé ou n'importe quel texte.
    const bad = await api(orga, "POST", `/${id}/candidates`, { qr: "orasso:pass:faux" });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("invalid_qr");
    // QR d'une candidature d'un autre événement.
    const other = await createEvent(structureId, { startsAt: paris(11, 7, 19), endsAt: paris(11, 7, 23) });
    const foreign = await enroll(other.id, p.kenji.u, p.kenji.v);
    const wrong = await api(orga, "POST", `/${id}/candidates`, {
      qr: await passOf(p.kenji, other.id, foreign.applicationId),
    });
    expect(wrong.status).toBe(409);
    expect(wrong.json.error.code).toBe("other_event");
  });
});

describe("ouverture et clôture", () => {
  it("à la main : refusé sous deux candidats entrés, puis lancé une seule fois, avec une notification aux présents", async () => {
    await checkin(p.kenji, paris(10, 17, 19, 2));
    clock.set(paris(10, 17, 19, 30));
    const id = await createTheme({ ...japanese, candidateMode: "all", candidateFilter: null, title: "Tous" });
    const few = await api(orga, "POST", `/${id}/open`);
    expect(few.status).toBe(409);
    expect(few.json.error.code).toBe("not_enough_candidates");
    await checkin(p.lea, paris(10, 17, 19, 31));
    expect((await api(p.lea.u, "GET", `/${id}`)).json.state).toBe("upcoming");
    const opened = await api(coOrga, "POST", `/${id}/open`);
    expect(opened.status).toBe(200);
    expect(opened.json).toMatchObject({ state: "open" });
    expect((await api(p.lea.u, "GET", `/${id}`)).json.state).toBe("open");
    // Une seule fois par vote : relancer est refusé et n'envoie rien de plus.
    const again = await api(orga, "POST", `/${id}/open`);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("vote_locked");
    await votesLifecycle.syncEvent(eventId);
    await votesLifecycle.sweep();
    const sent = await db.query.notifications.findMany({ where: eq(notifications.type, "vote_opened") });
    // Présents : Kenji, Lea (entrés) et Julie (staff, elle a pointé).
    expect(sent.map((n) => n.userId).sort()).toEqual([p.kenji.u.id, p.lea.u.id, staff.id].sort());
    expect(sent.every((n) => n.data && (n.data as { voteId?: string }).voteId === id)).toBe(true);
    // Ni l'organisateur absent, ni une retenue pas entrée, ni un inconnu.
    expect(sent.some((n) => [orga.id, p.nina.u.id, outsider.id].includes(n.userId))).toBe(false);
  });

  it("la notification « vote lancé » se coupe dans les réglages (type de la famille événement, jamais staff ni compte)", () => {
    expect(notificationTypes.vote_opened).toBe("event");
    expect(shouldDeliver(null, [], "vote_opened")).toBe(true);
    expect(shouldDeliver(null, ["vote_opened"], "vote_opened")).toBe(false);
  });

  it("le présent par GPS et le billet contrôlé sont prévenus aussi", async () => {
    await enterAll();
    const gps = await signUp("Gina_75");
    await db.insert(eventPresences).values({ eventId, userId: gps.id, validatedAt: paris(10, 17, 19, 40) });
    const id = await createTheme({ ...japanese, candidateMode: "all", candidateFilter: null, title: "Tous" });
    await api(orga, "POST", `/${id}/open`);
    const sent = await db.query.notifications.findMany({ where: eq(notifications.type, "vote_opened") });
    expect(sent.map((n) => n.userId)).toContain(gps.id);
  });

  it("à l'heure fixée : ouvre à l'heure (tâche), prévient une fois, ferme au bout de la durée", async () => {
    await enterAll();
    clock.set(paris(10, 17, 19, 30));
    const id = await createTheme({
      ...japanese,
      candidateMode: "all",
      candidateFilter: null,
      title: "Tous à 21 h",
      openMode: "at",
      opensAt: paris(10, 17, 21).toISOString(),
      durationMinutes: 30,
    });
    // Les tâches sont planifiées : ouverture à 21 h, clôture à 21 h 30.
    expect(clock.jobs.jobs.filter((j) => j.name === "votes.open" || j.name === "votes.close")).toHaveLength(2);
    clock.set(paris(10, 17, 20, 59));
    await votesLifecycle.sweep();
    expect((await api(p.kenji.u, "GET", `/${id}`)).json.state).toBe("upcoming");
    expect(await db.query.notifications.findMany({ where: eq(notifications.type, "vote_opened") })).toHaveLength(0);
    clock.set(paris(10, 17, 21));
    await votesLifecycle.sweep();
    await votesLifecycle.sweep();
    expect((await api(p.kenji.u, "GET", `/${id}`)).json.state).toBe("open");
    // Une seule notification par présent, malgré deux balayages.
    expect(await db.query.notifications.findMany({ where: eq(notifications.type, "vote_opened") })).toHaveLength(5);
    expect((await db.query.eventVotes.findFirst({ where: eq(eventVotes.id, id) }))?.openedAt).toEqual(
      paris(10, 17, 21),
    );
    clock.set(paris(10, 17, 21, 30));
    const ws = listen(`event:${eventId}:votes`);
    await votesLifecycle.sweep();
    ws.stop();
    expect(ws.messages.filter((m) => m.type === "votes.closed")).toEqual([
      expect.objectContaining({ payload: { voteId: id } }),
    ]);
    expect((await api(p.kenji.u, "GET", `/${id}`)).json).toMatchObject({ state: "closed", canVote: false });
    expect((await db.query.eventVotes.findFirst({ where: eq(eventVotes.id, id) }))?.closedAt).toEqual(
      paris(10, 17, 21, 30),
    );
  });

  it("« Toutes catégories » s'ouvre au premier pointage dès deux véhicules, sans notification", async () => {
    const all = await allCategoriesId();
    await checkin(p.kenji, paris(10, 17, 19, 2));
    expect((await api(p.lea.u, "GET", `/${all}`)).json.state).toBe("upcoming");
    const ws = listen(`event:${eventId}:votes`);
    await checkin(p.lea, paris(10, 17, 19, 5));
    ws.stop();
    expect((await api(p.lea.u, "GET", `/${all}`)).json.state).toBe("open");
    expect(ws.messages.filter((m) => m.type === "votes.opened")).toHaveLength(1);
    expect((await db.query.eventVotes.findFirst({ where: eq(eventVotes.id, all) }))?.openedAt).toEqual(
      paris(10, 17, 19, 2),
    );
    expect(await db.query.notifications.findMany({ where: eq(notifications.type, "vote_opened") })).toHaveLength(0);
  });

  it("clôture à la main : le vote est clos, le classement devient public, on ne vote plus", async () => {
    await enterAll();
    const id = await createTheme();
    expect((await api(orga, "POST", `/${id}/close`)).status).toBe(409); // pas encore ouvert
    await api(orga, "POST", `/${id}/open`);
    expect((await voteFor(p.nina.u, id, p.kenji.applicationId)).status).toBe(200);
    const ws = listen(`event:${eventId}:votes`);
    const closed = await api(coOrga, "POST", `/${id}/close`);
    expect(closed.status).toBe(200);
    expect(closed.json).toMatchObject({ state: "closed" });
    ws.stop();
    expect(ws.messages.some((m) => m.type === "votes.closed")).toBe(true);
    const late = await voteFor(p.marc.u, id, p.lea.applicationId);
    expect(late.status).toBe(409);
    expect(late.json.error.code).toBe("vote_closed");
    // Tout le monde lit le classement, y compris qui n'a pas voté ni pu voter.
    const view = (await api(outsider, "GET", `/${id}`)).json;
    expect(view.ranking).toMatchObject([{ applicationId: p.kenji.applicationId, votes: 1, rank: 1 }, { rank: 2 }]);
    expect(view.rankingHiddenReason).toBeNull();
  });

  it("la fin de l'événement clôt tout vote ouvert", async () => {
    await enterAll();
    const id = await createTheme();
    await api(orga, "POST", `/${id}/open`);
    clock.set(ENDS);
    expect((await api(p.kenji.u, "GET", `/${id}`)).json.state).toBe("closed");
    await votesLifecycle.sweep();
    expect((await db.query.eventVotes.findFirst({ where: eq(eventVotes.id, id) }))?.closedAt).toEqual(ENDS);
    // Lancer un vote d'un événement fini est refusé.
    const late = await createTheme({ ...japanese, title: "Prévu" }).catch(() => null);
    expect(late).toBeNull();
  });
});

describe("voter", () => {
  it("une voix par vote, modifiable ; deux votes, deux voix ; jamais pour soi", async () => {
    await enterAll();
    const all = await allCategoriesId();
    const jp = await createTheme();
    await api(orga, "POST", `/${jp}/open`);
    // Nina vote dans « Toutes catégories » pour Kenji, puis change pour Marc.
    expect((await voteFor(p.nina.u, all, p.kenji.applicationId)).json.myVote).toBe(p.kenji.applicationId);
    const moved = await voteFor(p.nina.u, all, p.marc.applicationId);
    expect(moved.json).toMatchObject({ myVote: p.marc.applicationId, total: 1 });
    // Dans « Plus belle japonaise », une autre voix : les deux comptent.
    expect((await voteFor(p.nina.u, jp, p.lea.applicationId)).json).toMatchObject({
      myVote: p.lea.applicationId,
      total: 1,
    });
    const mine = await db.query.audienceVotes.findMany({ where: eq(audienceVotes.voterUserId, p.nina.u.id) });
    expect(mine.map((m) => m.voteId).sort()).toEqual([all, jp].sort());
    // Pas pour soi, ni dans l'un ni dans l'autre.
    const own = await voteFor(p.kenji.u, jp, p.kenji.applicationId);
    expect(own.status).toBe(400);
    expect(own.json.error.code).toBe("own_vehicle");
    // Un véhicule entré mais qui ne concourt pas à ce vote : refusé.
    const wrong = await voteFor(p.nina.u, jp, p.marc.applicationId);
    expect(wrong.status).toBe(400);
  });

  it("qui peut voter : pointé, billet, staff, GPS ; pas un inconnu ; pas avant l'ouverture", async () => {
    // Une retenue qui ne viendra pas (inscrite bien avant : les inscriptions se figent à l'approche du début).
    const absent = await signUp("Absent_66");
    const away = await enroll(eventId, absent, await viewerOf(absent));
    clock.set(paris(10, 17, 18, 30));
    const all = await allCategoriesId();
    // Avant le premier pointage, personne n'est présent ; un seul véhicule entré : présent, mais pas de choix possible.
    expect((await voteFor(p.kenji.u, all, p.lea.applicationId)).json.error.code).toBe("not_checked_in");
    await checkin(p.kenji, paris(10, 17, 19, 2));
    expect((await voteFor(p.kenji.u, all, p.lea.applicationId)).json.error.code).toBe("vote_not_open");
    await enterAll();
    const stranger = await voteFor(outsider, all, p.kenji.applicationId);
    expect(stranger.status).toBe(403);
    expect(stranger.json.error.code).toBe("not_checked_in");
    // Staff présent (il a pointé), visiteur validé par GPS : votent.
    expect((await voteFor(staff, all, p.kenji.applicationId)).status).toBe(200);
    const gps = await signUp("Gina_75");
    await db.insert(eventPresences).values({ eventId, userId: gps.id, validatedAt: paris(10, 17, 19, 40) });
    expect((await voteFor(gps, all, p.lea.applicationId)).status).toBe(200);
    // Une retenue non entrée ne vote pas.
    expect((await voteFor(absent, all, p.kenji.applicationId)).json.error.code).toBe("not_checked_in");
    // Et ne reçoit pas de voix.
    expect((await voteFor(p.nina.u, all, away.applicationId)).status).toBe(400);
    expect((await voteFor(p.nina.u, all, "00000000-0000-4000-8000-000000000000")).status).toBe(400);
    expect((await api(null, "PUT", `/${all}/vote`, { applicationId: p.kenji.applicationId })).status).toBe(401);
  });

  it("classement caché avant ma voix, visible après, visible de l'équipe et du staff, visible de tous à la clôture", async () => {
    await enterAll();
    const id = await createTheme({ ...japanese, candidateMode: "all", candidateFilter: null, title: "Tous" });
    await api(orga, "POST", `/${id}/open`);
    await voteFor(p.nina.u, id, p.kenji.applicationId);
    // Qui n'a pas voté et peut voter : « après ton vote ».
    const hidden = (await api(p.marc.u, "GET", `/${id}`)).json;
    expect(hidden).toMatchObject({ ranking: null, rankingHiddenReason: "vote_first", canVote: true, total: 1 });
    // Qui ne peut pas voter (pas présent) : « à la clôture ».
    const away = (await api(outsider, "GET", `/${id}`)).json;
    expect(away).toMatchObject({ ranking: null, rankingHiddenReason: "not_closed", canVote: false });
    // La liste applique la même règle.
    const list = (await api(p.marc.u, "GET")).json.items as { id: string; ranking: unknown }[];
    expect(list.find((v) => v.id === id)?.ranking).toBeNull();
    // Après sa voix : visible.
    await voteFor(p.marc.u, id, p.kenji.applicationId);
    const seen = (await api(p.marc.u, "GET", `/${id}`)).json;
    expect(seen.ranking[0]).toMatchObject({ applicationId: p.kenji.applicationId, votes: 2, rank: 1 });
    expect(seen.rankingHiddenReason).toBeNull();
    // L'équipe : propriétaire, co-organisateur et staff de la structure, sans avoir voté.
    for (const who of [orga, coOrga, staff]) {
      expect((await api(who, "GET", `/${id}`)).json.ranking).toMatchObject([
        { rank: 1 },
        { rank: 2 },
        { rank: 3 },
        { rank: 4 },
      ]);
    }
    // La console de l'organisateur porte le classement complet.
    expect(
      (await api(orga, "GET", "/manage")).json.items.find((i: { id: string }) => i.id === id).ranking[0],
    ).toMatchObject({ votes: 2 });
    // À la clôture : tout le monde, y compris qui n'a pas pu voter.
    await api(orga, "POST", `/${id}/close`);
    expect((await api(outsider, "GET", `/${id}`)).json.ranking[0]).toMatchObject({
      applicationId: p.kenji.applicationId,
      votes: 2,
    });
  });

  it("un super admin sans demande d'aide ne voit pas le classement ; avec, c'est tracé", async () => {
    await enterAll();
    const id = await createTheme({ ...japanese, candidateMode: "all", candidateFilter: null, title: "Tous" });
    await api(orga, "POST", `/${id}/open`);
    const admin = await signUp("Admin_66", { twoFactor: true, role: "super_admin" });
    expect((await api(admin, "GET", `/${id}`)).json.ranking).toBeNull();
    await db.insert(assistanceRequests).values({ structureId, requestedBy: orga.id, message: "Besoin d'aide" });
    expect((await api(admin, "GET", `/${id}`)).json.ranking).not.toBeNull();
    const audit = await db.query.adminAuditLog.findMany({ where: eq(adminAuditLog.actorUserId, admin.id) });
    expect(audit.some((a) => a.action === "structure.view_as" && a.reason === "audience_prize.ranking")).toBe(true);
  });

  it("le canal ne porte jamais de classement : { voteId, total, state, top3: [] }", async () => {
    await enterAll();
    const id = await createTheme({ ...japanese, candidateMode: "all", candidateFilter: null, title: "Tous" });
    await api(orga, "POST", `/${id}/open`);
    const ws = listen(`event:${eventId}:votes`);
    await voteFor(p.nina.u, id, p.kenji.applicationId);
    await vi.waitFor(() => expect(ws.messages.some((m) => m.type === "votes.changed")).toBe(true), { timeout: 4000 });
    ws.stop();
    for (const m of ws.messages.filter((x) => x.type === "votes.changed")) {
      expect(Object.keys(m.payload).sort()).toEqual(["state", "top3", "total", "voteId"]);
      expect(m.payload).toMatchObject({ voteId: id, total: 1, state: "open", top3: [] });
    }
    expect(await realtime.canSubscribe(p.kenji.u.id, `event:${eventId}:votes`)).toBe(true);
  });

  it("événement non lisible : brouillon introuvable, privé refusé à un tiers", async () => {
    const draft = await createEvent(structureId, {
      status: "draft",
      startsAt: paris(11, 7, 19),
      endsAt: paris(11, 7, 23),
    });
    expect((await api(p.kenji.u, "GET", "", undefined, draft.id)).status).toBe(404);
    expect((await api(p.kenji.u, "GET", "", undefined, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await api(null, "GET")).status).toBe(401);
  });
});

describe("règlement à J+2", () => {
  async function playedEvening() {
    await enterAll();
    const all = await allCategoriesId();
    const jp = await createTheme();
    await api(orga, "POST", `/${jp}/open`);
    // « Toutes catégories » : Marc 3 voix, Kenji 2, Lea 1 ; « Plus belle japonaise » : Kenji 2 voix, Lea 1.
    const gina = await signUp("Gina_75");
    await db.insert(eventPresences).values({ eventId, userId: gina.id, validatedAt: paris(10, 17, 19, 40) });
    for (const [voter, target] of [
      [p.kenji.u, p.marc],
      [p.lea.u, p.marc],
      [p.nina.u, p.marc],
      [p.marc.u, p.kenji],
      [staff, p.kenji],
      [gina, p.lea],
    ] as const) {
      await voteFor(voter, all, target.applicationId);
    }
    for (const [voter, target] of [
      [p.nina.u, p.kenji],
      [p.marc.u, p.kenji],
      [staff, p.lea],
    ] as const) {
      await voteFor(voter, jp, target.applicationId);
    }
    return { all, jp };
  }

  it("podium de chaque vote, trophées, une seule ligne de points par voiture (son meilleur rang), tampon rare seulement pour « Toutes catégories »", async () => {
    const { all, jp } = await playedEvening();
    clock.set(SETTLE);
    expect(await pointsService.settleEvent(eventId)).toBe(true);
    // Résultats par vote.
    const results = await db.query.audiencePrizeResults.findMany({ where: eq(audiencePrizeResults.eventId, eventId) });
    const of = (vote: string) =>
      results
        .filter((r) => r.voteId === vote)
        .sort((a, b) => a.rank - b.rank)
        .map((r) => [r.applicationId, r.rank, r.votes, r.winner]);
    expect(of(all)).toEqual([
      [p.marc.applicationId, 1, 3, true],
      [p.kenji.applicationId, 2, 2, false],
      [p.lea.applicationId, 3, 1, false],
    ]);
    expect(of(jp)).toEqual([
      [p.kenji.applicationId, 1, 2, true],
      [p.lea.applicationId, 2, 1, false],
    ]);
    // Trophées : rangs 1 à 3 de chaque vote.
    const trophies = await db.query.vehicleTrophies.findMany({ where: eq(vehicleTrophies.eventId, eventId) });
    expect(trophies).toHaveLength(5);
    expect(trophies.find((t) => t.voteId === jp && t.vehicleId === p.kenji.vehicleId)).toMatchObject({
      rank: 1,
      voteTitle: "Plus belle japonaise",
      eventTitle: "Béziers Night",
    });
    // Une seule ligne par voiture : Kenji 2e de « Toutes catégories » et 1er du vote japonais → 15 (son meilleur rang).
    const entries = await db.query.pointEntries.findMany({
      where: and(eq(pointEntries.eventId, eventId), eq(pointEntries.kind, "vote_podium")),
    });
    const by = (x: Person) => entries.filter((e) => e.applicationId === x.applicationId).map((e) => e.points);
    expect(by(p.marc)).toEqual([15]);
    expect(by(p.kenji)).toEqual([15]);
    expect(by(p.lea)).toEqual([10]); // 3e de « Toutes catégories » (5), 2e du vote japonais (10)
    expect(entries).toHaveLength(3);
    // Tampon rare et compteur : le premier de « Toutes catégories » seul (Marc), pas le premier du vote japonais.
    const stamps = await db.query.passportStamps.findMany({ where: eq(passportStamps.kind, "audience_prize") });
    expect(stamps.map((s) => s.userId)).toEqual([p.marc.u.id]);
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, p.marc.vehicleId) }))?.audiencePrizes).toBe(1);
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, p.kenji.vehicleId) }))?.audiencePrizes).toBe(0);
    // Notifications : vote_won au premier de chaque vote, vote_podium aux autres marches, une par trophée.
    const won = await db.query.notifications.findMany({ where: eq(notifications.type, "vote_won") });
    expect(won.map((n) => n.userId).sort()).toEqual([p.marc.u.id, p.kenji.u.id].sort());
    const podium = await db.query.notifications.findMany({ where: eq(notifications.type, "vote_podium") });
    expect(podium).toHaveLength(3);
    // Ni l'ancien type ni l'ancienne ligne de points.
    expect(await db.query.pointEntries.findMany({ where: eq(pointEntries.kind, "audience_prize") })).toHaveLength(0);
    expect(await db.query.notifications.findMany({ where: eq(notifications.type, "audience_prize_won") })).toHaveLength(
      0,
    );
  });

  it("idempotent : un règlement rejoué ne double ni points, ni trophées, ni compteur, ni notifications", async () => {
    await playedEvening();
    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
    const snapshot = async () => ({
      entries: (await db.query.pointEntries.findMany({ where: eq(pointEntries.kind, "vote_podium") })).length,
      trophies: (await db.query.vehicleTrophies.findMany()).length,
      results: (await db.query.audiencePrizeResults.findMany()).length,
      notifications: (await db.query.notifications.findMany()).length,
      prizes: (await db.query.vehicles.findFirst({ where: eq(vehicles.id, p.marc.vehicleId) }))?.audiencePrizes,
    });
    const first = await snapshot();
    await db.update(events).set({ settledAt: null }).where(eq(events.id, eventId));
    await pointsService.settleEvent(eventId);
    expect(await snapshot()).toEqual(first);
  });

  it("seuils inchangés par vote : pas de podium sous trois voix ni sous deux candidats entrés", async () => {
    await enterAll();
    const jp = await createTheme();
    await api(orga, "POST", `/${jp}/open`);
    // Deux voix seulement dans le vote japonais, rien dans « Toutes catégories ».
    await voteFor(p.nina.u, jp, p.kenji.applicationId);
    await voteFor(p.marc.u, jp, p.lea.applicationId);
    // Un vote à la main avec deux candidats, dont un seul entré : jamais ouvert, pas de podium.
    const hand = await createTheme({ title: "Rupteur", candidateMode: "hand", openMode: "manual" });
    await api(orga, "POST", `/${hand}/candidates`, { applicationId: p.kenji.applicationId });
    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
    expect(await db.query.pointEntries.findMany({ where: eq(pointEntries.kind, "vote_podium") })).toHaveLength(0);
    expect(await db.query.vehicleTrophies.findMany()).toHaveLength(0);
    const results = await db.query.audiencePrizeResults.findMany();
    expect(results.some((r) => r.winner)).toBe(false);
    expect(await db.query.notifications.findMany({ where: eq(notifications.type, "vote_won") })).toHaveLength(0);
  });

  it("les points du podium se règlent dans l'administration (15 / 10 / 5 par défaut, lus à chaque règlement)", async () => {
    await playedEvening();
    await db.insert(platformSettings).values([
      { key: "points.vote_first", value: 40 },
      { key: "points.vote_second", value: 0 },
      { key: "points.vote_third", value: 3 },
    ]);
    settingsStore.invalidate();
    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
    const entries = await db.query.pointEntries.findMany({ where: eq(pointEntries.kind, "vote_podium") });
    const by = (x: Person) => entries.filter((e) => e.applicationId === x.applicationId).map((e) => e.points);
    expect(by(p.marc)).toEqual([40]);
    expect(by(p.kenji)).toEqual([40]);
    // Lea : 3e (3 points) et 2e du vote japonais (0 point) → meilleur rang = 2e = 0 point : aucune ligne.
    expect(by(p.lea)).toEqual([]);
    // Mais son trophée existe quand même.
    expect(
      await db.query.vehicleTrophies.findMany({ where: eq(vehicleTrophies.vehicleId, p.lea.vehicleId) }),
    ).toHaveLength(2);
  });

  it("un vote retiré n'est pas réglé ; l'ancienne clé « Prix du public » en base est ignorée", async () => {
    await enterAll();
    const all = await allCategoriesId();
    await api(orga, "DELETE", `/${all}`);
    await db.insert(platformSettings).values({ key: "points.audience_prize", value: 99 });
    settingsStore.invalidate();
    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
    expect(await db.query.audiencePrizeResults.findMany()).toHaveLength(0);
    const admin = await signUp("Admin_66", { twoFactor: true, role: "super_admin" });
    const settings = await call(admin, "GET", "/admin/settings");
    const keys = (settings.json.entries as { key: string }[]).map((s) => s.key);
    expect(keys).not.toContain("points.audience_prize");
    expect(keys).toEqual(expect.arrayContaining(["points.vote_first", "points.vote_second", "points.vote_third"]));
    const set = await call(admin, "PUT", "/admin/settings/points.vote_first", { value: 20 });
    expect(set.status).toBe(200);
    expect((await call(admin, "PUT", "/admin/settings/points.vote_first", { value: -1 })).status).toBe(400);
    // L'ancienne clé n'est plus un réglage : refusée comme toute clé inconnue.
    expect((await call(admin, "PUT", "/admin/settings/points.audience_prize", { value: 10 })).status).toBe(400);
  });

  it("le récap projette le podium (meilleur rang par voiture) avant le règlement", async () => {
    await playedEvening();
    clock.set(paris(10, 18, 12));
    const recap = (await call(p.kenji.u, "GET", `/me/recaps/${eventId}`)).json;
    expect(recap.points.status).toBe("projected");
    expect(recap.points.detail).toEqual(
      expect.arrayContaining([{ kind: "vote_podium", points: 15, label: "Podium d'un vote" }]),
    );
  });
});

describe("façade du prix du public (retrait en R8)", () => {
  it("renvoie les formes d'avant, tirées de « Toutes catégories »", async () => {
    await enterAll();
    const all = await allCategoriesId();
    const ok = await call(p.nina.u, "PUT", `/events/${eventId}/audience-prize/vote`, {
      applicationId: p.kenji.applicationId,
    });
    expect(ok.json).toMatchObject({ canVote: true, votedFor: p.kenji.applicationId, open: true });
    const board = (await call(p.nina.u, "GET", `/events/${eventId}/audience-prize`)).json;
    expect(Object.keys(board).sort()).toEqual(
      [
        "closesAt",
        "entries",
        "eventId",
        "open",
        "rankingHidden",
        "settled",
        "total",
        "vehicles",
        "winner",
        "winnerPoints",
      ].sort(),
    );
    expect(board).toMatchObject({ open: true, total: 1, vehicles: 4, winnerPoints: 15, rankingHidden: false });
    // Même réponse que le détail du vote.
    const detail = (await api(p.nina.u, "GET", `/${all}`)).json;
    expect(board.entries).toEqual(detail.ranking);
    expect((await call(p.marc.u, "GET", `/events/${eventId}/audience-prize`)).json).toMatchObject({
      rankingHidden: true,
      entries: [],
    });
    const grid = (await call(p.nina.u, "GET", `/events/${eventId}/audience-prize/candidates`)).json;
    expect(grid.items).toHaveLength(4);
    expect(Object.keys(grid.items[0]).sort()).toEqual(["applicationId", "photoUrl", "pseudo", "vehicleLabel"]);
  });

  it("vote « Toutes catégories » retiré : réponses neutres, pas d'erreur pour l'ancienne appli", async () => {
    await enterAll();
    await api(orga, "DELETE", `/${await allCategoriesId()}`);
    const mine = (await call(p.nina.u, "GET", `/events/${eventId}/audience-prize/mine`)).json;
    expect(mine).toMatchObject({ canVote: false, reason: "vote_closed", open: false });
    const board = (await call(p.nina.u, "GET", `/events/${eventId}/audience-prize`)).json;
    expect(board).toMatchObject({ open: false, entries: [], winner: null, total: 0 });
    expect((await call(p.nina.u, "GET", `/events/${eventId}/audience-prize/candidates`)).json).toEqual({
      items: [],
      next: null,
    });
    expect(await audiencePrizeService.mine(await viewerOf(p.nina.u), eventId)).toMatchObject({ canVote: false });
  });
});
