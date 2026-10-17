// Administration (lot 33), corrections de la relecture : newsletter (échecs non comptés comme servis, pause après 20
// échecs de suite et reprise, plafond propre de la moitié du budget non réservé, reprise après minuit sans passage à
// vide, planification future obligatoire, envoi immédiat confirmé, pause pendant l'envoi), une seule trace d'assistance
// par requête réussie, interrupteur des inscriptions dans le crochet de Better Auth (sauf inscription express), actions
// sur soi-même, base véhicules (listes blanches et critères, certification, compte anonymisé), recalcul des grades,
// barème à 0, copie des réglages.
import { type Decide, fromWallTime, newsletterAllowance } from "@orasso/shared";
import { and, count, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEvent,
  createPro,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { app } from "../../app";
import { auth } from "../../auth";
import { db, pool } from "../../db/client";
import {
  adminAuditLog,
  assistanceRequests,
  categories,
  categoryMakes,
  emailOutbox,
  newsletterDeliveries,
  newsletters,
  notifications,
  pointEntries,
  profiles,
  vehicles,
} from "../../db/schema";
import * as mailModule from "../../lib/mail";
import { requestContext } from "../../lib/request-context";
import { settingsStore } from "../../lib/settings";
import { accountService } from "../account/service";
import { applicationsService } from "../applications/service";
import { notificationsService } from "../notifications/service";
import { pointsService } from "../points/service";
import { newsletterService } from "./newsletter";
import { adminSettingsService } from "./settings";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const DAY = 86_400_000;

async function req(u: TestUser | null, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(u ? { cookie: u.cookie } : {}),
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
  return { status: res.status, json };
}

let clock: ReturnType<typeof useClock>;
let admin: TestUser;
let orga: TestUser;
let fan: TestUser;
let structureId: string;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 10, hour: 12, minute: 0 }));
  admin = await signUp("Damien_Admin", { twoFactor: true, role: "super_admin" });
  orga = await signUp("Orga_66", { twoFactor: true });
  fan = await signUp("Kenji_66");
  structureId = (await createStructure(orga.id)).id;
});

afterEach(() => {
  vi.restoreAllMocks();
  newsletterService.budgetMode = "journal";
});

/** `n` comptes abonnés à la newsletter, insérés directement. */
async function subscribers(n: number, prefix = "nl") {
  await db.execute(sql`
    with u as (
      insert into "user" (id, name, email, email_verified, created_at, updated_at)
      select ${prefix} || g, ${prefix} || g, ${prefix} || g || '@orasso.test', true, now(), now()
      from generate_series(1, ${n}) g
      returning id
    )
    insert into profiles (user_id, pseudo, newsletter_opt_in, account_qr_secret, account_qr_short_id, invite_token)
    select id, id, true, decode(md5(id), 'hex'), decode(substr(md5('s' || id), 1, 16), 'hex'), md5('i' || id) from u`);
}

async function startNewsletter(subject = "Nouvelles") {
  const draft = await req(admin, "POST", "/admin/newsletters", { subject, bodyMd: "Texte" });
  const aud = await req(admin, "GET", "/admin/newsletters/audience");
  const sent = await req(admin, "POST", `/admin/newsletters/${draft.json.id}/send-now`, {
    confirmRecipients: aud.json.recipients,
  });
  expect(sent.status).toBe(200);
  return draft.json.id as string;
}

describe("newsletter : échecs, pause, budget", () => {
  it("un échec n'est jamais compté comme servi ; réessayé ensuite", async () => {
    await subscribers(3);
    const id = await startNewsletter();
    vi.spyOn(mailModule.mail, "send").mockResolvedValue("failed");
    expect(await newsletterService.runBatch(id)).toBe(0);
    const rows = await db.select().from(newsletterDeliveries).where(eq(newsletterDeliveries.newsletterId, id));
    expect(rows.every((r) => r.sentAt === null && r.failedAt !== null && r.attempts === 1)).toBe(true);
    const view = await req(admin, "GET", `/admin/newsletters/${id}`);
    expect(view.json).toMatchObject({ status: "sending", delivered: 0, failed: 3, recipientsCount: 0 });
    vi.restoreAllMocks();
    // Pas de réessai avant 10 minutes, puis les trois partent.
    expect(await newsletterService.runBatch(id)).toBe(0);
    clock.advance(11 * 60_000);
    expect(await newsletterService.runBatch(id)).toBe(3);
    expect(await newsletterService.runBatch(id)).toBe(0);
    expect((await req(admin, "GET", `/admin/newsletters/${id}`)).json).toMatchObject({
      status: "sent",
      delivered: 3,
      failed: 0,
      recipientsCount: 3,
    });
  });

  it("20 échecs de suite : envoi interrompu (pause visible), reprise par l'équipe", async () => {
    await subscribers(25);
    const id = await startNewsletter();
    const spy = vi.spyOn(mailModule.mail, "send").mockResolvedValue("failed");
    await newsletterService.runBatch(id);
    expect(spy).toHaveBeenCalledTimes(20);
    let view = await req(admin, "GET", `/admin/newsletters/${id}`);
    expect(view.json).toMatchObject({ status: "paused", pauseReason: "errors", consecutiveFailures: 20, delivered: 0 });
    expect(await newsletterService.runDue()).toBe(0);
    vi.restoreAllMocks();
    const resumed = await req(admin, "POST", `/admin/newsletters/${id}/resume`);
    expect(resumed.json).toMatchObject({ status: "sending", pauseReason: null, consecutiveFailures: 0 });
    clock.advance(11 * 60_000);
    expect(await newsletterService.runBatch(id)).toBe(25);
    await newsletterService.runBatch(id);
    view = await req(admin, "GET", `/admin/newsletters/${id}`);
    expect(view.json).toMatchObject({ status: "sent", recipientsCount: 25, delivered: 25 });
    const traces = await db.select({ action: adminAuditLog.action }).from(adminAuditLog);
    expect(traces.map((t) => t.action)).toEqual(expect.arrayContaining(["newsletter.send_now", "newsletter.resume"]));
  });

  it("plafond propre (moitié du budget non réservé) : arrêt avant de réserver, reprise après minuit, aucun passage à vide", async () => {
    expect(newsletterAllowance({ budget: 300, reserve: 50, sentToday: 0, newsletterToday: 0 })).toBe(125);
    expect(newsletterAllowance({ budget: 300, reserve: 50, sentToday: 240, newsletterToday: 0 })).toBe(10);
    newsletterService.budgetMode = "brevo";
    await subscribers(5);
    // 125 newsletters déjà parties par Brevo aujourd'hui.
    await db.execute(sql`
      insert into email_outbox ("to", subject, template, transport, status, created_at, updated_at)
      select 'x' || g || '@exemple.fr', 'N', 'newsletter', 'brevo', 'sent', ${clock.now.toISOString()}, now()
      from generate_series(1, 125) g`);
    const id = await startNewsletter();
    const spy = vi.spyOn(mailModule.mail, "send");
    expect(await newsletterService.runBatch(id)).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    const row = await db.query.newsletters.findFirst({ where: eq(newsletters.id, id) });
    expect(row?.resumeAfter?.getTime()).toBeGreaterThan(clock.now.getTime());
    expect((await req(admin, "GET", `/admin/newsletters/${id}`)).json.resumeAfter).not.toBeNull();
    const [reserved] = await db
      .select({ n: count() })
      .from(newsletterDeliveries)
      .where(eq(newsletterDeliveries.newsletterId, id));
    expect(reserved?.n).toBe(0);
    expect(await newsletterService.runDue()).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    const [skipped] = await db.select({ n: count() }).from(emailOutbox).where(eq(emailOutbox.status, "skipped_quota"));
    expect(skipped?.n).toBe(0);
    // Le lendemain, le compteur repart : la newsletter reprend.
    vi.restoreAllMocks();
    clock.advance(DAY);
    expect(await newsletterService.runDue()).toBe(5);
  });

  it("les e-mails des événements passent avant : budget non réservé épuisé → rien ne part", async () => {
    newsletterService.budgetMode = "brevo";
    await subscribers(3);
    await db.execute(sql`
      insert into email_outbox ("to", subject, template, transport, status, created_at, updated_at)
      select 'x' || g || '@exemple.fr', 'Retenue', 'application_accepted', 'brevo', 'sent', ${clock.now.toISOString()}, now()
      from generate_series(1, 250) g`);
    const id = await startNewsletter();
    expect(await newsletterService.runBatch(id)).toBe(0);
    expect((await db.query.newsletters.findFirst({ where: eq(newsletters.id, id) }))?.resumeAfter).not.toBeNull();
  });

  it("planifier exige une date future ; pause pendant l'envoi", async () => {
    await subscribers(2);
    const draft = await req(admin, "POST", "/admin/newsletters", { subject: "Date", bodyMd: "Texte" });
    const past = await req(admin, "POST", `/admin/newsletters/${draft.json.id}/schedule`, {
      at: clock.now.toISOString(),
    });
    expect(past.status).toBe(400);
    const id = await startNewsletter("Pause");
    const paused = await req(admin, "POST", `/admin/newsletters/${id}/pause`);
    expect(paused.json).toMatchObject({ status: "paused", pauseReason: "admin" });
    expect(await newsletterService.runDue()).toBe(0);
    expect((await req(admin, "POST", `/admin/newsletters/${draft.json.id}/pause`)).status).toBe(409);
  });

  it("un compte anonymisé entre la réservation et l'envoi ne reçoit rien", async () => {
    await db.update(profiles).set({ newsletterOptIn: true }).where(eq(profiles.userId, fan.id));
    await db.execute(sql`update "user" set email_verified = true where id = ${fan.id}`);
    const id = await startNewsletter();
    // Réservé mais pas encore envoyé (arrêt simulé), puis anonymisé.
    await db.insert(newsletterDeliveries).values({ newsletterId: id, userId: fan.id, createdAt: clock.now });
    await accountService.anonymize(fan.id, null, {});
    clock.advance(11 * 60_000);
    const spy = vi.spyOn(mailModule.mail, "send");
    await newsletterService.runBatch(id);
    expect(spy).not.toHaveBeenCalled();
    const left = await db.select().from(newsletterDeliveries).where(eq(newsletterDeliveries.newsletterId, id));
    expect(left).toHaveLength(0);
  });
});

describe("mode assistance : une trace par requête réussie", () => {
  it("écriture refusée par validation : aucune trace ; écriture réussie : une seule", async () => {
    await req(orga, "POST", `/structures/${structureId}/assistance-requests`, { message: "Aide sur la fiche svp" });
    const bad = await req(admin, "PATCH", `/structures/${structureId}`, { name: "" });
    expect(bad.status).toBe(400);
    const none = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "structure.assist"));
    expect(none).toHaveLength(0);
    expect((await req(admin, "PATCH", `/structures/${structureId}`, { description: "Corrigée" })).status).toBe(200);
    const one = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "structure.assist"));
    expect(one).toHaveLength(1);
    const open = await db.query.assistanceRequests.findFirst({
      where: eq(assistanceRequests.structureId, structureId),
    });
    expect(one[0]?.assistanceRequestId).toBe(open?.id);
  });
});

describe("interrupteur des inscriptions dans le crochet de Better Auth", () => {
  it("refuse une inscription par Better Auth (Google, Apple…) mais pas l'inscription express ni les scripts", async () => {
    await req(admin, "PUT", "/admin/settings/signup.enabled", { value: false });
    const body = { email: "social@orasso.test", password: "motdepasse-test-123", name: "Social_1" };
    await expect(
      requestContext.run({ method: "GET", path: "/api/auth/callback/google", ip: null, userAgent: null }, () =>
        auth.api.signUpEmail({ body }),
      ),
    ).rejects.toMatchObject({ body: { code: "SIGNUP_CLOSED" } });
    const express = await requestContext.run(
      { method: "POST", path: `/api/events/${structureId}/express`, ip: null, userAgent: null },
      () => auth.api.signUpEmail({ body: { ...body, email: "express@orasso.test", name: "Express_1" } }),
    );
    expect(express.user.id).toBeTruthy();
    const script = await auth.api.signUpEmail({ body: { ...body, email: "script@orasso.test", name: "Script_1" } });
    expect(script.user.id).toBeTruthy();
  });
});

describe("actions sur soi-même, interrupteurs, base véhicules", () => {
  it("ses propres points, sa propre fiche pro, son propre véhicule : refusés", async () => {
    const pts = await req(admin, "POST", `/admin/users/${admin.id}/points-adjust`, { points: 5, note: "Moi-même" });
    expect(pts.status).toBe(409);
    expect(pts.json.error.code).toBe("self_action");
    const pro = await createPro(admin.id);
    expect(
      (await req(admin, "POST", `/admin/pros/${pro.id}/verify`, { verified: true, note: "Ma fiche" })).status,
    ).toBe(409);
    const ref = await seedReference();
    const mine = await createVehicle(admin.id, ref);
    const res = await req(admin, "POST", `/admin/vehicles/${mine.id}/reassign`, {
      makeId: ref.makeId,
      modelId: ref.modelId,
      generationId: ref.generationId,
    });
    expect(res.status).toBe(409);
  });

  it("prestataires coupés : la création depuis la fiche pro aussi", async () => {
    await req(admin, "PUT", "/admin/settings/providers.enabled", { value: false });
    const res = await req(fan, "POST", "/me/provider-profile/from-pro");
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("providers_disabled");
  });

  it("marque d'une liste blanche ou d'un critère d'événement : suppression refusée", async () => {
    const make = await req(admin, "POST", "/admin/vehicle-reference/makes", { name: "Lotus", country: "GB" });
    const [cat] = await db.insert(categories).values({ slug: "supercar", label: "Supercar" }).returning();
    await db.insert(categoryMakes).values({ categoryId: cat!.id, makeId: make.json.id });
    expect((await req(admin, "DELETE", `/admin/vehicle-reference/makes/${make.json.id}`)).status).toBe(409);
    const other = await req(admin, "POST", "/admin/vehicle-reference/makes", { name: "TVR", country: "GB" });
    await createEvent(structureId, { criteria: { categoryIds: [], makeIds: [other.json.id] } as never });
    expect((await req(admin, "DELETE", `/admin/vehicle-reference/makes/${other.json.id}`)).status).toBe(409);
  });

  it("rattachement : certification retirée si la marque change ; compte anonymisé non prévenu", async () => {
    const ref = await seedReference();
    const vehicle = await createVehicle(fan.id, ref);
    const certified = await createVehicle(orga.id, ref, { certifiedAt: clock.now });
    const make = await req(admin, "POST", "/admin/vehicle-reference/makes", { name: "Alpine", country: "FR" });
    const model = await req(admin, "POST", "/admin/vehicle-reference/models", {
      makeId: make.json.id,
      name: "A110",
      vehicleType: "car",
    });
    await accountService.anonymize(fan.id, null, {});
    const res = await req(admin, "POST", `/admin/vehicles/${vehicle.id}/reassign`, {
      makeId: make.json.id,
      modelId: model.json.id,
      generationId: null,
    });
    expect(res.status).toBe(200);
    const moved = await req(admin, "POST", `/admin/vehicles/${certified.id}/reassign`, {
      makeId: make.json.id,
      modelId: model.json.id,
      generationId: null,
    });
    expect(moved.status).toBe(200);
    const row = await db.query.vehicles.findFirst({ where: eq(vehicles.id, certified.id) });
    expect(row).toMatchObject({ certifiedAt: null, certifiedLostReason: "modified" });
    const notes = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, fan.id), eq(notifications.type, "vehicle_reassigned")));
    expect(notes).toHaveLength(0);
  });
});

describe("points : seuils, barème à 0, copie des réglages", () => {
  it("nouveaux seuils : tâche de recalcul des grades, idempotente", async () => {
    await db.update(profiles).set({ pointsSeason: 60, grade: "rodage" }).where(eq(profiles.userId, fan.id));
    await req(admin, "PUT", "/admin/settings/grades.thresholds", {
      value: { rodage: 0, route: 50, sport: 300, circuit: 400, legende: 800 },
    });
    expect(clock.jobs.jobs.map((j) => j.name)).toContain("points.regrade");
    expect(await adminSettingsService.regrade()).toBeGreaterThanOrEqual(1);
    expect((await db.query.profiles.findFirst({ where: eq(profiles.userId, fan.id) }))?.grade).toBe("route");
    expect(await adminSettingsService.regrade()).toBe(0);
  });

  it("malus à 0 : rien d'écrit, aucune notification « 0 point »", async () => {
    await req(admin, "PUT", "/admin/settings/points.malus", { value: 0 });
    const ref = await seedReference();
    const STARTS = fromWallTime({ year: 2026, month: 10, day: 17, hour: 10, minute: 0 });
    const eventId = (
      await createEvent(structureId, { startsAt: STARTS, endsAt: new Date(STARTS.getTime() + 8 * 3_600_000) })
    ).id;
    const vehicle = await createVehicle(fan.id, ref);
    const [application] = await applicationsService.apply(await viewerOf(fan), eventId, {
      vehicleIds: [vehicle.id],
      rulesAccepted: true,
      followStructure: false,
      newsletterOptIn: false,
      companions: 0,
      message: null,
    });
    const accept: Decide = { decision: "accept", sendReasons: true, note: null };
    await applicationsService.decide(await viewerOf(orga), eventId, application!.id, accept);
    clock.set(new Date(STARTS.getTime() + 8 * 3_600_000 + 2 * DAY + 60_000));
    expect(await pointsService.settleEvent(eventId)).toBe(true);
    expect(await db.select().from(pointEntries).where(eq(pointEntries.userId, fan.id))).toHaveLength(0);
    const notes = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, fan.id), eq(notifications.type, "malus_applied")));
    expect(notes).toHaveLength(0);
  });

  it("les réglages lus sont des copies du cache", async () => {
    const first = await settingsStore.all();
    first.values["lists.refusal_reasons"].length = 0;
    (await settingsStore.get("grades.thresholds")).route = 1;
    const again = await settingsStore.all();
    expect(again.values["lists.refusal_reasons"].length).toBeGreaterThan(1);
    expect(again.values["grades.thresholds"].route).toBe(100);
  });
});
