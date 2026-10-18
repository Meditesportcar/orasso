// Crews et inscription en crew (lot 19) : création, limites, demandes, invitations, départs, dissolution, accès
// (membres seulement pour la liste et la discussion), logo, discussion synchronisée, inscription en crew (vérifications
// par membre, confirmation, refus, expiration à 72 h plafonnée au verrouillage), tri, capacité, anonymisation,
// concurrence, et le scénario du critère de fin. Routes jouées en cookie ET en jeton porteur.
import { randomUUID } from "node:crypto";
import { fromWallTime, HOUR } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
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
  applications,
  conversationParticipants,
  crewMembers,
  crews,
  type events,
  messages,
  notifications,
  profiles,
  structureBans,
  vehicles,
} from "../../db/schema";
import { accountService } from "../account/service";
import { crewRegistrationService } from "./registration";

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

async function upload(u: TestUser, purpose: string, mode: Mode = "cookie") {
  const data = await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 30, g: 30, b: 30 } } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(data)], "logo.jpg", { type: "image/jpeg" }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: {
      origin: ORIGIN,
      ...(mode === "cookie" ? { cookie: u.cookie } : { authorization: `Bearer ${bearerOf(u.cookie)}` }),
    },
    body: form,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as { key: string; width: number } };
}

let nameCounter = 0;
async function newCrew(leader: TestUser, mode: Mode = "cookie") {
  const res = await req(leader, "POST", "/crews", { name: `Crew test ${++nameCounter}`, department: "66" }, mode);
  expect(res.status).toBe(201);
  return res.json as { id: string; slug: string; conversationId: string };
}

/** Fait entrer `member` dans le crew (demande puis acceptation du chef). */
async function addToCrew(crewId: string, leader: TestUser, member: TestUser) {
  expect((await req(member, "POST", `/crews/${crewId}/requests`, { message: null })).status).toBe(201);
  expect((await req(leader, "POST", `/crews/${crewId}/requests/${member.id}/accept`)).status).toBe(204);
}

const jobsNamed = (name: string) => clock.jobs.jobs.filter((j) => j.name === name);

/** Vieillit les notifications existantes (leur date vient de l'horloge de la base, pas de l'horloge simulée). */
async function ageNotifications(hours: number) {
  await db.execute(sql`update notifications set created_at = created_at - make_interval(hours => ${hours})`);
}

describe("crews : création, fiche, limites", () => {
  for (const mode of MODES) {
    it(`création, fiche publique sans membres ni discussion, liste des membres réservée (${mode})`, async () => {
      const kenji = await signUp("Kenji");
      const outsider = await signUp("Paul");
      const created = await req(
        kenji,
        "POST",
        "/crews",
        { name: "Roussillon  Drift", description: "Glisse", department: "66" },
        mode,
      );
      expect(created.status).toBe(201);
      expect(created.json).toMatchObject({
        name: "Roussillon Drift",
        slug: "roussillon-drift",
        membersCount: 1,
        viewerState: "leader",
        pendingRequests: 0,
      });
      expect(created.json.conversationId).toBeTruthy();

      const seen = await req(outsider, "GET", `/crews/by-slug/roussillon-drift`, undefined, mode);
      expect(seen.status).toBe(200);
      expect(seen.json).toMatchObject({ name: "Roussillon Drift", membersCount: 1, viewerState: "none" });
      expect(seen.json.leader.pseudo).toBe(kenji.pseudo);
      expect(seen.json.conversationId).toBeNull();
      expect(seen.json.pendingRequests).toBeNull();
      expect(JSON.stringify(seen.json)).not.toContain(kenji.id);
      expect((await req(outsider, "GET", `/crews/${created.json.id}/members`, undefined, mode)).status).toBe(403);
      const conv = created.json.conversationId;
      expect((await req(outsider, "GET", `/conversations/${conv}/messages`, undefined, mode)).status).toBe(403);
      expect((await req(kenji, "GET", `/crews/${created.json.id}/members`, undefined, mode)).json).toHaveLength(1);
      // Non connecté : rien.
      expect((await req(null, "GET", `/crews/by-slug/roussillon-drift`)).status).toBe(401);
      expect((await req(null, "GET", `/crews/search?q=drift`)).status).toBe(401);
    });
  }

  it("nom unique sans casse, recherche par nom et département", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    await req(kenji, "POST", "/crews", { name: "Roussillon Drift", department: "66" });
    const dup = await req(lea, "POST", "/crews", { name: "roussillon drift", department: "11" });
    expect(dup.status).toBe(409);
    await req(lea, "POST", "/crews", { name: "Aude Classic", department: "11" });
    expect((await req(lea, "GET", "/crews/search?q=drift")).json.items.map((c: { name: string }) => c.name)).toEqual([
      "Roussillon Drift",
    ]);
    expect((await req(lea, "GET", "/crews/search?department=11")).json.items).toHaveLength(1);
    expect((await req(lea, "GET", "/crews/search?q=xyz")).json.items).toHaveLength(0);
  });

  it("limite de 5 crews par personne (création et arrivée), 3 créations par jour", async () => {
    const a = await signUp("Alice");
    for (let i = 0; i < 3; i++) await newCrew(a);
    expect((await req(a, "POST", "/crews", { name: "Quatrième", department: "66" })).status).toBe(429);
    clock.advance(25 * HOUR);
    await newCrew(a);
    await newCrew(a);
    clock.advance(25 * HOUR);
    const sixth = await req(a, "POST", "/crews", { name: "Sixième", department: "66" });
    expect(sixth.status).toBe(409);
    expect(sixth.json.error.details.reason).toBe("crews_per_person");
    const b = await signUp("Bruno");
    const other = await newCrew(b);
    expect((await req(b, "POST", `/crews/${other.id}/invitations`, { pseudo: a.pseudo })).status).toBe(201);
    const accept = await req(a, "POST", `/me/crew-invitations/${other.id}/accept`);
    expect(accept.status).toBe(409);
    expect(accept.json.error.details.reason).toBe("crews_per_person");
  });
});

describe("crews : demandes, invitations, départs", () => {
  for (const mode of MODES) {
    it(`demande acceptée : membre, discussion synchronisée, message d'information, compteurs (${mode})`, async () => {
      const kenji = await signUp("Kenji");
      const lea = await signUp("Lea");
      const crew = await newCrew(kenji, mode);
      const asked = await req(lea, "POST", `/crews/${crew.id}/requests`, { message: "Je peux venir ?" }, mode);
      expect(asked.status).toBe(201);
      expect(asked.json.viewerState).toBe("requested");
      expect((await req(lea, "POST", `/crews/${crew.id}/requests`, { message: null }, mode)).status).toBe(409);
      expect((await req(kenji, "GET", "/me/inbox/summary", undefined, mode)).json.requests.crew).toBe(1);
      const pending = await req(kenji, "GET", `/crews/${crew.id}/requests`, undefined, mode);
      expect(pending.json.requests[0]).toMatchObject({ message: "Je peux venir ?", person: { pseudo: lea.pseudo } });
      const inbox = await req(kenji, "GET", "/me/crew-requests", undefined, mode);
      expect(inbox.json[0]).toMatchObject({ kind: "request", person: { pseudo: lea.pseudo } });
      // Lea ne lit pas encore la discussion.
      expect((await req(lea, "GET", `/conversations/${crew.conversationId}`, undefined, mode)).status).toBe(403);

      expect((await req(kenji, "POST", `/crews/${crew.id}/requests/${lea.id}/accept`, undefined, mode)).status).toBe(
        204,
      );
      expect((await req(kenji, "GET", "/me/inbox/summary", undefined, mode)).json.requests.crew).toBe(0);
      const view = await req(lea, "GET", `/crews/${crew.id}`, undefined, mode);
      expect(view.json).toMatchObject({ viewerState: "member", membersCount: 2, conversationId: crew.conversationId });
      expect((await req(lea, "GET", `/crews/${crew.id}/members`, undefined, mode)).json).toHaveLength(2);
      const msgs = await req(lea, "GET", `/conversations/${crew.conversationId}/messages`, undefined, mode);
      expect(msgs.status).toBe(200);
      expect(msgs.json.items[0]).toMatchObject({ kind: "system", sender: null });
      expect(JSON.parse(msgs.json.items[0].body)).toMatchObject({ code: "crew_member_joined", pseudo: lea.pseudo });
      // Lea écrit dans la discussion.
      const sent = await req(
        lea,
        "POST",
        `/conversations/${crew.conversationId}/messages`,
        { clientId: randomUUID(), body: "Salut le crew" },
        mode,
      );
      expect(sent.status).toBe(201);
      const accepted = await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, lea.id), eq(notifications.type, "crew_request_accepted")),
      });
      expect(accepted).toBeTruthy();
    });
  }

  it("refus silencieux : la demande reste « envoyée » 30 jours ; garde de 24 h après annulation", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const crew = await newCrew(kenji);
    await req(nina, "POST", `/crews/${crew.id}/requests`, { message: null });
    expect((await req(kenji, "POST", `/crews/${crew.id}/requests/${nina.id}/decline`)).status).toBe(204);
    expect((await req(nina, "GET", `/crews/${crew.id}`)).json.viewerState).toBe("requested");
    const again = await req(nina, "POST", `/crews/${crew.id}/requests`, { message: null });
    expect(again.status).toBe(409);
    expect(again.json.error.details.reason).toBe("already_pending");
    expect(await db.query.notifications.findFirst({ where: eq(notifications.userId, nina.id) })).toBeUndefined();
    clock.advance(31 * 24 * HOUR);
    expect((await req(nina, "GET", `/crews/${crew.id}`)).json.viewerState).toBe("none");
    // La garde de 24 h se compte sur la date des notifications (horloge de la base) : la première a « 31 jours ».
    await ageNotifications(31 * 24);
    expect((await req(nina, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
    // Annuler puis redemander dans les 24 h : refusé (pas de harcèlement par retrait et recréation).
    expect((await req(nina, "DELETE", `/crews/${crew.id}/members/${nina.id}`)).status).toBe(204);
    expect((await req(nina, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(429);
  });

  it("invitation : acceptée, refusée (silencieux), annulée ; invitation croisée avec une demande = acceptation", async () => {
    const kenji = await signUp("Kenji");
    const [theo, julie, marc, sarah] = await Promise.all([
      signUp("Theo"),
      signUp("Julie"),
      signUp("Marc"),
      signUp("Sarah"),
    ]);
    const crew = await newCrew(kenji);
    expect((await req(kenji, "POST", `/crews/${crew.id}/invitations`, { pseudo: theo.pseudo })).json.status).toBe(
      "invited",
    );
    expect((await req(theo, "GET", "/me/inbox/summary")).json.requests.crew).toBe(1);
    expect((await req(theo, "GET", "/me/crew-requests")).json[0]).toMatchObject({
      kind: "invitation",
      person: { pseudo: kenji.pseudo },
    });
    expect((await req(theo, "POST", `/me/crew-invitations/${crew.id}/accept`)).json.viewerState).toBe("member");
    await req(kenji, "POST", `/crews/${crew.id}/invitations`, { pseudo: julie.pseudo });
    expect((await req(julie, "POST", `/me/crew-invitations/${crew.id}/decline`)).status).toBe(204);
    // Le chef ne réinvite pas avant 30 jours ; Julie peut demander elle-même.
    expect((await req(kenji, "POST", `/crews/${crew.id}/invitations`, { pseudo: julie.pseudo })).status).toBe(409);
    expect((await req(julie, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
    await req(kenji, "POST", `/crews/${crew.id}/invitations`, { pseudo: marc.pseudo });
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/members/${marc.id}`)).status).toBe(204);
    expect((await req(marc, "POST", `/me/crew-invitations/${crew.id}/accept`)).status).toBe(404);
    // Sarah demande, puis le chef l'invite : c'est une acceptation.
    await req(sarah, "POST", `/crews/${crew.id}/requests`, { message: null });
    expect((await req(kenji, "POST", `/crews/${crew.id}/invitations`, { pseudo: sarah.pseudo })).json.status).toBe(
      "active",
    );
    // Inconnu ou supprimé : 404.
    expect((await req(kenji, "POST", `/crews/${crew.id}/invitations`, { pseudo: "Personne_99" })).status).toBe(404);
  });

  it("départ, retrait, chef qui ne quitte pas, discussion fermée à qui part", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const nina = await signUp("Nina");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    await addToCrew(crew.id, kenji, nina);
    const leave = await req(kenji, "DELETE", `/crews/${crew.id}/members/${kenji.id}`);
    expect(leave.status).toBe(409);
    expect((await req(lea, "DELETE", `/crews/${crew.id}/members/${lea.id}`)).status).toBe(204);
    expect((await req(lea, "GET", `/conversations/${crew.conversationId}/messages`)).status).toBe(403);
    expect((await req(lea, "GET", `/crews/${crew.id}/members`)).status).toBe(403);
    const left = await db.query.conversationParticipants.findFirst({
      where: and(
        eq(conversationParticipants.conversationId, crew.conversationId),
        eq(conversationParticipants.userId, lea.id),
      ),
    });
    expect(left?.leftAt).toBeTruthy();
    // Un membre ne retire personne ; le chef retire Nina, qui ne redemande pas avant 30 jours.
    expect((await req(nina, "DELETE", `/crews/${crew.id}/members/${kenji.id}`)).status).toBe(403);
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/members/${nina.id}`)).status).toBe(204);
    expect((await req(nina, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(409);
    expect((await req(kenji, "GET", `/crews/${crew.id}`)).json.membersCount).toBe(1);
    // Lea (partie) peut redemander, mais pas dans les 24 h de sa première demande.
    expect((await req(lea, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(429);
    await ageNotifications(25);
    expect((await req(lea, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
  });

  it("accès réservé au chef : modifier, logo, inviter, accepter, dissoudre", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const paul = await signUp("Paul");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    await req(paul, "POST", `/crews/${crew.id}/requests`, { message: null });
    for (const u of [lea, paul]) {
      expect((await req(u, "PATCH", `/crews/${crew.id}`, { description: "Pirate" })).status).toBe(403);
      expect((await req(u, "POST", `/crews/${crew.id}/logo`, { key: null })).status).toBe(403);
      expect((await req(u, "POST", `/crews/${crew.id}/invitations`, { pseudo: "Kenji" })).status).toBe(403);
      expect((await req(u, "POST", `/crews/${crew.id}/requests/${paul.id}/accept`)).status).toBe(403);
      expect((await req(u, "GET", `/crews/${crew.id}/requests`)).status).toBe(403);
      expect((await req(u, "DELETE", `/crews/${crew.id}`)).status).toBe(403);
    }
    expect((await req(kenji, "PATCH", `/crews/${crew.id}`, { description: "Japonaises" })).json.description).toBe(
      "Japonaises",
    );
  });

  it("logo : clé de l'auteur, une seule utilisation, ancien logo effacé ; dissolution : discussion lisible seulement", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const paul = await signUp("Paul");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    const mine = await upload(kenji, "crew_logo", "bearer");
    expect(mine.status).toBe(201);
    expect(mine.json.width).toBe(512);
    const theirs = await upload(paul, "crew_logo");
    expect((await req(kenji, "POST", `/crews/${crew.id}/logo`, { key: theirs.json.key })).status).toBe(400);
    const set = await req(kenji, "POST", `/crews/${crew.id}/logo`, { key: mine.json.key }, "bearer");
    expect(set.json.logoUrl).toBe(`/api/files/${mine.json.key}`);
    expect((await req(kenji, "POST", `/crews/${crew.id}/logo`, { key: mine.json.key })).status).toBe(400);
    // Dissolution.
    expect((await req(kenji, "DELETE", `/crews/${crew.id}`)).status).toBe(204);
    const row = await db.query.crews.findFirst({ where: eq(crews.id, crew.id) });
    expect(row?.deletedAt).toBeTruthy();
    expect(row?.logoKey).toBeNull();
    expect((await req(paul, "GET", `/crews/${crew.id}`)).status).toBe(404);
    expect((await req(lea, "GET", `/crews/${crew.id}`)).json.archived).toBe(true);
    expect((await req(lea, "GET", `/conversations/${crew.conversationId}/messages`)).status).toBe(200);
    const write = await req(lea, "POST", `/conversations/${crew.conversationId}/messages`, {
      clientId: randomUUID(),
      body: "Encore là ?",
    });
    expect(write.status).toBe(403);
    expect((await req(paul, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(409);
    expect((await req(paul, "GET", "/crews/search?q=crew")).json.items).toHaveLength(0);
    expect(
      await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, lea.id), eq(notifications.type, "crew_archived")),
      }),
    ).toBeTruthy();
  });

  it("images de la discussion : réservées aux membres", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const paul = await signUp("Paul");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    const up = await upload(lea, "message");
    const sent = await req(lea, "POST", `/conversations/${crew.conversationId}/messages`, {
      clientId: randomUUID(),
      imageKey: up.json.key,
    });
    expect(sent.status).toBe(201);
    const url: string = sent.json.image.url;
    const get = (u: TestUser) => app.request(url, { headers: { origin: ORIGIN, cookie: u.cookie } });
    expect((await get(kenji)).status).toBe(200);
    expect((await get(paul)).status).toBe(403);
    await req(kenji, "DELETE", `/crews/${crew.id}/members/${lea.id}`);
    expect((await get(lea)).status).toBe(403);
  });

  it("concurrence : deux acceptations simultanées de la même demande → un seul membre", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const crew = await newCrew(kenji);
    await req(lea, "POST", `/crews/${crew.id}/requests`, { message: null });
    const [a, b] = await Promise.all([
      req(kenji, "POST", `/crews/${crew.id}/requests/${lea.id}/accept`),
      req(kenji, "POST", `/crews/${crew.id}/requests/${lea.id}/accept`),
    ]);
    expect([a.status, b.status].sort()).toEqual([204, 404]);
    const rows = await db.select().from(crewMembers).where(eq(crewMembers.crewId, crew.id));
    expect(rows.filter((r) => r.status === "active")).toHaveLength(2);
    const sys = await db.select().from(messages).where(eq(messages.conversationId, crew.conversationId));
    expect(sys.filter((m) => m.body?.includes("crew_member_joined"))).toHaveLength(1);
  });
});

describe("inscription en crew", () => {
  // Événement le samedi 17 octobre 2026 à 18:00 (Paris), verrouillé à 16:00.
  const STARTS = paris(10, 17, 18);

  async function setup(capacity: number | null = 3, overrides: Partial<typeof events.$inferInsert> = {}) {
    const orga = await signUp("Damien", { twoFactor: true });
    const structure = await createStructure(orga.id);
    const event = await createEvent(structure.id, {
      startsAt: STARTS,
      endsAt: paris(10, 17, 23),
      capacity,
      ...overrides,
    });
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const nina = await signUp("Nina");
    const [vk, vl, vn] = await Promise.all([kenji, lea, nina].map((u) => createVehicle(u.id, ref)));
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, lea);
    await addToCrew(crew.id, kenji, nina);
    return { orga, event, kenji, lea, nina, vk: vk!, vl: vl!, vn: vn!, crew };
  }

  const body = (crewId: string, members: { userId: string; vehicleId: string }[]) => ({
    crewId,
    members,
    rulesAccepted: true,
    followStructure: true,
  });

  for (const mode of MODES) {
    it(`chef en attente de tri, membres « à confirmer » hors tri et hors capacité (${mode})`, async () => {
      const s = await setup(2);
      const res = await req(
        s.kenji,
        "POST",
        `/events/${s.event.id}/crew-applications`,
        body(s.crew.id, [
          { userId: s.kenji.id, vehicleId: s.vk.id },
          { userId: s.lea.id, vehicleId: s.vl.id },
          { userId: s.nina.id, vehicleId: s.vn.id },
        ]),
        mode,
      );
      expect(res.status).toBe(201);
      const statuses = Object.fromEntries(
        res.json.members.map((m: { pseudo: string; status: string }) => [m.pseudo, m.status]),
      );
      expect(statuses).toEqual({
        [s.kenji.pseudo]: "pending",
        [s.lea.pseudo]: "awaiting_member",
        [s.nina.pseudo]: "awaiting_member",
      });
      const rows = await db.select().from(applications).where(eq(applications.eventId, s.event.id));
      expect(rows.every((r) => r.source === "crew" && r.crewId === s.crew.id)).toBe(true);
      expect(new Set(rows.map((r) => r.crewApplicationId)).size).toBe(1);
      expect(rows.find((r) => r.userId === s.lea.id)?.rulesAcceptedAt).toBeNull();
      // Tâches d'expiration : une par membre, à 72 h (avant le verrouillage ici).
      expect(jobsNamed("crew.confirm-expire")).toHaveLength(2);
      expect(jobsNamed("crew.confirm-expire")[0]?.startAfter?.toISOString()).toBe(
        new Date(clock.now.getTime() + 72 * HOUR).toISOString(),
      );
      // Tri : seul le chef ; capacité : rien de pris par les membres non confirmés.
      const triage = await req(s.orga, "GET", `/events/${s.event.id}/applications`, undefined, mode);
      expect(triage.json.items).toHaveLength(1);
      expect(triage.json.items[0].crew).toMatchObject({ name: expect.any(String), confirmed: 1, total: 3 });
      expect(triage.json.items[0].crew.members).toHaveLength(1);
      const counters = await req(s.orga, "GET", `/events/${s.event.id}/counters`, undefined, mode);
      expect(counters.json).toMatchObject({ pending: 1, remaining: 2 });
      const leaApp = rows.find((r) => r.userId === s.lea.id);
      expect((await req(s.orga, "GET", `/applications/${leaApp?.id}`, undefined, mode)).status).toBe(404);
      // Le membre voit sa carte Accès, la Boîte compte sa venue à confirmer.
      const mine = await req(s.lea, "GET", "/me/applications", undefined, mode);
      expect(mine.json[0]).toMatchObject({ status: "awaiting_member", crew: { awaitingMember: true } });
      expect(mine.json[0].crew.confirmBefore).toBeTruthy();
      expect((await req(s.lea, "GET", "/me/inbox/summary", undefined, mode)).json.requests.crewConfirmation).toBe(1);
      expect((await req(s.lea, "GET", "/me/crew-confirmations", undefined, mode)).json).toHaveLength(1);
      // L'organisateur ne peut pas trancher sur une venue non confirmée.
      expect(
        (
          await req(
            s.orga,
            "POST",
            `/events/${s.event.id}/applications/${leaApp?.id}/decide`,
            { decision: "accept" },
            mode,
          )
        ).status,
      ).toBe(409);
      // Un autre que le membre ne confirme pas pour lui.
      expect(
        (await req(s.kenji, "POST", `/applications/${leaApp?.id}/confirm-crew`, { rulesAccepted: true }, mode)).status,
      ).toBe(404);
      // Confirmation par Lea → en attente de tri, visible.
      const confirmed = await req(
        s.lea,
        "POST",
        `/applications/${leaApp?.id}/confirm-crew`,
        { rulesAccepted: true },
        mode,
      );
      expect(confirmed.status).toBe(200);
      expect(confirmed.json.status).toBe("pending");
      const after = await req(s.orga, "GET", `/events/${s.event.id}/applications?crewId=${s.crew.id}`, undefined, mode);
      expect(after.json.items).toHaveLength(2);
      expect(after.json.items[0].crew.confirmed).toBe(2);
      expect((await req(s.orga, "GET", `/events/${s.event.id}/applications/crews`, undefined, mode)).json).toEqual([
        { id: s.crew.id, name: expect.any(String), count: 2 },
      ]);
      // La notification au chef.
      expect(
        await db.query.notifications.findFirst({
          where: and(eq(notifications.userId, s.kenji.id), eq(notifications.type, "crew_member_confirmed")),
        }),
      ).toBeTruthy();
    });
  }

  it("vérifications : membre non actif, véhicule d'un autre, doublon, verrouillé, non-chef, membre seul", async () => {
    const s = await setup();
    const paul = await signUp("Paul");
    const vp = await createVehicle(paul.id, ref);
    const base = `/events/${s.event.id}/crew-applications`;
    const notMember = await req(s.kenji, "POST", base, body(s.crew.id, [{ userId: paul.id, vehicleId: vp.id }]));
    expect(notMember.status).toBe(400);
    const otherVehicle = await req(s.kenji, "POST", base, body(s.crew.id, [{ userId: s.lea.id, vehicleId: s.vn.id }]));
    expect(otherVehicle.status).toBe(400);
    expect(
      (await req(s.kenji, "POST", base, body(s.crew.id, [{ userId: s.kenji.id, vehicleId: s.vk.id }]))).status,
    ).toBe(400);
    expect((await req(s.lea, "POST", base, body(s.crew.id, [{ userId: s.nina.id, vehicleId: s.vn.id }]))).status).toBe(
      403,
    );
    // Doublon : Nina a déjà candidaté seule avec ce véhicule.
    const solo = await req(s.nina, "POST", `/events/${s.event.id}/applications`, {
      vehicleIds: [s.vn.id],
      rulesAccepted: true,
    });
    expect(solo.status).toBe(201);
    const dup = await req(s.kenji, "POST", base, body(s.crew.id, [{ userId: s.nina.id, vehicleId: s.vn.id }]));
    expect(dup.status).toBe(409);
    // Une fois Lea inscrite par le crew, sa candidature seule avec le même véhicule est refusée (pas de double).
    expect((await req(s.kenji, "POST", base, body(s.crew.id, [{ userId: s.lea.id, vehicleId: s.vl.id }]))).status).toBe(
      201,
    );
    const leaSolo = await req(s.lea, "POST", `/events/${s.event.id}/applications`, {
      vehicleIds: [s.vl.id],
      rulesAccepted: true,
    });
    expect(leaSolo.status).toBe(409);
    // Verrouillé.
    clock.set(paris(10, 17, 16, 30));
    const locked = await req(
      s.kenji,
      "POST",
      base,
      body(s.crew.id, [
        { userId: s.kenji.id, vehicleId: s.vk.id },
        { userId: s.lea.id, vehicleId: s.vl.id },
      ]),
    );
    expect(locked.status).toBe(423);
  });

  it("concurrence : deux inscriptions simultanées du même membre → une seule candidature", async () => {
    const s = await setup();
    const payload = body(s.crew.id, [{ userId: s.lea.id, vehicleId: s.vl.id }]);
    const [a, b] = await Promise.all([
      req(s.kenji, "POST", `/events/${s.event.id}/crew-applications`, payload),
      req(s.kenji, "POST", `/events/${s.event.id}/crew-applications`, payload),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await db.select().from(applications).where(eq(applications.userId, s.lea.id))).toHaveLength(1);
  });

  it("« je ne viens pas », retrait par le chef, expiration à 72 h, plafond au verrouillage, rien d'automatique d'autre", async () => {
    const s = await setup();
    await req(
      s.kenji,
      "POST",
      `/events/${s.event.id}/crew-applications`,
      body(s.crew.id, [
        { userId: s.lea.id, vehicleId: s.vl.id },
        { userId: s.nina.id, vehicleId: s.vn.id },
      ]),
    );
    const rows = await db.select().from(applications).where(eq(applications.eventId, s.event.id));
    const lea = rows.find((r) => r.userId === s.lea.id);
    const nina = rows.find((r) => r.userId === s.nina.id);
    // Le désistement ordinaire ne vaut pas « je ne viens pas » (le chef doit être prévenu).
    expect((await req(s.lea, "POST", `/applications/${lea?.id}/withdraw`)).status).toBe(409);
    const declined = await req(s.lea, "POST", `/applications/${lea?.id}/decline-crew`);
    expect(declined.json.status).toBe("withdrawn");
    expect(
      await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, s.kenji.id), eq(notifications.type, "crew_member_declined")),
      }),
    ).toBeTruthy();
    // Expiration : tâche partie en avance → rien ; à 72 h → retirée, chef prévenu.
    expect(await crewRegistrationService.expire(nina?.id ?? "")).toBe(false);
    clock.advance(72 * HOUR);
    expect(await crewRegistrationService.expire(nina?.id ?? "")).toBe(true);
    const expired = await db.query.applications.findFirst({ where: eq(applications.id, nina?.id ?? "") });
    expect(expired?.status).toBe("withdrawn");
    expect(expired?.withdrawnAfterLock).toBe(false);
    expect(
      await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, s.kenji.id), eq(notifications.type, "crew_member_expired")),
      }),
    ).toBeTruthy();
    expect(await crewRegistrationService.expire(nina?.id ?? "")).toBe(false);
    expect((await req(s.nina, "POST", `/applications/${nina?.id}/confirm-crew`, { rulesAccepted: true })).status).toBe(
      409,
    );
  });

  it("plafond au verrouillage : inscription la veille, échéance = verrouillage, balayage de secours", async () => {
    const s = await setup();
    clock.set(paris(10, 16, 12));
    await req(
      s.kenji,
      "POST",
      `/events/${s.event.id}/crew-applications`,
      body(s.crew.id, [{ userId: s.lea.id, vehicleId: s.vl.id }]),
    );
    expect(jobsNamed("crew.confirm-expire")[0]?.startAfter?.toISOString()).toBe(paris(10, 17, 16).toISOString());
    const mine = await req(s.lea, "GET", "/me/applications");
    expect(mine.json[0].crew.confirmBefore).toBe(paris(10, 17, 16).toISOString());
    clock.set(paris(10, 17, 16, 1));
    expect(
      (await req(s.lea, "POST", `/applications/${mine.json[0].id}/confirm-crew`, { rulesAccepted: true })).status,
    ).toBe(423);
    expect(await crewRegistrationService.sweep()).toBe(1);
    expect((await db.query.applications.findFirst({ where: eq(applications.userId, s.lea.id) }))?.status).toBe(
      "withdrawn",
    );
  });

  it("le chef retire un membre non confirmé ; annulation de l'événement → annulée", async () => {
    const s = await setup();
    await req(
      s.kenji,
      "POST",
      `/events/${s.event.id}/crew-applications`,
      body(s.crew.id, [
        { userId: s.lea.id, vehicleId: s.vl.id },
        { userId: s.nina.id, vehicleId: s.vn.id },
      ]),
    );
    const rows = await db.select().from(applications).where(eq(applications.eventId, s.event.id));
    const lea = rows.find((r) => r.userId === s.lea.id);
    expect((await req(s.nina, "POST", `/applications/${lea?.id}/crew-remove`)).status).toBe(404);
    expect((await req(s.kenji, "POST", `/applications/${lea?.id}/crew-remove`)).status).toBe(204);
    expect((await db.query.applications.findFirst({ where: eq(applications.id, lea?.id ?? "") }))?.status).toBe(
      "withdrawn",
    );
    expect((await req(s.orga, "POST", `/events/${s.event.id}/cancel`)).status).toBeLessThan(300);
    expect((await db.query.applications.findFirst({ where: eq(applications.userId, s.nina.id) }))?.status).toBe(
      "cancelled",
    );
  });

  it("anonymisation : chef supprimé → crew dissous et membres prévenus ; membre supprimé → pseudo retiré des messages", async () => {
    const s = await setup();
    // Nina part (compte supprimé) : son appartenance disparaît, le message « a rejoint » ne la nomme plus.
    await accountService.anonymize(s.nina.id, null);
    expect(await db.select().from(crewMembers).where(eq(crewMembers.userId, s.nina.id))).toHaveLength(0);
    const sys = await db.select().from(messages).where(eq(messages.conversationId, s.crew.conversationId));
    expect(sys.some((m) => m.body?.includes(s.nina.pseudo))).toBe(false);
    expect((await req(s.kenji, "GET", `/crews/${s.crew.id}`)).json.membersCount).toBe(2);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, s.kenji.id));
    expect(notes.some((n) => JSON.stringify(n.data).includes(s.nina.id))).toBe(false);
    // Kenji supprime son compte : le crew est dissous, Lea est prévenue, la discussion reste lisible sans écriture.
    await accountService.anonymize(s.kenji.id, null);
    const crew = await db.query.crews.findFirst({ where: eq(crews.id, s.crew.id) });
    expect(crew?.deletedAt).toBeTruthy();
    expect(
      await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, s.lea.id), eq(notifications.type, "crew_archived")),
      }),
    ).toBeTruthy();
    expect((await req(s.lea, "GET", `/conversations/${s.crew.conversationId}/messages`)).status).toBe(200);
  });

  it("critère de fin : Kenji crée, Léa rejoint, discussion, inscription, Léa confirme, Nina expire, tri, retenue, pass, désistement", async () => {
    const orga = await signUp("Damien", { twoFactor: true });
    const structure = await createStructure(orga.id);
    const expo = await createEvent(structure.id, {
      title: "Expo Rivesaltes",
      startsAt: STARTS,
      endsAt: paris(10, 17, 23),
      capacity: 10,
    });
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const nina = await signUp("Nina");
    const [vk, vl, vn] = await Promise.all([kenji, lea, nina].map((u) => createVehicle(u.id, ref)));
    const crew = await newCrew(kenji, "bearer");
    await req(lea, "POST", `/crews/${crew.id}/requests`, { message: "Salut" }, "bearer");
    await req(kenji, "POST", `/crews/${crew.id}/requests/${lea.id}/accept`);
    await addToCrew(crew.id, kenji, nina);
    expect(
      (
        await req(lea, "POST", `/conversations/${crew.conversationId}/messages`, {
          clientId: randomUUID(),
          body: "On y va ?",
        })
      ).status,
    ).toBe(201);
    const reg = await req(
      kenji,
      "POST",
      `/events/${expo.id}/crew-applications`,
      body(crew.id, [
        { userId: kenji.id, vehicleId: vk!.id },
        { userId: lea.id, vehicleId: vl!.id },
        { userId: nina.id, vehicleId: vn!.id },
      ]),
      "bearer",
    );
    expect(reg.status).toBe(201);
    const leaApp = reg.json.members.find((m: { pseudo: string }) => m.pseudo === lea.pseudo).applicationId;
    const ninaApp = reg.json.members.find((m: { pseudo: string }) => m.pseudo === nina.pseudo).applicationId;
    const kenjiApp = reg.json.members.find((m: { pseudo: string }) => m.pseudo === kenji.pseudo).applicationId;
    expect(
      (await req(lea, "POST", `/applications/${leaApp}/confirm-crew`, { rulesAccepted: true }, "bearer")).json.status,
    ).toBe("pending");
    clock.advance(72 * HOUR + 60_000);
    expect(await crewRegistrationService.expire(ninaApp)).toBe(true);
    const triage = await req(orga, "GET", `/events/${expo.id}/applications?crewId=${crew.id}`);
    expect(triage.json.items).toHaveLength(2);
    const leaCard = triage.json.items.find((i: { id: string }) => i.id === leaApp);
    expect(leaCard.crew).toMatchObject({ confirmed: 2, total: 2 });
    expect(leaCard.crew.members.map((m: { pseudo: string }) => m.pseudo).sort()).toEqual(
      [kenji.pseudo, lea.pseudo].sort(),
    );
    for (const id of [leaApp, kenjiApp]) {
      expect(
        (await req(orga, "POST", `/events/${expo.id}/applications/${id}/decide`, { decision: "accept" })).status,
      ).toBe(200);
    }
    const card = await req(lea, "GET", `/applications/${leaApp}`, undefined, "bearer");
    expect(card.json.status).toBe("accepted");
    const pass = await req(lea, "GET", `/applications/${leaApp}/pass`, undefined, "bearer");
    expect(pass.status).toBe(200);
    expect((await req(nina, "GET", `/applications/${leaApp}/pass`)).status).toBeGreaterThanOrEqual(403);
    expect((await req(lea, "POST", `/applications/${leaApp}/withdraw`, undefined, "bearer")).json.status).toBe(
      "withdrawn",
    );
    expect((await req(kenji, "GET", `/applications/${kenjiApp}`)).json.status).toBe("accepted");
  });

  // ---- Corrections de la relecture du lot 19 ----

  for (const mode of MODES) {
    it(`pas de réinscription moins de 24 h après « Je ne viens pas » ou un retrait par le chef (${mode})`, async () => {
      const s = await setup();
      const base = `/events/${s.event.id}/crew-applications`;
      const leaOnly = body(s.crew.id, [{ userId: s.lea.id, vehicleId: s.vl.id }]);
      const ninaOnly = body(s.crew.id, [{ userId: s.nina.id, vehicleId: s.vn.id }]);
      const first = await req(s.kenji, "POST", base, leaOnly, mode);
      expect(first.status).toBe(201);
      await req(s.lea, "POST", `/applications/${first.json.members[0].applicationId}/decline-crew`, undefined, mode);
      const again = await req(s.kenji, "POST", base, leaOnly, mode);
      expect(again.status).toBe(429);
      expect(again.json.error.message).toContain("24 h");
      const nina = await req(s.kenji, "POST", base, ninaOnly, mode);
      const ninaApp = nina.json.members.find((m: { pseudo: string }) => m.pseudo === s.nina.pseudo).applicationId;
      expect((await req(s.kenji, "POST", `/applications/${ninaApp}/crew-remove`, undefined, mode)).status).toBe(204);
      expect((await req(s.kenji, "POST", base, ninaOnly, mode)).status).toBe(429);
      const notes = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, s.nina.id), eq(notifications.type, "crew_registration_to_confirm")));
      expect(notes).toHaveLength(1);
      // 24 h plus tard : de nouveau possible.
      clock.advance(25 * HOUR);
      expect((await req(s.kenji, "POST", base, leaOnly, mode)).status).toBe(201);
    });
  }

  it("le chef n'apprend rien de privé : raisons génériques, véhicules d'un compte privé sans photo ni génération", async () => {
    const s = await setup();
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, s.nina.id));
    await db.insert(structureBans).values({ structureId: s.event.structureId, userId: s.lea.id, createdBy: s.orga.id });
    const options = await req(s.kenji, "GET", `/events/${s.event.id}/crew-applications/options?crewId=${s.crew.id}`);
    expect(options.status).toBe(200);
    const byPseudo = (p: string) =>
      options.json.members.find((m: { person: { pseudo: string } }) => m.person.pseudo === p);
    expect(byPseudo(s.lea.pseudo).blocked).toBe("Indisponible pour cet événement");
    const nina = byPseudo(s.nina.pseudo);
    expect(nina.blocked).toBeNull();
    expect(nina.vehicles[0].photoUrl).toBeNull();
    expect(nina.vehicles[0].label).toBe("BMW Série 3");
    expect(byPseudo(s.kenji.pseudo).vehicles[0].photoUrl).not.toBeNull();
    expect(byPseudo(s.kenji.pseudo).vehicles[0].label).toBe("BMW Série 3 E36");
    const refused = await req(
      s.kenji,
      "POST",
      `/events/${s.event.id}/crew-applications`,
      body(s.crew.id, [{ userId: s.lea.id, vehicleId: s.vl.id }]),
    );
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toBe(`${s.lea.pseudo} : indisponible pour cet événement`);
    expect(JSON.stringify(refused.json)).not.toMatch(/structure|banni|suspendu/i);
  });

  it("départ, retrait et dissolution retirent les venues à confirmer ; crew dissous sans lien au tri", async () => {
    const s = await setup();
    const theo = await signUp("Theo");
    const vt = await createVehicle(theo.id, ref);
    await addToCrew(s.crew.id, s.kenji, theo);
    const reg = await req(
      s.kenji,
      "POST",
      `/events/${s.event.id}/crew-applications`,
      body(s.crew.id, [
        { userId: s.kenji.id, vehicleId: s.vk.id },
        { userId: s.lea.id, vehicleId: s.vl.id },
        { userId: s.nina.id, vehicleId: s.vn.id },
        { userId: theo.id, vehicleId: vt.id },
      ]),
    );
    const appOf = (p: string) => reg.json.members.find((m: { pseudo: string }) => m.pseudo === p).applicationId;
    const statusOf = async (id: string) =>
      (await db.query.applications.findFirst({ where: eq(applications.id, id) }))?.status;
    // Léa part : sa venue à confirmer est retirée, sa confirmation est refusée.
    await req(s.lea, "DELETE", `/crews/${s.crew.id}/members/${s.lea.id}`);
    expect(await statusOf(appOf(s.lea.pseudo))).toBe("withdrawn");
    expect(
      (await req(s.lea, "POST", `/applications/${appOf(s.lea.pseudo)}/confirm-crew`, { rulesAccepted: true })).status,
    ).toBe(409);
    // Nina retirée par le chef.
    await req(s.kenji, "DELETE", `/crews/${s.crew.id}/members/${s.nina.id}`);
    expect(await statusOf(appOf(s.nina.pseudo))).toBe("withdrawn");
    // Théo confirme, puis le crew est dissous : la venue confirmée reste, le tri ne lie plus vers le crew.
    await req(theo, "POST", `/applications/${appOf(theo.pseudo)}/confirm-crew`, { rulesAccepted: true });
    expect((await req(s.kenji, "DELETE", `/crews/${s.crew.id}`)).status).toBe(204);
    expect(await statusOf(appOf(theo.pseudo))).toBe("pending");
    const triage = await req(s.orga, "GET", `/events/${s.event.id}/applications?crewId=${s.crew.id}`);
    expect(triage.json.items[0].crew).toMatchObject({ archived: true, confirmed: 2, total: 2 });
    for (const n of await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "crew_registration_to_confirm"))) {
      if (n.userId !== theo.id) expect(n.readAt).not.toBeNull();
    }
  });

  it("annonce de l'équipe organisatrice (lot 20) : jamais aux membres qui n'ont pas confirmé ; modification : oui", async () => {
    const s = await setup();
    await req(
      s.kenji,
      "POST",
      `/events/${s.event.id}/crew-applications`,
      body(s.crew.id, [
        { userId: s.kenji.id, vehicleId: s.vk.id },
        { userId: s.lea.id, vehicleId: s.vl.id },
      ]),
    );
    const posted = await req(s.orga, "POST", `/events/${s.event.id}/announcements`, {
      body: "Rendez-vous à l'entrée nord.",
      notify: true,
      audience: "public",
    });
    expect(posted.status).toBe(201);
    const announced = await db.select().from(notifications).where(eq(notifications.type, "event_announcement"));
    expect(announced.map((n) => n.userId)).toContain(s.kenji.id);
    expect(announced.map((n) => n.userId)).not.toContain(s.lea.id);
  });

  it("dissolution par suppression du compte du chef : venues à confirmer retirées sans malus", async () => {
    const s = await setup();
    const reg = await req(
      s.kenji,
      "POST",
      `/events/${s.event.id}/crew-applications`,
      body(s.crew.id, [{ userId: s.lea.id, vehicleId: s.vl.id }]),
    );
    const id = reg.json.members[0].applicationId;
    await accountService.anonymize(s.kenji.id, null);
    const app = await db.query.applications.findFirst({ where: eq(applications.id, id) });
    expect(app?.status).toBe("withdrawn");
    expect(app?.withdrawnAfterLock).toBe(false);
  });

  it("confirmation refusée si la plaque a été transférée à un autre compte ; annulation : notification fermée", async () => {
    const s = await setup();
    const reg = await req(
      s.kenji,
      "POST",
      `/events/${s.event.id}/crew-applications`,
      body(s.crew.id, [
        { userId: s.lea.id, vehicleId: s.vl.id },
        { userId: s.nina.id, vehicleId: s.vn.id },
      ]),
    );
    const leaApp = reg.json.members.find((m: { pseudo: string }) => m.pseudo === s.lea.pseudo).applicationId;
    await db.update(vehicles).set({ ownerId: s.kenji.id }).where(eq(vehicles.id, s.vl.id));
    expect((await req(s.lea, "POST", `/applications/${leaApp}/confirm-crew`, { rulesAccepted: true })).status).toBe(
      409,
    );
    expect((await req(s.orga, "POST", `/events/${s.event.id}/cancel`)).status).toBeLessThan(300);
    const notes = await db.select().from(notifications).where(eq(notifications.type, "crew_registration_to_confirm"));
    expect(notes.length).toBe(2);
    expect(notes.every((n) => n.readAt !== null)).toBe(true);
  });
});
