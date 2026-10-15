import { fromWallTime, HOUR } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
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
  applicationEvents,
  applications,
  emailOutbox,
  events,
  notifications,
  structureBans,
  structureFollows,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import type { Viewer } from "../../lib/session";
import { eventJobs } from "../events/jobs";
import { eventsService } from "../events/service";
import { notificationsService } from "../notifications/service";
import { applicationsService } from "./service";

afterAll(async () => {
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

// Événement le samedi 20 juin 2026 à 18:00 (Paris), verrouillé à 16:00.
const STARTS = paris(6, 20, 18);

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;
let orga: TestUser;
let orgaV: Viewer;
let structureId: string;

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(6, 10, 10));
  ref = await seedReference();
  orga = await signUp("Damien_66", { twoFactor: true });
  orgaV = await viewerOf(orga);
  structureId = (await createStructure(orga.id)).id;
});

async function participant(pseudo: string, nVehicles = 1) {
  const u = await signUp(pseudo);
  const vs = [];
  for (let i = 0; i < nVehicles; i++) vs.push(await createVehicle(u.id, ref));
  return { u, v: await viewerOf(u), vehicles: vs };
}

const form = (vehicleIds: string[]) => ({
  vehicleIds,
  rulesAccepted: true as const,
  followStructure: true,
  newsletterOptIn: false,
  companions: 0,
  message: null,
});

async function event(overrides: Partial<typeof events.$inferInsert> = {}) {
  return createEvent(structureId, { startsAt: STARTS, endsAt: paris(6, 20, 23), capacity: 2, ...overrides });
}

async function applyAs(p: Awaited<ReturnType<typeof participant>>, eventId: string) {
  const [app] = await applicationsService.apply(p.v, eventId, form(p.vehicles.map((x) => x.id)));
  if (!app) throw new Error("candidature absente");
  return app;
}

const decide = (eventId: string, appId: string, decision: "accept" | "waitlist" | "refuse", extra = {}) =>
  applicationsService.decide(orgaV, eventId, appId, { decision, sendReasons: true, ...extra } as never);

const statusOf = async (id: string) =>
  (await db.query.applications.findFirst({ where: eq(applications.id, id) }))?.status;

describe("candidater", () => {
  it("une candidature « En attente » par véhicule ; suivi de l'organisateur ; transition journalisée", async () => {
    const e = await event({ maxVehiclesPerUser: 2 });
    const p = await participant("Kenji_66", 2);
    const created = await applicationsService.apply(p.v, e.id, {
      ...form(p.vehicles.map((x) => x.id)),
      newsletterOptIn: true,
    });
    expect(created.map((a) => a.status)).toEqual(["pending", "pending"]);
    const follow = await db.query.structureFollows.findFirst({ where: eq(structureFollows.userId, p.u.id) });
    expect(follow?.source).toBe("application");
    const journal = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, created[0]!.id));
    expect(journal).toMatchObject([{ fromStatus: null, toStatus: "pending", actor: "user" }]);
    const me = await call(p.u, "GET", "/me");
    expect(me.json.profile.newsletterOptIn).toBe(true);
  });

  it("admission sans sélection : retenue d'office, puis liste d'attente quand c'est complet", async () => {
    const e = await event({ admission: "open", capacity: 1 });
    const [a, b] = [await participant("Libre_A"), await participant("Libre_B")];
    expect((await applyAs(a, e.id)).status).toBe("accepted");
    expect((await applyAs(b, e.id)).status).toBe("waitlisted");
    const journal = await db.select().from(applicationEvents).where(eq(applicationEvents.toStatus, "accepted"));
    expect(journal[0]).toMatchObject({ fromStatus: "pending", actor: "system", reason: "admission.open" });
    await applicationsService.withdraw(
      a.v,
      (await db.query.applications.findFirst({ where: eq(applications.userId, a.u.id) }))!.id,
    );
    expect((await db.query.applications.findFirst({ where: eq(applications.userId, b.u.id) }))?.status).toBe("offered");
  });

  it("« Suivre l'organisateur » décochée : pas de suivi", async () => {
    const e = await event();
    const p = await participant("Lea_11");
    await applicationsService.apply(p.v, e.id, { ...form([p.vehicles[0]!.id]), followStructure: false });
    expect(await db.query.structureFollows.findFirst({ where: eq(structureFollows.userId, p.u.id) })).toBeUndefined();
  });

  it("refusée : véhicule non actif, sans photo, type non admis", async () => {
    const e = await event({ admittedVehicleTypes: ["car"] });
    const p = await participant("Marc_66");
    const sold = await createVehicle(p.u.id, ref, { status: "sold", plate: null, plateNormalized: null });
    await expect(applicationsService.apply(p.v, e.id, form([sold.id]))).rejects.toMatchObject({ status: 400 });
    const bare = await createVehicle(p.u.id, ref);
    await db.delete(vehiclePhotos).where(eq(vehiclePhotos.vehicleId, bare.id));
    await expect(applicationsService.apply(p.v, e.id, form([bare.id]))).rejects.toMatchObject({ status: 400 });
    const moto = await createVehicle(p.u.id, ref, { vehicleType: "moto", modelId: ref.motoModelId });
    await expect(applicationsService.apply(p.v, e.id, form([moto.id]))).rejects.toMatchObject({ status: 400 });
  });

  it("refusée : véhicule d'un autre, doublon de véhicule, limite par personne", async () => {
    const e = await event({ maxVehiclesPerUser: 1 });
    const p = await participant("Nina_34", 2);
    const other = await participant("Theo_66");
    await expect(applicationsService.apply(p.v, e.id, form([other.vehicles[0]!.id]))).rejects.toMatchObject({
      status: 404,
    });
    await expect(applicationsService.apply(p.v, e.id, form(p.vehicles.map((x) => x.id)))).rejects.toMatchObject({
      status: 409,
    });
    await applicationsService.apply(p.v, e.id, form([p.vehicles[0]!.id]));
    await expect(applicationsService.apply(p.v, e.id, form([p.vehicles[0]!.id]))).rejects.toMatchObject({
      status: 409,
    });
    await expect(applicationsService.apply(p.v, e.id, form([p.vehicles[1]!.id]))).rejects.toMatchObject({
      status: 409,
    });
  });

  it("refusée : banni de la structure, verrouillé, pas encore ouvert", async () => {
    const p = await participant("Julie_66");
    const e = await event();
    await db.insert(structureBans).values({ structureId, userId: p.u.id, reason: "départ dangereux" });
    await expect(applicationsService.apply(p.v, e.id, form([p.vehicles[0]!.id]))).rejects.toMatchObject({
      status: 403,
    });
    await db.delete(structureBans);

    clock.set(paris(6, 20, 16, 30));
    await expect(applicationsService.apply(p.v, e.id, form([p.vehicles[0]!.id]))).rejects.toMatchObject({
      status: 423,
      code: "locked",
    });

    clock.set(paris(6, 10, 10));
    const later = await event({ registrationsOpenAt: paris(6, 12, 12) });
    await expect(applicationsService.apply(p.v, later.id, form([p.vehicles[0]!.id]))).rejects.toMatchObject({
      status: 409,
    });
  });

  it("avant-première : un abonné candidate 24 h avant tout le monde", async () => {
    const e = await event({ registrationsOpenAt: paris(6, 12, 12), previewHours: 24 });
    const follower = await participant("Abonne_01");
    const other = await participant("Visiteur_02");
    await db.insert(structureFollows).values({ structureId, userId: follower.u.id, source: "manual" });
    clock.set(paris(6, 11, 13));
    await expect(applyAs(follower, e.id)).resolves.toMatchObject({ status: "pending" });
    await expect(applyAs(other, e.id)).rejects.toMatchObject({ status: 409 });
    clock.set(paris(6, 12, 12));
    await expect(applyAs(other, e.id)).resolves.toMatchObject({ status: "pending" });
  });
});

describe("tri", () => {
  it("retenir, liste d'attente, refuser avec motifs ; notifications et e-mails", async () => {
    const e = await event({ capacity: 10 });
    const [a, b, c] = [await participant("A_un"), await participant("B_deux"), await participant("C_trois")];
    const [ra, rb, rc] = [await applyAs(a, e.id), await applyAs(b, e.id), await applyAs(c, e.id)];
    expect((await decide(e.id, ra.id, "accept")).status).toBe("accepted");
    expect((await decide(e.id, rb.id, "waitlist")).waitlistRank).toBe(1);
    const refused = await decide(e.id, rc.id, "refuse", { reasons: ["off_theme", "full"] });
    expect(refused.refusalReasons).toEqual(["off_theme", "full"]);

    const notes = await db.select().from(notifications).where(eq(notifications.eventId, e.id));
    expect(notes.map((n) => n.type).sort()).toEqual([
      "application_accepted",
      "application_refused",
      "application_waitlisted",
    ]);
    const refusal = notes.find((n) => n.type === "application_refused");
    expect(refusal?.body).toContain("Hors thème, Complet");
    // Sans appareil enregistré, la notification part par e-mail (transport « journal »).
    const mails = await db.select().from(emailOutbox);
    expect(mails).toHaveLength(3);
    expect(mails.every((m) => m.status === "sent")).toBe(true);

    const counters = await call(orga, "GET", `/events/${e.id}/counters`);
    expect(counters.json).toEqual({ remaining: 9, accepted: 1, pending: 0, waitlisted: 1, refused: 1 });
  });

  it("motifs non envoyés : le candidat ne les voit pas", async () => {
    const e = await event();
    const p = await participant("Discret_01");
    const app = await applyAs(p, e.id);
    await decide(e.id, app.id, "refuse", { reasons: ["off_theme"], sendReasons: false });
    const n = await db.query.notifications.findFirst({ where: eq(notifications.userId, p.u.id) });
    expect(n?.body).not.toContain("Hors thème");
    const mine = await call(p.u, "GET", "/me/applications");
    expect(mine.json[0].refusalReasons).toBeNull();
  });

  it("transitions interdites : 409 invalid_transition", async () => {
    const e = await event();
    const p = await participant("Interdit_01");
    const app = await applyAs(p, e.id);
    await decide(e.id, app.id, "accept");
    await expect(decide(e.id, app.id, "accept")).rejects.toMatchObject({ code: "invalid_transition" });
    await applicationsService.withdraw(p.v, app.id);
    await expect(decide(e.id, app.id, "accept")).rejects.toMatchObject({ code: "invalid_transition" });
    await expect(decide(e.id, app.id, "waitlist")).rejects.toMatchObject({ code: "invalid_transition" });
    const res = await call(orga, "POST", `/events/${e.id}/applications/${app.id}/decide`, {
      decision: "refuse",
      reasons: ["full"],
    });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("invalid_transition");
  });

  it("pleine capacité : retenir est refusé (event_full)", async () => {
    const e = await event({ capacity: 1 });
    const [a, b] = [await participant("Plein_01"), await participant("Plein_02")];
    const [ra, rb] = [await applyAs(a, e.id), await applyAs(b, e.id)];
    await decide(e.id, ra.id, "accept");
    await expect(decide(e.id, rb.id, "accept")).rejects.toMatchObject({ code: "event_full" });
  });

  it("motif « Autre » sans note : 400", async () => {
    const e = await event();
    const p = await participant("Autre_01");
    const app = await applyAs(p, e.id);
    const res = await call(orga, "POST", `/events/${e.id}/applications/${app.id}/decide`, {
      decision: "refuse",
      reasons: ["other"],
    });
    expect(res.status).toBe(400);
  });

  it("décisions en masse : résultats individuels", async () => {
    const e = await event({ capacity: 1 });
    const [a, b] = [await participant("Masse_01"), await participant("Masse_02")];
    const [ra, rb] = [await applyAs(a, e.id), await applyAs(b, e.id)];
    const res = await call(orga, "POST", `/events/${e.id}/applications/decide-many`, {
      ids: [ra.id, rb.id],
      decision: "accept",
    });
    expect(res.json.results).toEqual([
      { id: ra.id, ok: true, status: "accepted" },
      { id: rb.id, ok: false, error: "event_full" },
    ]);
  });

  it("file une par une et zone attribuée", async () => {
    const e = await event();
    const zone = await createZone(e.id, "JDM");
    const [a, b] = [await participant("File_01"), await participant("File_02")];
    const ra = await applyAs(a, e.id);
    clock.advance(1000);
    await applyAs(b, e.id);
    const next = await call(orga, "GET", `/events/${e.id}/applications/next`);
    expect(next.json.item.id).toBe(ra.id);
    await decide(e.id, ra.id, "accept", { zoneId: zone.id });
    const mine = await call(a.u, "GET", "/me/applications");
    expect(mine.json[0].zone).toEqual({ code: "JDM", name: "JDM" });
  });
});

describe("liste d'attente automatique", () => {
  async function full() {
    const e = await event({ capacity: 2 });
    const ps = [];
    for (const name of ["R1_x", "R2_x", "W1_x", "W2_x", "W3_x"]) ps.push(await participant(name));
    const apps = [];
    for (const p of ps) apps.push(await applyAs(p, e.id));
    await decide(e.id, apps[0]!.id, "accept");
    await decide(e.id, apps[1]!.id, "accept");
    for (const a of apps.slice(2)) await decide(e.id, a.id, "waitlist");
    clock.jobs.jobs.length = 0;
    return { e, ps, apps };
  }

  it("désistement à J−5 : place offerte au premier, 24 h pour accepter", async () => {
    const { e, ps, apps } = await full();
    clock.set(paris(6, 15, 12));
    await applicationsService.withdraw(ps[0]!.v, apps[0]!.id);
    const offered = await db.query.applications.findFirst({ where: eq(applications.id, apps[2]!.id) });
    expect(offered?.status).toBe("offered");
    expect(offered?.offerExpiresAt).toEqual(paris(6, 16, 12));
    expect(clock.jobs.jobs).toEqual([
      {
        name: "waitlist.offer-expire",
        data: { applicationId: apps[2]!.id, offeredAt: paris(6, 15, 12).toISOString() },
        startAfter: paris(6, 16, 12),
      },
    ]);
    const n = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, ps[2]!.u.id), eq(notifications.type, "offer_received")),
    });
    expect(n?.body).toContain("À accepter avant");
    expect((await call(ps[2]!.u, "GET", "/me/applications")).json[0].offerExpiresAt).toBe(
      paris(6, 16, 12).toISOString(),
    );
    expect(await statusOf(apps[3]!.id)).toBe("waitlisted");
    void e;
  });

  it("offre acceptée à temps → retenue ; après l'échéance → offer_expired", async () => {
    const { ps, apps } = await full();
    clock.set(paris(6, 15, 12));
    await applicationsService.withdraw(ps[0]!.v, apps[0]!.id);
    clock.set(paris(6, 16, 11, 59));
    expect((await applicationsService.acceptOffer(ps[2]!.v, apps[2]!.id)).status).toBe("accepted");

    await applicationsService.withdraw(ps[1]!.v, apps[1]!.id);
    clock.set(paris(6, 17, 12));
    const late = await call(ps[3]!.u, "POST", `/applications/${apps[3]!.id}/offer/accept`);
    expect(late.status).toBe(409);
    expect(late.json.error.code).toBe("offer_expired");
  });

  it("expiration → offre au suivant ; tâche rejouée sans effet", async () => {
    const { ps, apps } = await full();
    clock.set(paris(6, 15, 12));
    await applicationsService.withdraw(ps[0]!.v, apps[0]!.id);
    const job = clock.jobs.jobs[0]!;
    clock.set(paris(6, 16, 12));
    expect(await applicationsService.expireOffer(String(job.data.applicationId), String(job.data.offeredAt))).toBe(
      true,
    );
    expect(await statusOf(apps[2]!.id)).toBe("expired");
    expect(await statusOf(apps[3]!.id)).toBe("offered");
    expect(await applicationsService.expireOffer(String(job.data.applicationId), String(job.data.offeredAt))).toBe(
      false,
    );
    expect(await statusOf(apps[4]!.id)).toBe("waitlisted");
  });

  it("tâche d'expiration en avance ou sur une offre acceptée : rien", async () => {
    const { ps, apps } = await full();
    clock.set(paris(6, 15, 12));
    await applicationsService.withdraw(ps[0]!.v, apps[0]!.id);
    const job = clock.jobs.jobs[0]!;
    expect(await applicationsService.expireOffer(String(job.data.applicationId), String(job.data.offeredAt))).toBe(
      false,
    );
    await applicationsService.acceptOffer(ps[2]!.v, apps[2]!.id);
    clock.set(paris(6, 17, 12));
    expect(await applicationsService.expireOffer(String(job.data.applicationId), String(job.data.offeredAt))).toBe(
      false,
    );
    expect(await statusOf(apps[2]!.id)).toBe("accepted");
  });

  it("refuser la place → offerte au suivant", async () => {
    const { ps, apps } = await full();
    clock.set(paris(6, 15, 12));
    await applicationsService.withdraw(ps[0]!.v, apps[0]!.id);
    await applicationsService.declineOffer(ps[2]!.v, apps[2]!.id);
    expect(await statusOf(apps[2]!.id)).toBe("withdrawn");
    expect(await statusOf(apps[3]!.id)).toBe("offered");
  });

  it("deux places libérées → deux offres ; ordre réordonné par l'organisateur", async () => {
    const { e, ps, apps } = await full();
    const reorder = await call(orga, "PUT", `/events/${e.id}/waitlist/order`, {
      applicationIds: [apps[4]!.id, apps[3]!.id, apps[2]!.id],
    });
    expect(reorder.status).toBe(204);
    await eventsService.update(orgaV, e.id, { capacity: 4 });
    expect(await statusOf(apps[4]!.id)).toBe("offered");
    expect(await statusOf(apps[3]!.id)).toBe("offered");
    expect(await statusOf(apps[2]!.id)).toBe("waitlisted");
    const mine = await call(ps[2]!.u, "GET", "/me/applications");
    expect(mine.json[0].waitlistRank).toBe(1);
  });

  it("revenir sur une retenue (refus) libère la place", async () => {
    const { e, apps } = await full();
    await decide(e.id, apps[0]!.id, "refuse", { reasons: ["criteria_not_met"] });
    expect(await statusOf(apps[2]!.id)).toBe("offered");
  });

  it("la veille à 10:00 : 3 h ; le jour J : 2 h", async () => {
    const { ps, apps } = await full();
    clock.set(paris(6, 19, 10));
    await applicationsService.withdraw(ps[0]!.v, apps[0]!.id);
    expect(
      (await db.query.applications.findFirst({ where: eq(applications.id, apps[2]!.id) }))?.offerExpiresAt,
    ).toEqual(paris(6, 19, 13));
    clock.set(paris(6, 20, 9));
    await applicationsService.withdraw(ps[1]!.v, apps[1]!.id);
    expect(
      (await db.query.applications.findFirst({ where: eq(applications.id, apps[3]!.id) }))?.offerExpiresAt,
    ).toEqual(paris(6, 20, 11));
  });

  it("sans limite de places : aucune offre automatique", async () => {
    const e = await event({ capacity: null });
    const [a, b] = [await participant("Libre_01"), await participant("Libre_02")];
    const [ra, rb] = [await applyAs(a, e.id), await applyAs(b, e.id)];
    await decide(e.id, ra.id, "accept");
    await decide(e.id, rb.id, "waitlist");
    await applicationsService.withdraw(a.v, ra.id);
    expect(await statusOf(rb.id)).toBe("waitlisted");
  });
});

describe("désistement et verrouillage", () => {
  it("désistement la veille : sans malus, place réofferte", async () => {
    const e = await event({ capacity: 1 });
    const [a, b] = [await participant("Veille_01"), await participant("Veille_02")];
    const [ra, rb] = [await applyAs(a, e.id), await applyAs(b, e.id)];
    await decide(e.id, ra.id, "accept");
    await decide(e.id, rb.id, "waitlist");
    clock.set(paris(6, 19, 15));
    const w = await applicationsService.withdraw(a.v, ra.id);
    expect(w.withdrawnAfterLock).toBe(false);
    expect(await statusOf(rb.id)).toBe("offered");
  });

  it("désistement à H−1 : marqué pour le malus, pas de réoffre", async () => {
    const e = await event({ capacity: 1 });
    const [a, b] = [await participant("Tard_01"), await participant("Tard_02")];
    const [ra, rb] = [await applyAs(a, e.id), await applyAs(b, e.id)];
    await decide(e.id, ra.id, "accept");
    await decide(e.id, rb.id, "waitlist");
    clock.set(paris(6, 20, 17));
    const res = await call(a.u, "POST", `/applications/${ra.id}/withdraw`);
    expect(res.status).toBe(200);
    expect(res.json.withdrawnAfterLock).toBe(true);
    expect(await statusOf(rb.id)).toBe("waitlisted");
  });

  it("délai de verrouillage réglable (0) et désistement impossible après la fin", async () => {
    const e = await event({ capacity: 1, lockOffsetMinutes: 0 });
    const a = await participant("Zero_01");
    const ra = await applyAs(a, e.id);
    await decide(e.id, ra.id, "accept");
    clock.set(paris(6, 20, 17, 59));
    expect((await applicationsService.withdraw(a.v, ra.id)).withdrawnAfterLock).toBe(false);
    const b = await participant("Zero_02");
    clock.set(paris(6, 10, 10));
    const rb = await applyAs(b, e.id);
    await decide(e.id, rb.id, "accept");
    clock.set(paris(6, 21, 0));
    await expect(applicationsService.withdraw(b.v, rb.id)).rejects.toMatchObject({ code: "locked" });
  });

  it("tâche event.lock : trace locked_at et fait expirer les offres en cours", async () => {
    const e = await event({ capacity: 1 });
    const [a, b] = [await participant("Lock_01"), await participant("Lock_02")];
    const [ra, rb] = [await applyAs(a, e.id), await applyAs(b, e.id)];
    await decide(e.id, ra.id, "accept");
    await decide(e.id, rb.id, "waitlist");
    clock.set(paris(6, 20, 15));
    await applicationsService.withdraw(a.v, ra.id);
    expect(await statusOf(rb.id)).toBe("offered");
    expect(await eventJobs.lock({ eventId: e.id })).toBe(false);
    clock.set(paris(6, 20, 16));
    expect(await eventJobs.lock({ eventId: e.id })).toBe(true);
    expect(await statusOf(rb.id)).toBe("expired");
    expect((await db.query.events.findFirst({ where: eq(events.id, e.id) }))?.lockedAt).toEqual(paris(6, 20, 16));
  });

  it("changer la date replanifie le verrouillage", async () => {
    const e = await event();
    clock.jobs.jobs.length = 0;
    await eventsService.update(orgaV, e.id, { startsAt: paris(6, 27, 18), endsAt: paris(6, 27, 23) });
    const lock = clock.jobs.jobs.find((j) => j.name === "event.lock");
    expect(lock?.startAfter).toEqual(paris(6, 27, 16));
    // L'ancienne tâche (20 juin 16:00) ne verrouille plus rien.
    clock.set(paris(6, 20, 16));
    expect(await eventJobs.lock({ eventId: e.id })).toBe(false);
  });

  it("annulation de l'événement : candidatures annulées, inscrits prévenus", async () => {
    const e = await event({ capacity: 1 });
    const [a, b] = [await participant("Annule_01"), await participant("Annule_02")];
    const [ra, rb] = [await applyAs(a, e.id), await applyAs(b, e.id)];
    await decide(e.id, ra.id, "accept");
    await decide(e.id, rb.id, "waitlist");
    await eventsService.cancel(orgaV, e.id);
    expect([await statusOf(ra.id), await statusOf(rb.id)]).toEqual(["cancelled", "cancelled"]);
    const cancelled = await db.select().from(notifications).where(eq(notifications.type, "event_cancelled"));
    expect(cancelled).toHaveLength(2);
  });
});

describe("heures calmes", () => {
  it("décision à 23:00 : notification livrée à 08:00", async () => {
    const e = await event();
    const p = await participant("Nuit_01");
    const app = await applyAs(p, e.id);
    clock.set(paris(6, 12, 23));
    await decide(e.id, app.id, "accept");
    const n = await db.query.notifications.findFirst({ where: eq(notifications.userId, p.u.id) });
    expect(n?.deliverAfter).toEqual(paris(6, 13, 8));
    expect(n?.deliveredAt).toBeNull();
    expect((await call(p.u, "GET", "/me/notifications")).json.items).toHaveLength(0);
    clock.set(paris(6, 13, 8));
    expect(await notificationsService.deliverDue()).toBe(1);
    expect((await call(p.u, "GET", "/me/notifications")).json.items[0].type).toBe("application_accepted");
  });
});

describe("droits", () => {
  it("le tri est réservé à l'organisation ; 2FA obligatoire pour l'organisateur", async () => {
    const e = await event();
    const p = await participant("Intrus_01");
    expect((await call(p.u, "GET", `/events/${e.id}/applications`)).status).toBe(403);
    const sans2fa = await signUp("Coorga_01");
    await addMember(structureId, sans2fa.id, "co_organizer");
    const res = await call(sans2fa, "GET", `/events/${e.id}/applications`);
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("two_factor_required");
    expect((await call(sans2fa, "GET", "/me")).json.twoFactorRequired).toBe(true);
  });

  it("plaque visible de l'organisateur seulement ; staff de filtration sans plaque ni coordonnées", async () => {
    const e = await event();
    const p = await participant("Plaque_01");
    const app = await applyAs(p, e.id);
    const plate = (await db.query.vehicles.findFirst({ where: eq(vehicles.id, p.vehicles[0]!.id) }))?.plate ?? "";
    const list = await call(orga, "GET", `/events/${e.id}/applications`);
    expect(list.json.items[0].vehicle.plate).toBe(plate);
    expect(list.json.items[0].applicant.email).toBe(p.u.email);

    const filtre = await signUp("Filtre_01");
    await addMember(structureId, filtre.id, "staff", ["filtering"], false);
    const staffList = await call(filtre, "GET", `/events/${e.id}/applications`);
    expect(staffList.status).toBe(200);
    expect(staffList.text).not.toContain(plate);
    expect(staffList.json.items[0].applicant.email).toBeNull();
    // Avis possible, décision réservée tant que l'organisateur ne l'a pas permise.
    expect(
      (await call(filtre, "POST", `/events/${e.id}/applications/${app.id}/filtering-opinion`, { opinion: "keep" }))
        .status,
    ).toBe(200);
    expect(
      (await call(filtre, "POST", `/events/${e.id}/applications/${app.id}/decide`, { decision: "accept" })).status,
    ).toBe(403);
    const decideur = await signUp("Filtre_02");
    await addMember(structureId, decideur.id, "staff", ["filtering"], true);
    expect(
      (await call(decideur, "POST", `/events/${e.id}/applications/${app.id}/decide`, { decision: "accept" })).status,
    ).toBe(200);
    const journal = await db.select().from(applicationEvents).where(eq(applicationEvents.toStatus, "accepted"));
    expect(journal[0]?.actor).toBe("staff");
  });

  it("aucune plaque dans les réponses publiques", async () => {
    const e = await event();
    const p = await participant("Public_01");
    await applyAs(p, e.id);
    const plate = (await db.query.vehicles.findFirst({ where: eq(vehicles.id, p.vehicles[0]!.id) }))?.plate ?? "";
    const pages = [
      await call(null, "GET", `/events/by-slug/${e.slug}`),
      await call(p.u, "GET", `/events/by-slug/${e.slug}`),
      await call(null, "GET", "/events?from=2026-01-01T00:00:00Z"),
      await call(p.u, "GET", "/me/applications"),
    ];
    for (const page of pages) {
      expect(page.status).toBe(200);
      expect(page.text).not.toContain(plate);
      expect(page.text).not.toContain(plate.replaceAll("-", ""));
    }
  });

  it("abonnés : visibles de l'organisateur seulement ; un non-abonné n'y figure pas", async () => {
    const abonne = await participant("Fan_01");
    const autre = await participant("Inconnu_02");
    await call(abonne.u, "POST", `/structures/${structureId}/follow`);
    const list = await call(orga, "GET", `/structures/${structureId}/followers`);
    expect(list.json.map((f: { pseudo: string }) => f.pseudo)).toEqual(["Fan_01"]);
    expect((await call(autre.u, "GET", `/structures/${structureId}/followers`)).status).toBe(403);
  });

  it("événement en brouillon invisible du public ; publication réservée aux structures vérifiées", async () => {
    const draft = await event({ status: "draft", publishedAt: null });
    expect((await call(null, "GET", `/events/by-slug/${draft.slug}`)).status).toBe(404);
    const other = await signUp("Nouveau_01", { twoFactor: true });
    const s = (await call(other, "POST", "/structures", { kind: "club", name: "Club neuf", departments: ["66"] })).json;
    const created = await call(other, "POST", `/structures/${s.id}/events`, {
      title: "Premier rasso",
      format: "gathering",
      startsAt: paris(7, 4, 18).toISOString(),
      endsAt: paris(7, 4, 22).toISOString(),
      admittedVehicleTypes: ["car"],
      admission: "open",
      registrationsOpenAt: paris(6, 11, 12).toISOString(),
    });
    expect(created.status).toBe(201);
    expect(created.json.slug).toBe("premier-rasso-2026");
    expect((await call(other, "POST", `/events/${created.json.id}/publish`)).status).toBe(403);
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    expect((await call(admin, "POST", `/admin/structures/${s.id}/verify`, { verified: true })).status).toBe(204);
    expect((await call(other, "POST", `/events/${created.json.id}/publish`)).json.status).toBe("published");
    expect((await call(admin, "GET", "/admin/audit")).json.items[0].action).toBe("structure.verify");
    clock.advance(HOUR);
  });
});
