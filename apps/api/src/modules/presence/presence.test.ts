// Lot R7d1 : le direct (présence par GPS, compteurs « sur place », zone de l'organisateur, widget « En cours »).
// Lot sensible : la position n'est jamais gardée (test sur le schéma, sur toutes les tables, sur les logs) et la règle des
// absents (ni retenues ni présents après la fin) est vérifiée pour chaque phase.
import { fromWallTime, presenceLabels } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addMember,
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
import {
  applications,
  checkins,
  eventDays,
  eventPresences,
  events,
  notifications,
  orders,
  passportStamps,
  signingKeys,
  tickets,
  ticketTypes,
} from "../../db/schema";
import { realtime } from "../../lib/realtime";
import { audiencePrizeService } from "../audience-prize/service";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

// Samedi 7 novembre 2026, 09:00 – 18:00 (heure de Paris) ; le Lydia, au Barcarès.
const STARTS = paris(11, 7, 9);
const ENDS = paris(11, 7, 18);
const LYDIA = { lat: 42.7881, lng: 3.0389 };
/** Position de l'appareil dans les tests : des chiffres qui n'apparaissent nulle part ailleurs (~10 m du lieu). */
const DEVICE = { lat: 42.788137, lng: 3.038991 };
/** Un point à `meters` mètres plein nord du lieu. */
const north = (meters: number) => ({ lat: LYDIA.lat + meters / 111_195, lng: LYDIA.lng });

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;
let orga: TestUser;
let staff: TestUser;
let structureId: string;
let event: typeof events.$inferSelect;
let visitor: TestUser;
let other: TestUser;

async function makeEvent(overrides: Partial<typeof events.$inferInsert> = {}) {
  return createEvent(structureId, {
    title: "Rassemblement du Lydia",
    startsAt: STARTS,
    endsAt: ENDS,
    lat: LYDIA.lat,
    lng: LYDIA.lng,
    ...overrides,
  });
}

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(11, 7, 10));
  ref = await seedReference();
  orga = await signUp("Sarah_66", { twoFactor: true });
  structureId = (await createStructure(orga.id)).id;
  staff = await signUp("Julie_Staff");
  await addMember(structureId, staff.id, "staff", ["scan"]);
  visitor = await signUp("Visiteur_66");
  other = await signUp("Curieux_34");
  event = await makeEvent();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const present = (u: TestUser | null, body: unknown, eventId = event.id) =>
  call(u, "POST", `/events/${eventId}/presence`, body);
const here = (u: TestUser | null, eventId = event.id) => present(u, { ...DEVICE, accuracyM: 12 }, eventId);
const fiche = (u: TestUser | null = null) => call(u, "GET", `/events/by-slug/${event.slug}`);
const summary = (u: TestUser | null, eventId = event.id) => call(u, "GET", `/events/${eventId}/presences/summary`);

/** Une candidature de véhicule retenue (et entrée si `entered`) pour la personne. */
async function exhibitor(
  u: TestUser,
  opts: { entered?: boolean; status?: "accepted" | "pending" } = {},
  eid = event.id,
) {
  const vehicle = await createVehicle(u.id, ref);
  const [app] = await db
    .insert(applications)
    .values({
      eventId: eid,
      userId: u.id,
      vehicleId: vehicle.id,
      status: opts.status ?? "accepted",
      rulesAcceptedAt: clock.now,
      followStructure: false,
    })
    .returning();
  if (opts.entered) {
    await db.insert(checkins).values({ applicationId: app!.id, eventId: eid, method: "scan", checkedInAt: clock.now });
  }
  return app!;
}

/** Un billet (valide, ou contrôlé si `scanned`) pour la personne, sans passer par la billetterie. */
async function ticket(u: TestUser, opts: { scanned?: boolean; cancelled?: boolean } = {}, eid = event.id) {
  const existing = await db.query.ticketTypes.findFirst({ where: eq(ticketTypes.eventId, eid) });
  const [type] = existing
    ? [existing]
    : await db
        .insert(ticketTypes)
        .values({ eventId: eid, name: "Entrée visiteur", capacity: 100, priceCents: 0 })
        .returning();
  const [order] = await db
    .insert(orders)
    .values({ eventId: eid, userId: u.id, ticketTypeId: type!.id, status: "paid", quantity: 1, paidAt: clock.now })
    .returning();
  await db
    .insert(signingKeys)
    .values({ kid: 1, publicKey: Buffer.alloc(32) })
    .onConflictDoNothing();
  const [t] = await db
    .insert(tickets)
    .values({
      orderId: order!.id,
      eventId: eid,
      userId: u.id,
      ticketTypeId: type!.id,
      status: opts.cancelled ? "cancelled" : opts.scanned ? "used" : "valid",
      kid: 1,
      signature: Buffer.from("00", "hex"),
      issuedAt: clock.now,
      usedAt: opts.scanned ? clock.now : null,
      cancelledAt: opts.cancelled ? clock.now : null,
    })
    .returning();
  return t!;
}

describe("présence par GPS : validation", () => {
  it("valide dans la zone : ligne sans position, tampon visite, notification, droit de vote", async () => {
    const res = await here(visitor);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ validatedAt: clock.now.toISOString(), stampId: expect.any(String), canVote: true });
    const rows = await db.query.eventPresences.findMany({ where: eq(eventPresences.eventId, event.id) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: visitor.id, kind: "gps", ticketId: null });
    expect(rows[0]?.validatedAt).toEqual(clock.now);
    const stamps = await db.query.passportStamps.findMany({ where: eq(passportStamps.userId, visitor.id) });
    expect(stamps).toHaveLength(1);
    expect(stamps[0]).toMatchObject({ kind: "visit", eventId: event.id, ticketId: null, id: res.json.stampId });
    const notes = await db.query.notifications.findMany({ where: eq(notifications.userId, visitor.id) });
    const note = notes.find((n) => n.type === "presence_validated");
    expect(note).toMatchObject({ eventId: event.id, inJournal: true });
    expect(note?.body).toContain("Rassemblement du Lydia");
  });

  it("la précision est facultative", async () => {
    expect((await present(visitor, { ...DEVICE })).status).toBe(200);
  });

  it("avec un billet : la ligne et le tampon portent le billet", async () => {
    const t = await ticket(visitor);
    const res = await here(visitor);
    expect(res.status).toBe(200);
    const row = await db.query.eventPresences.findFirst({ where: eq(eventPresences.userId, visitor.id) });
    expect(row?.ticketId).toBe(t.id);
    const stamp = await db.query.passportStamps.findFirst({ where: eq(passportStamps.userId, visitor.id) });
    expect(stamp).toMatchObject({ kind: "visit", ticketId: t.id });
  });

  it("un billet annulé ne compte pas comme une place", async () => {
    await ticket(visitor, { cancelled: true });
    expect((await here(visitor)).status).toBe(200);
    const row = await db.query.eventPresences.findFirst({ where: eq(eventPresences.userId, visitor.id) });
    expect(row?.ticketId).toBeNull();
  });

  it("le tampon n'est posé qu'une fois, même si le billet a déjà été contrôlé", async () => {
    await ticket(visitor, { scanned: true });
    // Tampon déjà posé par le contrôle du billet.
    const first = await here(visitor);
    expect(first.status).toBe(200);
    const stamps = await db.query.passportStamps.findMany({ where: eq(passportStamps.userId, visitor.id) });
    expect(stamps.filter((s) => s.kind === "visit")).toHaveLength(1);
    expect(first.json.stampId).toBe(stamps.find((s) => s.kind === "visit")?.id);
  });

  it("publie « quelque chose a changé » (le nombre sur place) pour l'organisation, rien d'autre", async () => {
    const messages: { type: string; payload: Record<string, unknown> }[] = [];
    const socket = { send: (data: string) => messages.push(JSON.parse(data)) };
    realtime.subscribe(`event:${event.id}:live`, socket);
    await here(visitor);
    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(messages[0]).toMatchObject({ type: "presence.changed" });
    expect(Object.keys(messages[0]?.payload ?? {})).toEqual(["onSiteCount"]);
    expect(messages[0]?.payload.onSiteCount).toBe(1);
    realtime.unsubscribeAll(socket);
  });

  it("ouvre 30 minutes avant le début, pas avant", async () => {
    clock.set(new Date(STARTS.getTime() - 31 * 60_000));
    const early = await here(visitor);
    expect(early.status).toBe(409);
    expect(early.json.error.code).toBe("closed");
    clock.set(new Date(STARTS.getTime() - 30 * 60_000));
    expect((await here(visitor)).status).toBe(200);
  });
});

describe("présence par GPS : refus", () => {
  it("connexion exigée", async () => {
    expect((await here(null)).status).toBe(401);
  });

  it("closed : après la fin, événement annulé ; brouillon introuvable", async () => {
    clock.set(ENDS);
    const after = await here(visitor);
    expect(after.status).toBe(409);
    expect(after.json.error).toMatchObject({ code: "closed", message: presenceLabels.errors.closed });
    clock.set(paris(11, 7, 10));
    const cancelled = await makeEvent({ status: "cancelled" });
    expect((await here(visitor, cancelled.id)).json.error.code).toBe("closed");
    const draft = await makeEvent({ status: "draft" });
    expect((await here(visitor, draft.id)).status).toBe(404);
  });

  it("use_qr : un exposant retenu ou entré se fait scanner", async () => {
    await exhibitor(visitor);
    const res = await here(visitor);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("use_qr");
    expect(await db.query.eventPresences.findMany()).toHaveLength(0);
    // Une candidature seulement en attente ne donne pas de place : la présence est possible.
    await exhibitor(other, { status: "pending" });
    expect((await here(other)).status).toBe(200);
  });

  it("use_qr aussi pour un véhicule entré dont la candidature n'est plus « retenue »", async () => {
    const app = await exhibitor(visitor, { entered: true });
    await db.update(applications).set({ status: "cancelled" }).where(eq(applications.id, app.id));
    expect((await here(visitor)).json.error.code).toBe("use_qr");
  });

  it("already_present : une validation par compte, la seconde est refusée", async () => {
    expect((await here(visitor)).status).toBe(200);
    const again = await here(visitor);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("already_present");
    expect(await db.query.eventPresences.findMany()).toHaveLength(1);
    expect(
      (await db.query.passportStamps.findMany({ where: eq(passportStamps.userId, visitor.id) })).filter(
        (s) => s.kind === "visit",
      ),
    ).toHaveLength(1);
  });

  it("already_present : deux demandes simultanées, une seule passe (unicité 23505 rendue en 409)", async () => {
    const [a, b] = await Promise.all([here(visitor), here(visitor)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const refused = a.status === 409 ? a : b;
    expect(refused.json.error.code).toBe("already_present");
    expect(await db.query.eventPresences.findMany()).toHaveLength(1);
  });

  it("gps_imprecise : au-delà de 150 m (150 m accepté), sans écrire", async () => {
    const bad = await present(visitor, { ...DEVICE, accuracyM: 150.5 });
    expect(bad.status).toBe(422);
    expect(bad.json.error.code).toBe("gps_imprecise");
    expect(await db.query.eventPresences.findMany()).toHaveLength(0);
    expect((await present(visitor, { ...DEVICE, accuracyM: 150 })).status).toBe(200);
  });

  it("out_of_zone : hors du rayon (300 m par défaut), tolérance = rayon + précision, bord compris", async () => {
    const far = await present(visitor, { ...north(5000), accuracyM: 10 });
    expect(far.status).toBe(422);
    expect(far.json.error.code).toBe("out_of_zone");
    expect((await present(visitor, { ...north(320), accuracyM: 10 })).json.error.code).toBe("out_of_zone");
    // 320 m avec 30 m d'incertitude : dans la tolérance (300 + 30).
    expect((await present(visitor, { ...north(320), accuracyM: 30 })).status).toBe(200);
    // Le bord : 300 + 40 = 340 m ; 339 dedans, 341 dehors.
    expect((await present(other, { ...north(341), accuracyM: 40 })).json.error.code).toBe("out_of_zone");
    expect((await present(other, { ...north(339), accuracyM: 40 })).status).toBe(200);
  });

  it("la zone de l'organisateur remplace 300 m", async () => {
    await db.update(events).set({ presenceRadiusM: 1000 }).where(eq(events.id, event.id));
    expect((await present(visitor, { ...north(900), accuracyM: 5 })).status).toBe(200);
    await db.update(events).set({ presenceRadiusM: 50 }).where(eq(events.id, event.id));
    expect((await present(other, { ...north(120), accuracyM: 5 })).json.error.code).toBe("out_of_zone");
  });

  it("no_zone : un lieu sans position", async () => {
    const e = await makeEvent({ lat: null, lng: null });
    const res = await present(visitor, { ...DEVICE, accuracyM: 5 }, e.id);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("no_zone");
  });

  it("événement sur invitation : seuls les ayants droit", async () => {
    const e = await makeEvent({ admission: "invite_only" });
    expect((await present(visitor, { ...DEVICE, accuracyM: 5 }, e.id)).status).toBe(403);
    expect((await present(visitor, { ...DEVICE, accuracyM: 5 }, e.id)).json.error.code).toBe("invite_only");
  });

  it("corps invalide : 400, jamais d'écho de la position ; champ en plus refusé", async () => {
    for (const body of [
      {},
      { lat: 42.788137 },
      { lat: "42.788137", lng: 3.038991 },
      { lat: 95, lng: 3.038991 },
      { lat: 42.788137, lng: 181 },
      { ...DEVICE, accuracyM: -3 },
      { ...DEVICE, deviceName: "Pixel" },
    ]) {
      const res = await present(visitor, body);
      expect(res.status).toBe(400);
      expect(res.text).not.toContain("42.788137");
      expect(res.text).not.toContain("3.038991");
    }
  });

  it("5 essais en 10 minutes par compte, refus compris", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await present(visitor, { ...north(5000), accuracyM: 10 })).status).toBe(422);
    }
    const sixth = await present(visitor, { ...DEVICE, accuracyM: 10 });
    expect(sixth.status).toBe(429);
    expect(sixth.json.error.code).toBe("rate_limited");
    // Un autre compte n'est pas touché.
    expect((await here(other)).status).toBe(200);
  });
});

describe("présence par GPS : la position n'est jamais gardée", () => {
  it("aucune colonne de position dans la table des présences, ni de nouvelle colonne de position sur les événements", async () => {
    const cols = await db.execute<{ table_name: string; column_name: string }>(
      sql`select table_name, column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'event_presences'`,
    );
    const names = cols.rows.map((c) => c.column_name).sort();
    expect(names).toEqual(
      [
        "created_at",
        "device_id",
        "event_id",
        "id",
        "kind",
        "ticket_id",
        "updated_at",
        "user_id",
        "validated_at",
      ].sort(),
    );
    expect(
      names.filter((n) => /^(lat|lng|lon|latitude|longitude|position|coord|geo|accuracy|location)/i.test(n)),
    ).toEqual([]);
  });

  it("ni en base (aucune table), ni dans les logs, ni dans la réponse, ni dans le signal temps réel", async () => {
    const logs: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
    const messages: string[] = [];
    const socket = { send: (data: string) => messages.push(data) };
    realtime.subscribe(`event:${event.id}:live`, socket);
    const ok = await present(visitor, { ...DEVICE, accuracyM: 12.3456 });
    expect(ok.status).toBe(200);
    // Les refus aussi : hors zone, déjà présent.
    await present(other, { ...north(4000), accuracyM: 12.3456 });
    await present(visitor, { ...DEVICE, accuracyM: 12.3456 });
    await notificationsService.flush();
    await vi.waitFor(() => expect(messages.length).toBeGreaterThan(0));
    realtime.unsubscribeAll(socket);
    // Un chiffre de la position (ou de la précision) en base, dans une table, n'importe laquelle.
    const tables = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const needles = ["42.788137", "3.038991", "12.3456", "42.78813", "3.03899"];
    for (const { table_name } of tables.rows) {
      for (const needle of needles) {
        const hit = await db.execute(
          sql.raw(`select 1 from "${table_name}" t where row_to_json(t)::text like '%${needle}%' limit 1`),
        );
        expect(hit.rows, `${table_name} contient ${needle}`).toHaveLength(0);
      }
    }
    for (const text of [JSON.stringify(ok.json), ...messages, ...logs]) {
      for (const needle of needles) expect(text).not.toContain(needle);
    }
  });
});

describe("droit de vote d'un présent par GPS", () => {
  it("sans présence : pas de vote ; avec : le vote est ouvert et la voix compte", async () => {
    const a = await exhibitor(await signUp("Pilote_001"), { entered: true });
    await exhibitor(await signUp("Pilote_002"), { entered: true });
    const before = await call(visitor, "GET", `/events/${event.id}/audience-prize/mine`);
    expect(before.json).toMatchObject({ canVote: false, reason: "not_checked_in" });
    expect(
      (await call(visitor, "PUT", `/events/${event.id}/audience-prize/vote`, { applicationId: a.id })).status,
    ).toBe(403);
    await here(visitor);
    const after = await call(visitor, "GET", `/events/${event.id}/audience-prize/mine`);
    expect(after.json).toMatchObject({ canVote: true, reason: null, open: true });
    const voted = await call(visitor, "PUT", `/events/${event.id}/audience-prize/vote`, { applicationId: a.id });
    expect(voted.status).toBe(200);
    expect(voted.json.votedFor).toBe(a.id);
    // Un autre compte, sans présence : toujours refusé.
    expect((await call(other, "PUT", `/events/${event.id}/audience-prize/vote`, { applicationId: a.id })).status).toBe(
      403,
    );
    // Le droit ne dépasse pas la fin de l'événement.
    clock.set(ENDS);
    const closed = await call(visitor, "GET", `/events/${event.id}/audience-prize/mine`);
    expect(closed.json).toMatchObject({ canVote: false, reason: "vote_closed" });
    // Voir aussi directement la règle.
    expect(await audiencePrizeService.mine(await viewerOf(visitor), event.id)).toMatchObject({ canVote: false });
  });
});

describe("le direct : compteurs de la fiche, par phase (règle des absents)", () => {
  async function crowd() {
    const a = await exhibitor(await signUp("Pilote_001"), { entered: true });
    await exhibitor(await signUp("Pilote_002"), { entered: true });
    await exhibitor(await signUp("Pilote_003"));
    await exhibitor(await signUp("Pilote_004"));
    await exhibitor(await signUp("Pilote_005"), { status: "pending" });
    await ticket(await signUp("Visiteur_A"), { scanned: true });
    await ticket(await signUp("Visiteur_B"));
    await here(visitor);
    return a;
  }

  it("pendant : N sur place (véhicules entrés + billets contrôlés + présences GPS), sur M retenues", async () => {
    await crowd();
    const anon = await fiche();
    expect(anon.status).toBe(200);
    expect(anon.json.live).toMatchObject({
      phase: "running",
      dayIndex: 1,
      dayCount: 1,
      onSiteCount: 4,
      acceptedCount: 4,
      myPresence: null,
      votesOpen: 1,
      organizerStoryAvailable: false,
    });
    expect((await fiche(visitor)).json.live.myPresence).toBe("gps");
    expect((await fiche(other)).json.live.myPresence).toBeNull();
    // L'organisation voit la même chose (GET /events/:id).
    const org = await call(orga, "GET", `/events/${event.id}`);
    expect(org.json.live).toMatchObject({ phase: "running", onSiteCount: 4, acceptedCount: 4 });
  });

  it("un billet contrôlé et une présence GPS d'une même personne ne comptent qu'une fois", async () => {
    await ticket(visitor, { scanned: true });
    await here(visitor);
    expect((await fiche()).json.live.onSiteCount).toBe(1);
  });

  it("myPresence : l'entrée du véhicule, puis le billet contrôlé, puis le GPS", async () => {
    await exhibitor(visitor, { entered: true });
    expect((await fiche(visitor)).json.live.myPresence).toBe("checked_in");
    await ticket(other, { scanned: true });
    expect((await fiche(other)).json.live.myPresence).toBe("ticket");
  });

  it("avant le début : aucun compteur, et « ouvert » reste faux", async () => {
    await crowd();
    clock.set(new Date(STARTS.getTime() - 3_600_000));
    const res = await fiche();
    expect(res.json.live).toMatchObject({
      phase: "before",
      onSiteCount: null,
      acceptedCount: null,
      votesOpen: 0,
    });
  });

  it("après la fin : ni retenues ni présents, pour personne (organisation comprise)", async () => {
    await crowd();
    clock.set(new Date(ENDS.getTime() + 1_000));
    const anon = await fiche();
    expect(anon.json.live).toMatchObject({ phase: "after", onSiteCount: null, acceptedCount: null, votesOpen: 0 });
    expect(anon.json.acceptedCount).toBeNull();
    const logged = await fiche(visitor);
    expect(logged.json.live).toMatchObject({ onSiteCount: null, acceptedCount: null, myPresence: "gps" });
    const org = await call(orga, "GET", `/events/${event.id}`);
    expect(org.json.live).toMatchObject({ phase: "after", onSiteCount: null, acceptedCount: null });
    // Aucun des deux nombres ne se retrouve ailleurs dans la réponse publique.
    expect(JSON.stringify(anon.json.live)).not.toMatch(/"(onSiteCount|acceptedCount)":\d/);
  });

  it("événement annulé : pas de direct", async () => {
    await crowd();
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, event.id));
    const res = await fiche();
    expect(res.json.live).toMatchObject({ onSiteCount: null, acceptedCount: null, votesOpen: 0 });
  });

  it("plusieurs jours : « jour 2 sur 4 »", async () => {
    const days = [0, 1, 2, 3].map((n) => ({
      eventId: event.id,
      dayDate: `2026-11-${String(7 + n).padStart(2, "0")}`,
      startsAt: paris(11, 7 + n, 9),
      endsAt: paris(11, 7 + n, 18),
    }));
    await db.insert(eventDays).values(days);
    const lastEnd = paris(11, 10, 18);
    await db.update(events).set({ endsAt: lastEnd }).where(eq(events.id, event.id));
    clock.set(paris(11, 8, 12));
    expect((await fiche()).json.live).toMatchObject({ phase: "running", dayIndex: 2, dayCount: 4 });
    // La nuit entre le jour 2 et le jour 3 : toujours « jour 2 », toujours en cours.
    clock.set(paris(11, 8, 23));
    expect((await fiche()).json.live).toMatchObject({ phase: "running", dayIndex: 2, dayCount: 4 });
    clock.set(paris(11, 10, 10));
    expect((await fiche()).json.live).toMatchObject({ dayIndex: 4, dayCount: 4 });
    expect((await fiche()).json.live.phase).toBe("running");
    // Fin de l'événement : le dernier jour fini, plus rien de compté.
    clock.set(new Date(lastEnd.getTime() + 1_000));
    expect((await fiche()).json.live).toMatchObject({ phase: "after", onSiteCount: null, acceptedCount: null });
  });
});

describe("statistique de l'organisateur", () => {
  async function setupCrowd() {
    await exhibitor(await signUp("Pilote_001"), { entered: true });
    await exhibitor(await signUp("Pilote_002"), { entered: true });
    await ticket(await signUp("Visiteur_A"), { scanned: true });
    const withTicket = await signUp("Visiteur_B");
    await ticket(withTicket);
    await here(withTicket);
    await here(visitor);
  }

  it("des nombres seulement : exposants entrés, visiteurs avec et sans billet par GPS, total", async () => {
    await setupCrowd();
    const res = await summary(orga);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ exhibitorsCheckedIn: 2, visitorsWithTicketGps: 1, visitorsNoTicketGps: 1, total: 5 });
    expect(JSON.stringify(res.json)).not.toMatch(/Visiteur|Pilote|userId|pseudo|email/);
  });

  it("le staff de l'événement le lit ; un participant, un visiteur ou un anonyme non", async () => {
    await setupCrowd();
    expect((await summary(staff)).status).toBe(200);
    expect((await summary(visitor)).status).toBe(403);
    expect((await summary(other)).status).toBe(403);
    expect((await summary(null)).status).toBe(401);
    // Un exposant retenu n'y a pas droit non plus.
    const exposant = await signUp("Pilote_009");
    await exhibitor(exposant);
    expect((await summary(exposant)).status).toBe(403);
    // Ni l'organisateur d'une autre structure.
    const stranger = await signUp("Autre_Orga", { twoFactor: true });
    await createStructure(stranger.id);
    expect((await summary(stranger)).status).toBe(403);
  });

  it("reste lisible après la fin (le bilan de l'organisateur), toujours sans liste", async () => {
    await setupCrowd();
    clock.set(new Date(ENDS.getTime() + 86_400_000));
    const res = await summary(orga);
    expect(res.status).toBe(200);
    expect(Object.keys(res.json).sort()).toEqual(
      ["exhibitorsCheckedIn", "total", "visitorsNoTicketGps", "visitorsWithTicketGps"].sort(),
    );
  });

  it("un événement inconnu : 404", async () => {
    expect((await summary(orga, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});

describe("zone de l'organisateur : PATCH /events/:id", () => {
  it("accepte 50 à 2000 m, vide (null) = 300 m ; hors bornes refusé", async () => {
    const set = (presenceRadiusM: unknown) => call(orga, "PATCH", `/events/${event.id}`, { presenceRadiusM });
    const ok = await set(400);
    expect(ok.status).toBe(200);
    expect(ok.json.presenceRadiusM).toBe(400);
    expect((await set(50)).json.presenceRadiusM).toBe(50);
    expect((await set(2000)).json.presenceRadiusM).toBe(2000);
    expect((await set(49)).status).toBe(400);
    expect((await set(2001)).status).toBe(400);
    expect((await set(300.5)).status).toBe(400);
    expect((await set("400")).status).toBe(400);
    const cleared = await set(null);
    expect(cleared.status).toBe(200);
    expect(cleared.json.presenceRadiusM).toBeNull();
    expect((await db.query.events.findFirst({ where: eq(events.id, event.id) }))?.presenceRadiusM).toBeNull();
  });

  it("réservé à l'organisation", async () => {
    expect((await call(staff, "PATCH", `/events/${event.id}`, { presenceRadiusM: 400 })).status).toBe(403);
    expect((await call(visitor, "PATCH", `/events/${event.id}`, { presenceRadiusM: 400 })).status).toBe(403);
  });

  it("la contrainte de la base refuse aussi un rayon hors bornes", async () => {
    await expect(db.update(events).set({ presenceRadiusM: 10 }).where(eq(events.id, event.id))).rejects.toThrow();
  });

  it("la fiche publique ne montre pas le rayon (réglage de l'organisation)", async () => {
    await call(orga, "PATCH", `/events/${event.id}`, { presenceRadiusM: 400 });
    expect(JSON.stringify((await fiche()).json)).not.toContain("presenceRadiusM");
  });

  it("une copie de l'événement garde la zone", async () => {
    await call(orga, "PATCH", `/events/${event.id}`, { presenceRadiusM: 700 });
    const copy = await call(orga, "POST", `/events/${event.id}/duplicate`);
    expect(copy.status).toBe(201);
    expect(copy.json.presenceRadiusM).toBe(700);
  });
});

describe("Accueil : le widget « En cours »", () => {
  const home = (u: TestUser) => call(u, "GET", "/me/home");

  it("l'événement en cours où j'ai une place retenue : jour, sur place, votes, programme du jour", async () => {
    await db.update(events).set({ instructions: "Entrée par l'avenue du Grand Large." }).where(eq(events.id, event.id));
    const a = await signUp("Pilote_001");
    await exhibitor(a, { entered: true });
    await exhibitor(await signUp("Pilote_002"), { entered: true });
    const res = await home(a);
    expect(res.status).toBe(200);
    expect(res.json.live).toMatchObject({
      event: { id: event.id, slug: event.slug, title: "Rassemblement du Lydia" },
      dayIndex: 1,
      dayCount: 1,
      onSiteCount: 2,
      votes: { open: 1, voted: 0 },
      organizerStory: null,
      programToday: {
        startsAt: STARTS.toISOString(),
        endsAt: ENDS.toISOString(),
        instructions: "Entrée par l'avenue du Grand Large.",
      },
    });
    expect(res.json.live.programToday.dayDate).toBe("2026-11-07");
  });

  it("un visiteur avec un billet ou une présence : le bloc, sans les consignes des retenus", async () => {
    await db.update(events).set({ instructions: "Consigne retenus" }).where(eq(events.id, event.id));
    await ticket(visitor);
    const withTicket = await home(visitor);
    expect(withTicket.json.live).toMatchObject({ event: { id: event.id }, programToday: { instructions: null } });
    await here(other);
    expect((await home(other)).json.live).toMatchObject({ event: { id: event.id }, onSiteCount: 1 });
  });

  it("personne d'autre : null ; pas de bloc hors de l'événement (règle des absents)", async () => {
    await exhibitor(await signUp("Pilote_001"), { entered: true });
    expect((await home(other)).json.live).toBeNull();
    const a = await signUp("Pilote_007");
    await exhibitor(a);
    expect((await home(a)).json.live).not.toBeNull();
    clock.set(new Date(ENDS.getTime() + 1_000));
    expect((await home(a)).json.live).toBeNull();
    clock.set(new Date(STARTS.getTime() - 60_000));
    expect((await home(a)).json.live).toBeNull();
  });

  it("une candidature seulement en attente ne donne pas le bloc ; un événement annulé non plus", async () => {
    const a = await signUp("Pilote_008");
    await exhibitor(a, { status: "pending" });
    expect((await home(a)).json.live).toBeNull();
    const b = await signUp("Pilote_009");
    await exhibitor(b);
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, event.id));
    expect((await home(b)).json.live).toBeNull();
  });

  it("masqué dans le réglage de l'Accueil : non calculé, et « live » vient après « Prochain accès »", async () => {
    const a = await signUp("Pilote_001");
    await exhibitor(a);
    const before = await home(a);
    expect(before.json.widgets.order.slice(0, 2)).toEqual(["next_access", "live"]);
    expect(before.json.live).not.toBeNull();
    const order = before.json.widgets.order as string[];
    const put = await call(a, "PUT", "/me/home/widgets", { order, hidden: ["live"] });
    expect(put.status).toBe(200);
    expect((await home(a)).json.live).toBeNull();
  });

  it("plusieurs événements en cours : le dernier commencé", async () => {
    const older = await makeEvent({ title: "Plus ancien", startsAt: paris(11, 6, 20), endsAt: paris(11, 8, 20) });
    const a = await signUp("Pilote_001");
    await exhibitor(a);
    await exhibitor(a, {}, older.id);
    expect((await home(a)).json.live.event.id).toBe(event.id);
  });
});
