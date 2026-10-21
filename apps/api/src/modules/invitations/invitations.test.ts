// Invitations nominatives, événement privé, avantages des hauts grades (lot 25) : création (pseudo, véhicule, e-mail,
// édition précédente), acceptation (retenue + pass, liste d'attente en tête si complet), refus, expiration au
// verrouillage, lien par e-mail et rattachement, visibilité de l'événement privé, avant-premières et priorité des hauts
// grades, droits, anti-abus, concurrence, anonymisation, et le scénario du critère de fin. Routes en cookie ET porteur.
import { fromWallTime, HOUR, INVITATIONS_PER_STRUCTURE_PER_DAY } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addMember,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  accessPasses,
  applications,
  emailOutbox,
  eventInvitations,
  type events,
  notifications,
  profiles,
  structureFollows,
  user,
  vehicles,
} from "../../db/schema";
import { mail } from "../../lib/mail";
import { accountService } from "../account/service";
import { applicationsService } from "../applications/service";
import { highGradePreview } from "../events/high-grade";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const MODES = ["cookie", "bearer"] as const;
type Mode = (typeof MODES)[number];

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 1, 10));
  ref = await seedReference();
});

const bearerOf = (cookie: string) => {
  const raw = cookie
    .split("; ")
    .find((c) => c.startsWith("better-auth.session_token="))
    ?.slice("better-auth.session_token=".length);
  return raw ? decodeURIComponent(raw) : "";
};

async function req(u: TestUser | null, method: string, path: string, body?: unknown, mode: Mode = "cookie") {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(u && mode === "cookie" ? { cookie: u.cookie } : {}),
      ...(u && mode === "bearer" ? { authorization: `Bearer ${bearerOf(u.cookie)}` } : {}),
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

type EventValues = Partial<typeof events.$inferInsert>;

/** Organisateur (2FA prouvée) avec sa structure vérifiée et un événement publié le 20/10 à 18:00. */
async function setup(values: EventValues = {}) {
  const damien = await signUp("Damien", { twoFactor: true });
  const s = await createStructure(damien.id);
  const e = await createEvent(s.id, {
    startsAt: paris(10, 20, 18),
    endsAt: paris(10, 20, 23),
    registrationsOpenAt: paris(9, 1, 10),
    ...values,
  });
  return { damien, s, e };
}

const setGrade = (userId: string, grade: "rodage" | "route" | "sport" | "circuit" | "legende") =>
  db.update(profiles).set({ grade }).where(eq(profiles.userId, userId));

const invitationOf = async (eventId: string, userId: string) =>
  db.query.eventInvitations.findFirst({
    where: and(eq(eventInvitations.eventId, eventId), eq(eventInvitations.userId, userId)),
  });

describe("invitation d'un véhicule : acceptation", () => {
  for (const mode of MODES) {
    it(`retenu directement avec QR, notification reçue, Boîte comptée (${mode})`, async () => {
      const { damien, s, e } = await setup({ capacity: 10 });
      const kenji = await signUp("Kenji");
      const car = await createVehicle(kenji.id, ref);
      const sent = await req(
        damien,
        "POST",
        `/events/${e.id}/invitations`,
        { vehicleIds: [car.id], message: "Viens !" },
        mode,
      );
      expect(sent.status).toBe(201);
      expect(sent.json).toEqual({ created: 1, skipped: [] });

      const summary = await req(kenji, "GET", "/me/inbox/summary", undefined, mode);
      expect(summary.json.requests.eventInvitation).toBe(1);
      const notif = await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, kenji.id), eq(notifications.type, "event_invitation_received")),
      });
      expect(notif?.body).toContain(s.name);

      const mine = await req(kenji, "GET", "/me/event-invitations", undefined, mode);
      expect(mine.status).toBe(200);
      expect(mine.json).toHaveLength(1);
      expect(mine.json[0]).toMatchObject({ status: "pending", message: "Viens !", vehicle: { id: car.id } });
      expect(JSON.stringify(mine.json)).not.toContain(car.plate ?? "plaque");

      const accepted = await req(kenji, "POST", `/event-invitations/${mine.json[0].id}/accept`, {}, mode);
      expect(accepted.status).toBe(200);
      expect(accepted.json.outcome).toBe("accepted");
      const appRow = await db.query.applications.findFirst({ where: eq(applications.id, accepted.json.applicationId) });
      expect(appRow).toMatchObject({ status: "accepted", source: "invitation", vehicleId: car.id, userId: kenji.id });
      const pass = await db.query.accessPasses.findFirst({ where: eq(accessPasses.applicationId, appRow!.id) });
      expect(pass?.revokedAt).toBeNull();
      expect((await invitationOf(e.id, kenji.id))?.status).toBe("accepted");
      expect((await req(kenji, "GET", "/me/inbox/summary", undefined, mode)).json.requests.eventInvitation).toBe(0);
      // Une invitation consommée ne se réutilise pas.
      expect((await req(kenji, "POST", `/event-invitations/${mine.json[0].id}/accept`, {}, mode)).status).toBe(409);
    });
  }

  it("invitation d'une personne : le véhicule est choisi, puis vérifié (actif, à moi, admis, photo)", async () => {
    const { damien, e } = await setup({ admittedVehicleTypes: ["car"] });
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const moto = await createVehicle(kenji.id, { ...ref, modelId: ref.motoModelId }, { vehicleType: "moto" });
    const sold = await createVehicle(kenji.id, ref, { status: "sold" });
    const notMine = await createVehicle(nina.id, ref);
    const car = await createVehicle(kenji.id, ref);
    expect((await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: ["kenji"] })).json.created).toBe(1);
    const inv = await invitationOf(e.id, kenji.id);
    const accept = (vehicleId?: string) =>
      req(kenji, "POST", `/event-invitations/${inv!.id}/accept`, vehicleId ? { vehicleId } : {});
    expect((await accept()).status).toBe(400);
    expect((await accept(moto.id)).json.error.message).toContain("pas admis");
    expect((await accept(sold.id)).status).toBe(400);
    expect((await accept(notMine.id)).status).toBe(404);
    const ok = await accept(car.id);
    expect(ok.status).toBe(200);
    expect(ok.json.outcome).toBe("accepted");
  });

  it("transfert de plaque (lot 31) : un véhicule vendu ou en attente de transfert ne s'inscrit pas", async () => {
    const { damien, e } = await setup();
    const kenji = await signUp("Kenji");
    const car = await createVehicle(kenji.id, ref);
    await req(damien, "POST", `/events/${e.id}/invitations`, { vehicleIds: [car.id] });
    const inv = await invitationOf(e.id, kenji.id);
    await db.update(vehicles).set({ status: "sold" }).where(eq(vehicles.id, car.id));
    const res = await req(kenji, "POST", `/event-invitations/${inv!.id}/accept`, {});
    expect(res.status).toBe(400);
    // Un autre véhicule ne remplace pas celui de l'invitation.
    const other = await createVehicle(kenji.id, ref);
    expect((await req(kenji, "POST", `/event-invitations/${inv!.id}/accept`, { vehicleId: other.id })).status).toBe(
      400,
    );
  });
});

describe("événement complet (S25) et liste d'attente", () => {
  it("l'invité passe en tête de la liste d'attente, l'organisation est prévenue", async () => {
    const { damien, e } = await setup({ capacity: 1, admission: "open" });
    const paul = await signUp("Paul");
    const lea = await signUp("Lea");
    const kenji = await signUp("Kenji");
    for (const u of [paul, lea]) {
      const v = await createVehicle(u.id, ref);
      expect(
        (
          await req(u, "POST", `/events/${e.id}/applications`, {
            vehicleIds: [v.id],
            rulesAccepted: true,
            followStructure: false,
          })
        ).status,
      ).toBe(201);
    }
    const car = await createVehicle(kenji.id, ref);
    await req(damien, "POST", `/events/${e.id}/invitations`, { vehicleIds: [car.id] });
    const inv = await invitationOf(e.id, kenji.id);
    const res = await req(kenji, "POST", `/event-invitations/${inv!.id}/accept`, {});
    expect(res.status).toBe(200);
    expect(res.json.outcome).toBe("waitlisted");
    const waitlist = await db
      .select({ userId: applications.userId, rank: applications.waitlistRank })
      .from(applications)
      .where(and(eq(applications.eventId, e.id), eq(applications.status, "waitlisted")))
      .orderBy(applications.waitlistRank);
    expect(waitlist.map((w) => w.userId)).toEqual([kenji.id, lea.id]);
    expect(waitlist.map((w) => w.rank)).toEqual([1, 2]);
    const blocked = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, damien.id), eq(notifications.type, "invitation_capacity_blocked")),
    });
    expect(blocked?.body).toContain("Kenji");
    // La place libérée lui est offerte en premier.
    const paulApp = await db.query.applications.findFirst({ where: eq(applications.userId, paul.id) });
    expect((await req(paul, "POST", `/applications/${paulApp!.id}/withdraw`)).status).toBe(200);
    const kenjiApp = await db.query.applications.findFirst({ where: eq(applications.userId, kenji.id) });
    expect(kenjiApp?.status).toBe("offered");
  });
});

describe("refus, retrait, expiration", () => {
  for (const mode of MODES) {
    it(`refus : statut visible par l'équipe organisatrice, plus de nouvelle invitation (${mode})`, async () => {
      const { damien, e } = await setup();
      const kenji = await signUp("Kenji");
      await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: ["Kenji"] }, mode);
      const inv = await invitationOf(e.id, kenji.id);
      expect((await req(kenji, "POST", `/event-invitations/${inv!.id}/decline`, undefined, mode)).status).toBe(204);
      const list = await req(damien, "GET", `/events/${e.id}/invitations`, undefined, mode);
      expect(list.json[0]).toMatchObject({ status: "declined", pseudo: "Kenji" });
      expect(list.json[0].declinedAt).not.toBeNull();
      const again = await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: ["Kenji"] }, mode);
      expect(again.json).toEqual({ created: 0, skipped: [{ target: "Kenji", reason: "already_invited" }] });
      expect((await req(kenji, "GET", "/me/event-invitations", undefined, mode)).json).toHaveLength(0);
    });
  }

  it("expiration au verrouillage (tâche event.lock) ; accepter après le verrouillage est refusé", async () => {
    const { damien, e } = await setup();
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const car = await createVehicle(kenji.id, ref);
    await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: ["Kenji", "Nina"] });
    const inv = await invitationOf(e.id, kenji.id);
    clock.set(paris(10, 20, 16, 1));
    expect((await req(kenji, "POST", `/event-invitations/${inv!.id}/accept`, { vehicleId: car.id })).status).toBe(423);
    expect(await applicationsService.lockEvent(e.id)).toBe(true);
    expect((await invitationOf(e.id, kenji.id))?.status).toBe("expired");
    expect((await invitationOf(e.id, nina.id))?.status).toBe("expired");
    const notif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, kenji.id), eq(notifications.type, "event_invitation_received")),
    });
    expect(notif?.readAt).not.toBeNull();
    // Inviter après le verrouillage : refusé.
    expect((await req(damien, "POST", `/events/${e.id}/invitations`, { emails: ["x@orasso.test"] })).status).toBe(423);
  });

  it("retrait d'une invitation en attente ; garde de 24 h avant de réinviter la même personne", async () => {
    const { damien, e } = await setup();
    const kenji = await signUp("Kenji");
    await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: ["Kenji"] });
    const inv = await invitationOf(e.id, kenji.id);
    expect((await req(damien, "DELETE", `/events/${e.id}/invitations/${inv!.id}`)).status).toBe(204);
    expect((await req(kenji, "GET", "/me/event-invitations")).json).toHaveLength(0);
    const again = await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: ["Kenji"] });
    expect(again.json.skipped).toEqual([{ target: "Kenji", reason: "recent" }]);
    await db.execute(sql`update notifications set created_at = created_at - interval '25 hours'`);
    expect((await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: ["Kenji"] })).json.created).toBe(1);
  });
});

describe("lien par e-mail", () => {
  for (const mode of MODES) {
    it(`adresse sans compte : e-mail, page publique, inscription, rattachement, acceptation (${mode})`, async () => {
      const { damien, s, e } = await setup({ admission: "invite_only" });
      const send = vi.spyOn(mail, "send");
      const sent = await req(damien, "POST", `/events/${e.id}/invitations`, { emails: ["Sarah@Exemple.test"] }, mode);
      expect(sent.json.created).toBe(1);
      const [row] = await db.select().from(eventInvitations).where(eq(eventInvitations.eventId, e.id));
      expect(row?.email).toBe("sarah@exemple.test");
      await new Promise((r) => setTimeout(r, 50));
      const out = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.to, "sarah@exemple.test") });
      expect(out?.template).toBe("event_invitation");
      // La personne n'a pas de compte : le pied ne dit pas le contraire (relecture du lot 56).
      const sentMail = send.mock.calls.find(([template]) => template === "event_invitation")?.[2];
      send.mockRestore();
      expect(sentMail?.html).toContain("Tu reçois cet e-mail parce qu'on t'a invité sur Orasso.");
      expect(sentMail?.html).not.toContain("parce que tu as un compte");
      expect(sentMail?.text).not.toContain("parce que tu as un compte");

      const pub = await req(null, "GET", `/invitation-evenement/${row!.token}`);
      expect(pub.status).toBe(200);
      expect(pub.json).toMatchObject({ status: "pending", invitedBy: s.name, mine: false, invitationId: null });
      expect(pub.json.event.privateEvent).toBe(true);
      expect(JSON.stringify(pub.json)).not.toContain("sarah@");
      expect((await req(null, "GET", "/invitation-evenement/introuvable-introuvable-00")).status).toBe(404);

      // Un autre compte connecté ne peut pas le prendre.
      const other = await signUp("Autre");
      expect((await req(other, "POST", `/invitation-evenement/${row!.token}/claim`, undefined, mode)).status).toBe(403);
      expect((await req(other, "GET", `/events/by-slug/${e.slug}`, undefined, mode)).status).toBe(403);

      // Inscription avec la même adresse (casse différente) : rattachée.
      const sarah = await signUp("Sarah");
      await db.execute(sql`update "user" set email = 'sarah@exemple.test' where id = ${sarah.id}`);
      // Adresse pas encore confirmée : rien (relecture) ; le lien reçu la confirme et rattache l'invitation.
      expect((await req(sarah, "GET", `/events/by-slug/${e.slug}`, undefined, mode)).status).toBe(403);
      const claimed = await req(sarah, "POST", `/invitation-evenement/${row!.token}/claim`, undefined, mode);
      expect(claimed.status).toBe(200);
      expect((await db.query.user.findFirst({ where: eq(user.id, sarah.id) }))?.emailVerified).toBe(true);
      expect((await req(sarah, "GET", `/events/by-slug/${e.slug}`, undefined, mode)).status).toBe(200);
      expect(claimed.json.status).toBe("pending");
      const car = await createVehicle(sarah.id, ref);
      const ok = await req(sarah, "POST", `/event-invitations/${claimed.json.id}/accept`, { vehicleId: car.id }, mode);
      expect(ok.json.outcome).toBe("accepted");
      expect((await db.query.eventInvitations.findFirst({ where: eq(eventInvitations.id, row!.id) }))?.userId).toBe(
        sarah.id,
      );
    });
  }

  it("dédoublonnage des adresses ; limite quotidienne d'e-mails et d'invitations par structure", async () => {
    const { damien, s, e } = await setup();
    const first = await req(damien, "POST", `/events/${e.id}/invitations`, {
      emails: ["a@exemple.test", "A@exemple.test"],
    });
    expect(first.json.created).toBe(1);
    expect(
      (await req(damien, "POST", `/events/${e.id}/invitations`, { emails: ["a@exemple.test"] })).json.skipped,
    ).toEqual([{ target: "a@exemple.test", reason: "already_invited" }]);
    const emails = Array.from({ length: 50 }, (_, i) => `n${i}@exemple.test`);
    const tooMany = await req(damien, "POST", `/events/${e.id}/invitations`, { emails });
    expect(tooMany.status).toBe(429);
    // Limite toutes cibles confondues (insérées directement : la limite est comptée en base).
    const other = await createEvent(s.id, { startsAt: paris(10, 25, 18), endsAt: paris(10, 25, 22) });
    await db.insert(eventInvitations).values(
      Array.from({ length: INVITATIONS_PER_STRUCTURE_PER_DAY }, (_, i) => ({
        eventId: other.id,
        email: `bulk${i}@exemple.test`,
        token: `jeton-de-test-${i}-${"x".repeat(12)}`,
        createdAt: clock.now,
      })),
    );
    const kenji = await signUp("Kenji");
    const res = await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: [kenji.pseudo] });
    expect(res.status).toBe(429);
    clock.advance(25 * HOUR);
    expect((await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: [kenji.pseudo] })).json.created).toBe(
      1,
    );
  });
});

describe("édition précédente", () => {
  it("from-event : les retenus de l'édition passée, sans doublon, ni bannis, ni véhicules vendus", async () => {
    const { damien, s, e } = await setup();
    const past = await createEvent(s.id, { startsAt: paris(9, 1, 10), endsAt: paris(9, 1, 18) });
    const users = [await signUp("Un"), await signUp("Deux"), await signUp("Trois")];
    const cars = [];
    for (const u of users) cars.push(await createVehicle(u.id, ref));
    const second = await createVehicle(users[0]!.id, ref);
    for (const [i, car] of [...cars, second].entries()) {
      await db.insert(applications).values({
        eventId: past.id,
        userId: car.ownerId,
        vehicleId: car.id,
        status: i === 2 ? "refused" : "accepted",
        rulesAcceptedAt: paris(8, 1, 10),
        followStructure: false,
      });
    }
    const already = await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: [users[1]!.pseudo] });
    expect(already.json.created).toBe(1);
    const res = await req(damien, "POST", `/events/${e.id}/invitations/from-event`, { sourceEventId: past.id });
    expect(res.status).toBe(201);
    expect(res.json.created).toBe(1);
    expect(res.json.skipped).toEqual([{ target: expect.any(String), reason: "already_invited" }]);
    const row = await invitationOf(e.id, users[0]!.id);
    expect(row).toMatchObject({ vehicleId: cars[0]!.id, sourceEventId: past.id });
    // Rejoué : aucun doublon.
    const again = await req(damien, "POST", `/events/${e.id}/invitations/from-event`, { sourceEventId: past.id });
    expect(again.json.created).toBe(0);
    // Éditions proposées et véhicules à inviter.
    const sources = await req(damien, "GET", `/events/${e.id}/invitations/sources`);
    expect(sources.json).toEqual([expect.objectContaining({ id: past.id, acceptedCount: 3 })]);
    const candidates = await req(damien, "GET", `/events/${e.id}/invitations/candidates`);
    expect(candidates.json.map((c: { vehicleId: string }) => c.vehicleId).sort()).toEqual(
      [cars[0]!.id, cars[1]!.id, second.id].sort(),
    );
    // Une édition d'une autre structure : introuvable.
    const otherOwner = await signUp("Ailleurs", { twoFactor: true });
    const otherStructure = await createStructure(otherOwner.id);
    const foreign = await createEvent(otherStructure.id, { startsAt: paris(9, 2, 10), endsAt: paris(9, 2, 18) });
    expect(
      (await req(damien, "POST", `/events/${e.id}/invitations/from-event`, { sourceEventId: foreign.id })).status,
    ).toBe(404);
  });
});

describe("droits et IDOR", () => {
  for (const mode of MODES) {
    it(`seuls propriétaire et co-organisateurs actifs (2FA de session) invitent ; l'invitation n'est qu'à son destinataire (${mode})`, async () => {
      const { damien, s, e } = await setup();
      const staff = await signUp("Staffeur", { twoFactor: true });
      await addMember(s.id, staff.id, "staff", ["scan"]);
      const coorg = await signUp("Coorg");
      await addMember(s.id, coorg.id, "co_organizer");
      const admin = await signUp("Admin", { twoFactor: true, role: "super_admin" });
      const kenji = await signUp("Kenji");
      const body = { pseudos: ["Kenji"] };
      expect((await req(staff, "POST", `/events/${e.id}/invitations`, body, mode)).status).toBe(403);
      expect((await req(coorg, "POST", `/events/${e.id}/invitations`, body, mode)).json.error.code).toBe(
        "two_factor_required",
      );
      expect((await req(admin, "POST", `/events/${e.id}/invitations`, body, mode)).status).toBe(403);
      expect((await req(kenji, "GET", `/events/${e.id}/invitations`, undefined, mode)).status).toBe(403);
      expect((await req(null, "POST", `/events/${e.id}/invitations`, body, mode)).status).toBe(401);
      expect((await req(damien, "POST", `/events/${e.id}/invitations`, body, mode)).status).toBe(201);

      const inv = await invitationOf(e.id, kenji.id);
      const nina = await signUp("Nina");
      expect((await req(nina, "POST", `/event-invitations/${inv!.id}/accept`, {}, mode)).status).toBe(404);
      expect((await req(nina, "POST", `/event-invitations/${inv!.id}/decline`, undefined, mode)).status).toBe(404);
      // Retrait depuis un autre événement : introuvable.
      const other = await createEvent(s.id, { startsAt: paris(10, 25, 18), endsAt: paris(10, 25, 22) });
      expect((await req(damien, "DELETE", `/events/${other.id}/invitations/${inv!.id}`, undefined, mode)).status).toBe(
        404,
      );
      // Structure suspendue : plus d'invitation.
      await db.execute(sql`update structures set verification = 'suspended' where id = ${s.id}`);
      expect((await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: ["Nina"] }, mode)).status).toBe(403);
    });
  }

  it("bannis et soi-même ignorés ; brouillon refusé", async () => {
    const { damien, s, e } = await setup();
    const kenji = await signUp("Kenji");
    await db.execute(sql`insert into structure_bans (structure_id, user_id) values (${s.id}, ${kenji.id})`);
    const res = await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: ["Kenji", "Damien", "Personne"] });
    expect(res.json.created).toBe(0);
    expect(res.json.skipped.map((x: { reason: string }) => x.reason).sort()).toEqual(["banned", "self", "unknown"]);
    const draft = await createEvent(s.id, { status: "draft", startsAt: paris(10, 25, 18), endsAt: paris(10, 25, 22) });
    expect((await req(damien, "POST", `/events/${draft.id}/invitations`, { pseudos: ["Kenji"] })).status).toBe(409);
  });
});

describe("événement privé sur invitation", () => {
  for (const mode of MODES) {
    it(`invisible pour un non-invité, visible pour l'invité ; candidature libre refusée (${mode})`, async () => {
      const { damien, s, e } = await setup({ admission: "invite_only", capacity: 20 });
      const kenji = await signUp("Kenji");
      const intrus = await signUp("Intrus");
      const car = await createVehicle(intrus.id, ref);

      const list = await req(intrus, "GET", "/events", undefined, mode);
      expect(list.json.items).toHaveLength(0);
      expect((await req(null, "GET", `/events?structureId=${s.id}`)).json.items).toHaveLength(0);
      expect((await req(null, "GET", "/search?q=Rassemblement")).json.events).toHaveLength(0);
      const structuresList = await req(null, "GET", "/structures");
      expect(structuresList.json.items[0].upcomingCount).toBe(0);

      const page = await req(intrus, "GET", `/events/by-slug/${e.slug}`, undefined, mode);
      expect(page.status).toBe(403);
      expect(page.json.error.code).toBe("invite_only");
      expect(JSON.stringify(page.json)).not.toContain(e.title);
      expect((await req(null, "GET", `/events/by-slug/${e.slug}`)).status).toBe(403);
      for (const sub of ["reviews", "tickets", "announcements"]) {
        expect([403, 404]).toContain(
          (await req(intrus, "GET", `/events/by-slug/${e.slug}/${sub}`, undefined, mode)).status,
        );
      }
      expect((await req(null, "GET", `/events/by-slug/${e.slug}/weather`)).json).toBeNull();

      const apply = await req(
        intrus,
        "POST",
        `/events/${e.id}/applications`,
        {
          vehicleIds: [car.id],
          rulesAccepted: true,
          followStructure: false,
        },
        mode,
      );
      expect(apply.status).toBe(403);
      expect(apply.json.error.code).toBe("invitation_required");

      await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: ["Kenji"] }, mode);
      expect((await req(kenji, "GET", `/events/by-slug/${e.slug}`, undefined, mode)).status).toBe(200);
      expect((await req(damien, "GET", `/events/by-slug/${e.slug}`, undefined, mode)).status).toBe(200);
      // L'invité ne voit pas la liste des invitations.
      expect((await req(kenji, "GET", `/events/${e.id}/invitations`, undefined, mode)).status).toBe(403);
      // Refuser fait perdre l'accès à la page.
      const inv = await invitationOf(e.id, kenji.id);
      await req(kenji, "POST", `/event-invitations/${inv!.id}/decline`, undefined, mode);
      expect((await req(kenji, "GET", `/events/by-slug/${e.slug}`, undefined, mode)).status).toBe(403);
    });
  }

  it("Journal des amis : un ami retenu sur un événement privé n'apparaît pas", async () => {
    const { damien, e } = await setup({ admission: "invite_only" });
    const kenji = await signUp("Kenji");
    const car = await createVehicle(kenji.id, ref);
    await req(damien, "POST", `/events/${e.id}/invitations`, { vehicleIds: [car.id] });
    const inv = await invitationOf(e.id, kenji.id);
    expect((await req(kenji, "POST", `/event-invitations/${inv!.id}/accept`, {})).json.outcome).toBe("accepted");
    const going = await db.query.notifications.findMany({ where: eq(notifications.type, "friend_going_event") });
    expect(going).toHaveLength(0);
  });
});

describe("hauts grades", () => {
  const apply = (u: TestUser, eventId: string, vehicleId: string, mode: Mode = "cookie") =>
    req(
      u,
      "POST",
      `/events/${eventId}/applications`,
      { vehicleIds: [vehicleId], rulesAccepted: true, followStructure: false },
      mode,
    );

  for (const mode of MODES) {
    it(`avant-première : abonné 24 h, Circuit 48 h, abonné Circuit 48 h (pas 72) (${mode})`, async () => {
      const { s, e } = await setup({
        registrationsOpenAt: paris(10, 10, 10),
        previewHours: 24,
        highGradePreviewHours: 48,
        highGradeMin: "circuit",
      });
      const abonne = await signUp("Abonne");
      const circuit = await signUp("Circuit");
      const both = await signUp("Both");
      const sport = await signUp("Sport");
      await setGrade(circuit.id, "circuit");
      await setGrade(both.id, "legende");
      await setGrade(sport.id, "sport");
      for (const u of [abonne, both])
        await db.insert(structureFollows).values({ structureId: s.id, userId: u.id, source: "application" });
      const car = async (u: TestUser) => (await createVehicle(u.id, ref)).id;
      const cars = {
        abonne: await car(abonne),
        circuit: await car(circuit),
        both: await car(both),
        sport: await car(sport),
      };

      clock.set(paris(10, 8, 9)); // H−49
      expect((await apply(both, e.id, cars.both, mode)).status).toBe(409);
      clock.set(paris(10, 8, 11)); // H−47
      expect((await apply(circuit, e.id, cars.circuit, mode)).status).toBe(201);
      expect((await apply(both, e.id, cars.both, mode)).status).toBe(201);
      const early = await apply(abonne, e.id, cars.abonne, mode);
      expect(early.status).toBe(409);
      expect(early.json.error.details.opensAt).toBe(paris(10, 9, 10).toISOString());
      expect((await apply(sport, e.id, cars.sport, mode)).status).toBe(409);
      clock.set(paris(10, 9, 11)); // H−23
      expect((await apply(abonne, e.id, cars.abonne, mode)).status).toBe(201);
      expect((await apply(sport, e.id, cars.sport, mode)).status).toBe(409);
      // Page : ouverture pour moi.
      const page = await req(circuit, "GET", `/events/by-slug/${e.slug}`, undefined, mode);
      expect(page.json.registrationOpensAtForMe).toBe(paris(10, 8, 10).toISOString());
      expect(page.json).toMatchObject({ highGradePreviewHours: 48, highGradeMin: "circuit" });
    });
  }

  it("notification d'avant-première aux hauts grades dans leur rayon, une seule fois", async () => {
    const { s, e } = await setup({
      registrationsOpenAt: paris(10, 10, 10),
      highGradePreviewHours: 48,
      lat: 42.7,
      lng: 2.9,
    });
    const near = await signUp("Proche");
    const far = await signUp("Loin");
    const low = await signUp("Bas");
    await setGrade(near.id, "circuit");
    await setGrade(far.id, "legende");
    await db
      .update(profiles)
      .set({ departments: ["66"] })
      .where(eq(profiles.userId, near.id));
    await db
      .update(profiles)
      .set({ departments: ["66"] })
      .where(eq(profiles.userId, low.id));
    await db
      .update(profiles)
      .set({ departments: ["59"] })
      .where(eq(profiles.userId, far.id));
    await db.insert(structureFollows).values({ structureId: s.id, userId: near.id, source: "application" });
    const at = paris(10, 8, 10).toISOString();
    expect(await highGradePreview.notify({ eventId: e.id, at })).toBe(1);
    expect(await highGradePreview.notify({ eventId: e.id, at })).toBe(0);
    const n = await db.query.notifications.findMany({ where: eq(notifications.type, "preview_open") });
    expect(n.map((x) => x.userId)).toEqual([near.id]);
  });

  it("liste d'attente prioritaire : un Légende passe devant trois Rodage, pas devant un autre Légende arrivé avant", async () => {
    const { damien, e } = await setup({ capacity: 1, highGradePriority: true, highGradeMin: "circuit" });
    const winner = await signUp("Retenu");
    const rodages = [await signUp("R1"), await signUp("R2"), await signUp("R3")];
    const legende1 = await signUp("L1");
    const legende2 = await signUp("L2");
    await setGrade(legende1.id, "legende");
    await setGrade(legende2.id, "legende");
    const appOf = async (u: TestUser) => {
      const v = await createVehicle(u.id, ref);
      const res = await apply(u, e.id, v.id);
      expect(res.status).toBe(201);
      return res.json[0].id as string;
    };
    const decide = (id: string, decision: "accept" | "waitlist") =>
      req(damien, "POST", `/events/${e.id}/applications/${id}/decide`, { decision });
    expect((await decide(await appOf(winner), "accept")).status).toBe(200);
    for (const r of rodages) expect((await decide(await appOf(r), "waitlist")).status).toBe(200);
    expect((await decide(await appOf(legende1), "waitlist")).status).toBe(200);
    expect((await decide(await appOf(legende2), "waitlist")).status).toBe(200);
    const order = await db
      .select({ userId: applications.userId })
      .from(applications)
      .where(and(eq(applications.eventId, e.id), eq(applications.status, "waitlisted")))
      .orderBy(applications.waitlistRank);
    expect(order.map((o) => o.userId)).toEqual([legende1.id, legende2.id, ...rodages.map((r) => r.id)]);
  });

  it("sans priorité activée : ordre d'arrivée inchangé", async () => {
    const { damien, e } = await setup({ capacity: 1 });
    const users = [await signUp("A1"), await signUp("A2"), await signUp("Leg")];
    await setGrade(users[2]!.id, "legende");
    const ids: string[] = [];
    for (const u of users) {
      const v = await createVehicle(u.id, ref);
      ids.push((await apply(u, e.id, v.id)).json[0].id);
    }
    await req(damien, "POST", `/events/${e.id}/applications/${ids[0]}/decide`, { decision: "accept" });
    await req(damien, "POST", `/events/${e.id}/applications/${ids[1]}/decide`, { decision: "waitlist" });
    await req(damien, "POST", `/events/${e.id}/applications/${ids[2]}/decide`, { decision: "waitlist" });
    const order = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.eventId, e.id), eq(applications.status, "waitlisted")))
      .orderBy(applications.waitlistRank);
    expect(order.map((o) => o.id)).toEqual([ids[1], ids[2]]);
  });
});

describe("concurrence et anonymisation", () => {
  it("deux acceptations simultanées : une seule candidature", async () => {
    const { damien, e } = await setup();
    const kenji = await signUp("Kenji");
    const car = await createVehicle(kenji.id, ref);
    await req(damien, "POST", `/events/${e.id}/invitations`, { vehicleIds: [car.id] });
    const inv = await invitationOf(e.id, kenji.id);
    const results = await Promise.all([
      req(kenji, "POST", `/event-invitations/${inv!.id}/accept`, {}),
      req(kenji, "POST", `/event-invitations/${inv!.id}/accept`, {}, "bearer"),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const apps = await db.query.applications.findMany({ where: eq(applications.eventId, e.id) });
    expect(apps).toHaveLength(1);
  });

  it("suppression du compte : invitations reçues expirées, adresse effacée ; envoyées sans auteur ni message", async () => {
    const { damien, e } = await setup();
    const kenji = await signUp("Kenji");
    await req(damien, "POST", `/events/${e.id}/invitations`, {
      pseudos: ["Kenji"],
      emails: [kenji.email],
      message: "Salut",
    });
    await accountService.anonymize(kenji.id, null);
    const rows = await db.select().from(eventInvitations).where(eq(eventInvitations.eventId, e.id));
    expect(rows.every((r) => r.status === "expired" && r.email === null)).toBe(true);
    await accountService.anonymize(damien.id, null);
    const after = await db.select().from(eventInvitations).where(eq(eventInvitations.eventId, e.id));
    expect(after.every((r) => r.createdBy === null && r.message === null)).toBe(true);
  });
});

describe("critère de fin", () => {
  it("événement privé : Kenji (véhicule) et une adresse e-mail invités, acceptés ; un non-invité ne voit rien", async () => {
    const { damien, e } = await setup({ admission: "invite_only", capacity: 30 });
    const kenji = await signUp("Kenji");
    const car = await createVehicle(kenji.id, ref);
    const res = await req(damien, "POST", `/events/${e.id}/invitations`, {
      vehicleIds: [car.id],
      emails: ["nouvelle@exemple.test"],
    });
    expect(res.json.created).toBe(2);
    const mine = await req(kenji, "GET", "/me/event-invitations", undefined, "bearer");
    expect(mine.json[0].event.privateEvent).toBe(true);
    const accepted = await req(kenji, "POST", `/event-invitations/${mine.json[0].id}/accept`, {}, "bearer");
    expect(accepted.json.outcome).toBe("accepted");
    const access = await req(kenji, "GET", "/me/applications", undefined, "bearer");
    expect(JSON.stringify(access.json)).toContain(e.title);
    const pass = await req(kenji, "GET", `/applications/${accepted.json.applicationId}/pass`, undefined, "bearer");
    expect(pass.status).toBe(200);

    const intrus = await signUp("Intrus");
    expect((await req(intrus, "GET", "/events")).json.items).toHaveLength(0);
    expect((await req(intrus, "GET", `/events/by-slug/${e.slug}`)).status).toBe(403);

    const [byEmail] = await db
      .select()
      .from(eventInvitations)
      .where(and(eq(eventInvitations.eventId, e.id), eq(eventInvitations.email, "nouvelle@exemple.test")));
    const nouvelle = await signUp("Nouvelle");
    await db.execute(sql`update "user" set email = 'nouvelle@exemple.test' where id = ${nouvelle.id}`);
    expect((await req(nouvelle, "GET", "/me/event-invitations")).json).toHaveLength(0);
    const claimed = await req(nouvelle, "POST", `/invitation-evenement/${byEmail!.token}/claim`);
    expect((await req(nouvelle, "GET", "/me/event-invitations")).json).toHaveLength(1);
    const v = await createVehicle(nouvelle.id, ref);
    expect(
      (await req(nouvelle, "POST", `/event-invitations/${claimed.json.id}/accept`, { vehicleId: v.id })).json.outcome,
    ).toBe("accepted");
  });
});

describe("corrections de la relecture", () => {
  const verify = (u: TestUser) => db.update(user).set({ emailVerified: true }).where(eq(user.id, u.id));

  for (const mode of MODES) {
    it(`adresse non confirmée : invitation par e-mail invisible et inutilisable, sauf par le lien (${mode})`, async () => {
      const { damien, e } = await setup({ admission: "invite_only" });
      const jean = await signUp("Jean");
      const car = await createVehicle(jean.id, ref);
      expect(
        (await req(damien, "POST", `/events/${e.id}/invitations`, { emails: [jean.email] }, mode)).json.created,
      ).toBe(1);
      const [row] = await db.select().from(eventInvitations).where(eq(eventInvitations.eventId, e.id));
      expect((await req(jean, "GET", "/me/event-invitations", undefined, mode)).json).toHaveLength(0);
      expect((await req(jean, "GET", "/me/inbox/summary", undefined, mode)).json.requests.eventInvitation).toBe(0);
      expect((await req(jean, "GET", `/events/by-slug/${e.slug}`, undefined, mode)).status).toBe(403);
      expect(
        (await req(jean, "POST", `/event-invitations/${row!.id}/accept`, { vehicleId: car.id }, mode)).status,
      ).toBe(404);
      expect((await req(jean, "POST", `/event-invitations/${row!.id}/decline`, undefined, mode)).status).toBe(404);
      // Adresse confirmée : visible.
      await verify(jean);
      expect((await req(jean, "GET", "/me/event-invitations", undefined, mode)).json).toHaveLength(1);
      expect((await req(jean, "GET", `/events/by-slug/${e.slug}`, undefined, mode)).status).toBe(200);
    });
  }

  it("quotas d'e-mails : un retrait ne libère rien, garde de 24 h par adresse, plafond pour tout Orasso", async () => {
    const { damien, s, e } = await setup();
    await req(damien, "POST", `/events/${e.id}/invitations`, { emails: ["x@exemple.test"] });
    const [row] = await db.select().from(eventInvitations).where(eq(eventInvitations.eventId, e.id));
    expect((await req(damien, "DELETE", `/events/${e.id}/invitations/${row!.id}`)).status).toBe(204);
    expect((await db.query.eventInvitations.findFirst({ where: eq(eventInvitations.id, row!.id) }))?.status).toBe(
      "withdrawn",
    );
    const again = await req(damien, "POST", `/events/${e.id}/invitations`, { emails: ["x@exemple.test"] });
    expect(again.json.skipped).toEqual([{ target: "x@exemple.test", reason: "recent" }]);
    // Plafond de tout Orasso : 100 invitations par e-mail en 24 h (une autre structure les a déjà).
    const other = await signUp("Autre", { twoFactor: true });
    const os = await createStructure(other.id);
    const oe = await createEvent(os.id, { startsAt: paris(10, 25, 18), endsAt: paris(10, 25, 22) });
    await db.insert(eventInvitations).values(
      Array.from({ length: 99 }, (_, i) => ({
        eventId: oe.id,
        email: `glob${i}@exemple.test`,
        token: `jeton-global-${i}-${"y".repeat(12)}`,
        createdAt: clock.now,
      })),
    );
    expect(s.id).not.toBe(os.id);
    const res = await req(damien, "POST", `/events/${e.id}/invitations`, { emails: ["z@exemple.test"] });
    expect(res.status).toBe(429);
    // Une invitation par e-mail rattachée puis acceptée compte toujours.
    clock.advance(25 * 3_600_000);
    expect(
      (await req(damien, "POST", `/events/${e.id}/invitations`, { emails: ["z@exemple.test"] })).json.created,
    ).toBe(1);
  });

  it("invité par pseudo et par e-mail : refuser l'invitation par e-mail répond 204 (plus de 500)", async () => {
    const { damien, e } = await setup();
    const kenji = await signUp("Kenji");
    await verify(kenji);
    await req(damien, "POST", `/events/${e.id}/invitations`, { pseudos: ["Kenji"], emails: [kenji.email] });
    const byMail = await db.query.eventInvitations.findFirst({
      where: and(eq(eventInvitations.eventId, e.id), eq(eventInvitations.email, kenji.email.toLowerCase())),
    });
    const res = await req(kenji, "POST", `/event-invitations/${byMail!.id}/decline`);
    expect(res.status).toBe(204);
    expect((await db.query.eventInvitations.findFirst({ where: eq(eventInvitations.id, byMail!.id) }))?.status).toBe(
      "expired",
    );
    expect((await invitationOf(e.id, kenji.id))?.status).toBe("pending");
  });

  it("« Inviter les retenus » au-delà de la limite : envoi partiel, le reste signalé", async () => {
    const { damien, s, e } = await setup();
    const past = await createEvent(s.id, { startsAt: paris(9, 1, 10), endsAt: paris(9, 1, 18) });
    for (const name of ["Un", "Deux", "Trois"]) {
      const u = await signUp(name);
      const car = await createVehicle(u.id, ref);
      await db.insert(applications).values({
        eventId: past.id,
        userId: u.id,
        vehicleId: car.id,
        status: "accepted",
        rulesAcceptedAt: paris(8, 1, 10),
        followStructure: false,
      });
    }
    const other = await createEvent(s.id, { startsAt: paris(10, 25, 18), endsAt: paris(10, 25, 22) });
    await db.insert(eventInvitations).values(
      Array.from({ length: INVITATIONS_PER_STRUCTURE_PER_DAY - 1 }, (_, i) => ({
        eventId: other.id,
        email: null,
        userId: damien.id,
        token: `jeton-quota-${i}-${"z".repeat(12)}`,
        status: "expired" as const,
        createdAt: clock.now,
      })),
    );
    const res = await req(damien, "POST", `/events/${e.id}/invitations/from-event`, { sourceEventId: past.id });
    expect(res.status).toBe(201);
    expect(res.json.created).toBe(1);
    expect(res.json.skipped.map((x: { reason: string }) => x.reason)).toEqual(["quota", "quota"]);
  });

  it("billets et inscription en crew d'un événement privé : 403 pour un non-invité ; lien retiré : rien", async () => {
    const { damien, e } = await setup({ admission: "invite_only", publicAccess: "free_reservation" });
    const intrus = await signUp("Intrus");
    expect((await req(intrus, "POST", `/events/${e.id}/tickets/reserve`, { quantity: 1 })).status).toBe(403);
    expect((await req(intrus, "POST", `/events/${e.id}/tickets/checkout`, { quantity: 1 })).status).toBe(403);
    const crew = await req(intrus, "POST", "/crews", { name: "Crew privé test", department: "66" });
    expect((await req(intrus, "GET", `/events/${e.id}/crew-applications/options?crewId=${crew.json.id}`)).status).toBe(
      403,
    );
    await req(damien, "POST", `/events/${e.id}/invitations`, { emails: ["lien@exemple.test"] });
    const [row] = await db.select().from(eventInvitations).where(eq(eventInvitations.eventId, e.id));
    expect((await req(null, "GET", `/invitation-evenement/${row!.token}`)).status).toBe(200);
    // E-mail parti (transport journal) : `sent_at` posé après l'envoi.
    expect(
      (await db.query.eventInvitations.findFirst({ where: eq(eventInvitations.id, row!.id) }))?.sentAt,
    ).not.toBeNull();
    await req(damien, "DELETE", `/events/${e.id}/invitations/${row!.id}`);
    expect((await req(null, "GET", `/invitation-evenement/${row!.token}`)).status).toBe(404);
  });

  it("candidature refusée : plus d'accès à la page de l'événement privé", async () => {
    const { damien, e } = await setup({ admission: "invite_only" });
    const kenji = await signUp("Kenji");
    const car = await createVehicle(kenji.id, ref);
    await req(damien, "POST", `/events/${e.id}/invitations`, { vehicleIds: [car.id] });
    const inv = await invitationOf(e.id, kenji.id);
    const ok = await req(kenji, "POST", `/event-invitations/${inv!.id}/accept`, {});
    expect(
      (
        await req(damien, "POST", `/events/${e.id}/applications/${ok.json.applicationId}/decide`, {
          decision: "refuse",
          reasons: ["full"],
        })
      ).status,
    ).toBe(200);
    expect((await req(kenji, "GET", `/events/by-slug/${e.slug}`)).status).toBe(403);
  });

  it("compte suspendu : ne peut pas accepter", async () => {
    const { damien, e } = await setup();
    const kenji = await signUp("Kenji");
    const car = await createVehicle(kenji.id, ref);
    await req(damien, "POST", `/events/${e.id}/invitations`, { vehicleIds: [car.id] });
    const inv = await invitationOf(e.id, kenji.id);
    await db
      .update(profiles)
      .set({ suspendedUntil: paris(12, 1, 10) })
      .where(eq(profiles.userId, kenji.id));
    expect((await req(kenji, "POST", `/event-invitations/${inv!.id}/accept`, {})).status).toBe(403);
  });
});
