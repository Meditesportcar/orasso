// Rendez-vous au spot (lot R7i) : lancer (un seul actif, 12 h au plus), invités (abonnés acceptés, crew ; jamais « tout le monde »),
// lieu servi aux invités seuls, réponses, notifications (heures calmes, livraison vérifiée), effacement à la fin, onglet Spots
// du crew, bloc « Au spot » de l'Accueil, carte du Fil, migration. Horloge simulée : aucune date codée en dur.
import { fromWallTime, HOUR, MINUTE, SPOT_MAX_DURATION_MS } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { resetDb, signUp, type TestUser, useClock, viewerOf } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  crewMembers,
  crews,
  notifications,
  profiles,
  spotMeetupReplies,
  spotMeetups,
  userFollows,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { notificationsService } from "../notifications/service";
import { spotMeetupsPurge } from "./purge";
import { spotMeetupsService } from "./service";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;
const at = (hour: number, minute = 0, day = 10) => fromWallTime({ year: 2026, month: 11, day, hour, minute });

beforeEach(async () => {
  await resetDb();
  clock = useClock(at(10));
});

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
    json = null;
  }
  return { status: res.status, json, text };
}

async function follow(a: TestUser, b: TestUser, accepted = true) {
  await req(a, "POST", `/users/${b.pseudo}/follow`);
  if (accepted) {
    await db
      .update(userFollows)
      .set({ status: "accepted", acceptedAt: clock.now })
      .where(and(eq(userFollows.followerId, a.id), eq(userFollows.followedId, b.id)));
  } else {
    await db
      .update(userFollows)
      .set({ status: "pending", acceptedAt: null })
      .where(and(eq(userFollows.followerId, a.id), eq(userFollows.followedId, b.id)));
  }
}

let crewCounter = 0;
async function newCrew(leader: TestUser, members: TestUser[] = []) {
  const res = await req(leader, "POST", "/crews", { name: `Crew spot ${++crewCounter}`, department: "66" });
  expect(res.status).toBe(201);
  const crew = res.json as { id: string; slug: string };
  for (const m of members) {
    expect((await req(m, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
    expect((await req(leader, "POST", `/crews/${crew.id}/requests/${m.id}/accept`)).status).toBe(204);
  }
  return crew;
}

type Over = Record<string, unknown>;
const body = (over: Over = {}) => ({
  placeLabel: "Port de Saint-Cyprien",
  lat: 42.62,
  lng: 3.03,
  startsAt: clock.now.toISOString(),
  endsAt: new Date(clock.now.getTime() + 2 * HOUR).toISOString(),
  note: "Café au port, qui vient ?",
  audience: "followers",
  ...over,
});
async function launch(u: TestUser, over: Over = {}) {
  const res = await req(u, "POST", "/me/spot-meetups", body(over));
  expect(res.status, res.text).toBe(201);
  return res.json as { id: string; [k: string]: unknown };
}

async function world() {
  const kenji = await signUp("Kenji");
  const lea = await signUp("Lea");
  const nina = await signUp("Nina");
  const paul = await signUp("Paul");
  return { kenji, lea, nina, paul };
}

describe("lancer", () => {
  it("201 : la vue de l'auteur, lieu compris, liste blanche de champs", async () => {
    const { kenji } = await world();
    const m = await launch(kenji);
    expect(Object.keys(m).sort()).toEqual(
      [
        "audience",
        "author",
        "cameCount",
        "createdAt",
        "crew",
        "endsAt",
        "id",
        "maybeCount",
        "mine",
        "myAnswer",
        "note",
        "phase",
        "place",
        "startsAt",
        "yesCount",
        "yesPreview",
      ].sort(),
    );
    expect(m).toMatchObject({
      audience: "followers",
      crew: null,
      mine: true,
      phase: "live",
      place: { label: "Port de Saint-Cyprien", lat: 42.62, lng: 3.03 },
      note: "Café au port, qui vient ?",
    });
    expect(Object.keys(m.author as object).sort()).toEqual(["avatarUrl", "pseudo"]);
  });

  it("un seul actif par personne : 409 meetup_active avec le rendez-vous, puis libre après l'annulation", async () => {
    const { kenji } = await world();
    const first = await launch(kenji);
    const again = await req(kenji, "POST", "/me/spot-meetups", body());
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("meetup_active");
    expect(again.json.error.details.meetupId).toBe(first.id);
    expect((await req(kenji, "DELETE", `/me/spot-meetups/${first.id}`)).status).toBe(200);
    await launch(kenji);
  });

  it("un rendez-vous fini depuis quelques minutes (tâche pas encore passée) ne bloque pas le suivant", async () => {
    const { kenji } = await world();
    await launch(kenji, { endsAt: new Date(clock.now.getTime() + HOUR).toISOString() });
    clock.advance(HOUR + 2 * MINUTE);
    const next = await launch(kenji, {
      startsAt: clock.now.toISOString(),
      endsAt: new Date(clock.now.getTime() + HOUR).toISOString(),
    });
    expect(next.id).toBeTruthy();
  });

  it("deux lancements simultanés : un seul passe", async () => {
    const { kenji } = await world();
    const [a, b] = await Promise.all([
      req(kenji, "POST", "/me/spot-meetups", body()),
      req(kenji, "POST", "/me/spot-meetups", body()),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it("12 h au plus : 12 h pile passe, une milliseconde de plus est refusée (400) ; pas de fin avant le début", async () => {
    const { kenji } = await world();
    const start = clock.now;
    const long = await req(
      kenji,
      "POST",
      "/me/spot-meetups",
      body({ endsAt: new Date(start.getTime() + SPOT_MAX_DURATION_MS + 1).toISOString() }),
    );
    expect(long.status).toBe(400);
    expect(long.json.error.code).toBe("validation_error");
    const before = await req(kenji, "POST", "/me/spot-meetups", body({ endsAt: start.toISOString() }));
    expect(before.status).toBe(400);
    await launch(kenji, { endsAt: new Date(start.getTime() + SPOT_MAX_DURATION_MS).toISOString() });
  });

  it("début : 15 min dans le passé au plus, 24 h devant au plus", async () => {
    const { kenji } = await world();
    const t = clock.now.getTime();
    const past = await req(
      kenji,
      "POST",
      "/me/spot-meetups",
      body({ startsAt: new Date(t - 20 * MINUTE).toISOString(), endsAt: new Date(t + HOUR).toISOString() }),
    );
    expect(past.status).toBe(400);
    const far = await req(
      kenji,
      "POST",
      "/me/spot-meetups",
      body({ startsAt: new Date(t + 25 * HOUR).toISOString(), endsAt: new Date(t + 26 * HOUR).toISOString() }),
    );
    expect(far.status).toBe(400);
    await launch(kenji, {
      startsAt: new Date(t + 23 * HOUR).toISOString(),
      endsAt: new Date(t + 24 * HOUR).toISOString(),
    });
  });

  it("validation : lieu, coordonnées, mot de 140 au plus, audience crew sans crew", async () => {
    const { kenji } = await world();
    for (const over of [
      { placeLabel: "" },
      { placeLabel: "x".repeat(81) },
      { lat: 120 },
      { note: "x".repeat(141) },
      { audience: "crew" },
      { audience: "everyone" },
    ]) {
      expect((await req(kenji, "POST", "/me/spot-meetups", body(over))).status, JSON.stringify(over)).toBe(400);
    }
    expect((await req(kenji, "POST", "/me/spot-meetups", body({ note: "x".repeat(140) }))).status).toBe(201);
  });

  it("sans session : 401", async () => {
    expect((await req(null, "POST", "/me/spot-meetups", body())).status).toBe(401);
    expect((await req(null, "GET", "/me/spot-meetups/incoming")).status).toBe(401);
  });

  it("pour un crew : seulement un membre actif (404 sinon) ; le crew est dans la vue", async () => {
    const { kenji, lea, paul } = await world();
    const crew = await newCrew(kenji, [lea]);
    expect((await req(paul, "POST", "/me/spot-meetups", body({ audience: "crew", crewId: crew.id }))).status).toBe(404);
    const m = await launch(lea, { audience: "crew", crewId: crew.id });
    expect(m.crew).toMatchObject({ id: crew.id });
    // « Mes abonnés » avec un crewId : refusé.
    expect((await req(kenji, "POST", "/me/spot-meetups", body({ crewId: crew.id }))).status).toBe(400);
  });
});

describe("invités : le lieu n'est servi qu'à eux", () => {
  it("abonné accepté : 200 avec le lieu ; en attente, inconnu, abonné d'un autre : 404", async () => {
    const { kenji, lea, nina, paul } = await world();
    await follow(lea, kenji);
    await follow(nina, kenji, false);
    const m = await launch(kenji);
    const asLea = await req(lea, "GET", `/spot-meetups/${m.id}`);
    expect(asLea.status).toBe(200);
    expect(asLea.json.place).toMatchObject({ label: "Port de Saint-Cyprien" });
    expect(asLea.json.mine).toBe(false);
    for (const u of [nina, paul]) {
      const r = await req(u, "GET", `/spot-meetups/${m.id}`);
      expect(r.status).toBe(404);
      // Rien du lieu dans une réponse refusée.
      expect(r.text).not.toMatch(/Saint-Cyprien|42\.62|3\.03|lat|lng/);
    }
    expect((await req(null, "GET", `/spot-meetups/${m.id}`)).status).toBe(401);
  });

  it("un auteur public n'ouvre pas son rendez-vous à tout le monde : c'est une invitation", async () => {
    const { kenji, paul } = await world();
    const m = await launch(kenji);
    expect((await req(paul, "GET", `/spot-meetups/${m.id}`)).status).toBe(404);
    expect((await req(paul, "GET", "/me/spot-meetups/incoming")).json.items).toHaveLength(0);
  });

  it("crew : un membre actif voit ; un abonné non membre, un membre en attente, un ancien membre : 404", async () => {
    const { kenji, lea, nina, paul } = await world();
    const crew = await newCrew(kenji, [lea]);
    await follow(paul, kenji);
    expect((await req(nina, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
    const m = await launch(kenji, { audience: "crew", crewId: crew.id });
    expect((await req(lea, "GET", `/spot-meetups/${m.id}`)).status).toBe(200);
    expect((await req(paul, "GET", `/spot-meetups/${m.id}`)).status).toBe(404);
    expect((await req(nina, "GET", `/spot-meetups/${m.id}`)).status).toBe(404);
    await db.delete(crewMembers).where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, lea.id)));
    expect((await req(lea, "GET", `/spot-meetups/${m.id}`)).status).toBe(404);
  });

  it("l'auteur sorti du crew : son rendez-vous de crew disparaît pour les autres", async () => {
    const { kenji, lea } = await world();
    const crew = await newCrew(kenji, [lea]);
    const m = await launch(lea, { audience: "crew", crewId: crew.id });
    expect((await req(kenji, "GET", `/spot-meetups/${m.id}`)).status).toBe(200);
    await db.delete(crewMembers).where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, lea.id)));
    expect((await req(kenji, "GET", `/spot-meetups/${m.id}`)).status).toBe(404);
    expect((await req(kenji, "GET", `/crews/${crew.id}/spot-meetups`)).json.active).toHaveLength(0);
  });

  it("compte suspendu ou supprimé : l'auteur n'est plus visible ; le regard suspendu ne voit rien", async () => {
    const { kenji, lea } = await world();
    await follow(lea, kenji);
    const m = await launch(kenji);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, kenji.id));
    expect((await req(lea, "GET", `/spot-meetups/${m.id}`)).status).toBe(404);
    expect((await req(lea, "GET", "/me/spot-meetups/incoming")).json.items).toHaveLength(0);
    await db.update(profiles).set({ suspendedUntil: null }).where(eq(profiles.userId, kenji.id));
    expect((await req(lea, "GET", `/spot-meetups/${m.id}`)).status).toBe(200);
    await db.update(profiles).set({ bannedAt: clock.now }).where(eq(profiles.userId, lea.id));
    expect([403, 404]).toContain((await req(lea, "GET", `/spot-meetups/${m.id}`)).status);
  });

  it("identifiant mal formé ou inconnu : 400 / 404", async () => {
    const { lea } = await world();
    expect((await req(lea, "GET", "/spot-meetups/pas-un-uuid")).status).toBe(400);
    expect((await req(lea, "GET", "/spot-meetups/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("annuler : seul l'auteur (404 pour un autre), tout disparaît tout de suite", async () => {
    const { kenji, lea } = await world();
    await follow(lea, kenji);
    const m = await launch(kenji);
    expect((await req(lea, "DELETE", `/me/spot-meetups/${m.id}`)).status).toBe(404);
    expect((await req(lea, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" })).status).toBe(200);
    expect((await req(kenji, "DELETE", `/me/spot-meetups/${m.id}`)).status).toBe(200);
    expect((await req(lea, "GET", `/spot-meetups/${m.id}`)).status).toBe(404);
    expect((await req(kenji, "GET", `/spot-meetups/${m.id}`)).status).toBe(404);
    expect((await req(kenji, "DELETE", `/me/spot-meetups/${m.id}`)).status).toBe(404);
    const [row] = await db.select().from(spotMeetups).where(eq(spotMeetups.id, m.id));
    expect(row).toMatchObject({ placeLabel: "", lat: 0, lng: 0 });
    expect(row?.purgedAt).not.toBeNull();
    expect(await db.select().from(spotMeetupReplies)).toHaveLength(0);
  });
});

describe("réponses", () => {
  it("« Je viens » / « Peut-être », modifiables ; l'auteur ne répond pas au sien ; un inconnu : 404", async () => {
    const { kenji, lea, nina, paul } = await world();
    await follow(lea, kenji);
    await follow(nina, kenji);
    const m = await launch(kenji);
    const yes = await req(lea, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" });
    expect(yes.status).toBe(200);
    expect(yes.json).toMatchObject({ myAnswer: "yes", yesCount: 1, maybeCount: 0 });
    const maybe = await req(lea, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "maybe" });
    expect(maybe.json).toMatchObject({ myAnswer: "maybe", yesCount: 0, maybeCount: 1 });
    expect((await req(nina, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" })).json.yesCount).toBe(1);
    expect((await req(kenji, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" })).status).toBe(403);
    expect((await req(paul, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" })).status).toBe(404);
    expect((await req(lea, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "peutetre" })).status).toBe(400);
    expect((await req(lea, "DELETE", `/spot-meetups/${m.id}/reply`)).json).toMatchObject({
      myAnswer: null,
      maybeCount: 0,
    });
  });

  it("la liste « Qui vient ? » : pseudos, pour l'auteur et les invités, pas pour un inconnu ; comptes écartés exclus", async () => {
    const { kenji, lea, nina, paul } = await world();
    await follow(lea, kenji);
    await follow(nina, kenji);
    const m = await launch(kenji);
    await req(lea, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" });
    clock.advance(MINUTE);
    await req(nina, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "maybe" });
    const asAuthor = await req(kenji, "GET", `/spot-meetups/${m.id}/replies`);
    expect(asAuthor.status).toBe(200);
    expect(
      asAuthor.json.items.map((i: { person: { pseudo: string }; answer: string }) => [i.person.pseudo, i.answer]),
    ).toEqual([
      [nina.pseudo, "maybe"],
      [lea.pseudo, "yes"],
    ]);
    expect(Object.keys(asAuthor.json.items[0].person).sort()).toEqual(["avatarUrl", "pseudo"]);
    expect(asAuthor.json).toMatchObject({ yesCount: 1, maybeCount: 1, nextCursor: null });
    expect((await req(lea, "GET", `/spot-meetups/${m.id}/replies`)).status).toBe(200);
    expect((await req(paul, "GET", `/spot-meetups/${m.id}/replies`)).status).toBe(404);
    await db.update(profiles).set({ bannedAt: clock.now }).where(eq(profiles.userId, nina.id));
    const after = await req(kenji, "GET", `/spot-meetups/${m.id}/replies`);
    expect(after.json.items).toHaveLength(1);
    expect(after.json).toMatchObject({ yesCount: 1, maybeCount: 0 });
  });

  it("le résumé d'une vue : trois premiers « Je viens » et le nombre", async () => {
    const { kenji } = await world();
    const m = await launch(kenji);
    const fans: TestUser[] = [];
    for (const name of ["Ana", "Bob", "Cleo", "Dan"]) {
      const u = await signUp(name);
      await follow(u, kenji);
      fans.push(u);
    }
    for (const [i, u] of fans.entries()) {
      clock.advance(MINUTE);
      await req(u, "PUT", `/spot-meetups/${m.id}/reply`, { answer: i === 3 ? "maybe" : "yes" });
    }
    const view = (await req(kenji, "GET", `/spot-meetups/${m.id}`)).json;
    expect(view.yesCount).toBe(3);
    expect(view.maybeCount).toBe(1);
    expect(view.yesPreview.map((p: { pseudo: string }) => p.pseudo)).toEqual(fans.slice(0, 3).map((u) => u.pseudo));
  });

  it("une réponse après la fin : 409 (conflit), rien d'écrit", async () => {
    const { kenji, lea } = await world();
    await follow(lea, kenji);
    const m = await launch(kenji, { endsAt: new Date(clock.now.getTime() + HOUR).toISOString() });
    clock.advance(HOUR + MINUTE);
    expect((await req(lea, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" })).status).toBe(409);
    expect(await db.select().from(spotMeetupReplies)).toHaveLength(0);
  });

  it("l'auteur est prévenu à la première réponse seulement (Journal, regroupé), pas quand on change d'avis", async () => {
    const { kenji, lea, nina } = await world();
    await follow(lea, kenji);
    await follow(nina, kenji);
    const m = await launch(kenji);
    await req(lea, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "maybe" });
    await req(lea, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" });
    const rows = () =>
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.type, "spot_meetup_reply"), eq(notifications.userId, kenji.id)));
    expect(await rows()).toHaveLength(1);
    await req(nina, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" });
    const grouped = await rows();
    // Regroupé : une seule ligne non lue pour ce rendez-vous, avec les deux personnes.
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.data).toMatchObject({ meetupId: m.id });
    expect(JSON.stringify(grouped[0]?.data)).not.toMatch(/lat|lng|Saint-Cyprien/);
  });
});

describe("notifications aux invités", () => {
  const spotNotifs = () => db.select().from(notifications).where(eq(notifications.type, "spot_meetup_new"));

  it("abonnés acceptés seulement (ni l'auteur, ni les demandes en attente, ni les inconnus) ; jamais le lieu dedans", async () => {
    const { kenji, lea, nina, paul } = await world();
    await follow(lea, kenji);
    await follow(nina, kenji, false);
    const m = await launch(kenji);
    const rows = await spotNotifs();
    expect(rows.map((r) => r.userId)).toEqual([lea.id]);
    expect(rows[0]?.inJournal).toBe(false);
    expect(JSON.stringify(rows[0])).not.toMatch(/Saint-Cyprien|42\.62|3\.03|"lat"|"lng"/);
    expect(rows[0]?.data).toMatchObject({ meetupId: m.id, link: `/app/spot/${m.id}` });
    expect(rows.map((r) => r.userId)).not.toContain(paul.id);
  });

  it("crew : les membres actifs, pas l'auteur", async () => {
    const { kenji, lea, nina } = await world();
    const crew = await newCrew(kenji, [lea, nina]);
    await launch(lea, { audience: "crew", crewId: crew.id });
    expect((await spotNotifs()).map((r) => r.userId).sort()).toEqual([kenji.id, nina.id].sort());
  });

  it("heures calmes : retenue la nuit (début lointain), mais part tout de suite si le rendez-vous commence dans 2 h", async () => {
    const { kenji, lea, nina } = await world();
    await follow(lea, kenji);
    clock.set(at(23));
    // Début dans 13 h : pas urgent, la notification attend 8 h.
    await launch(kenji, { startsAt: at(12, 0, 11).toISOString(), endsAt: at(14, 0, 11).toISOString() });
    await notificationsService.flush();
    const [slow] = await spotNotifs();
    expect(slow?.deliverAfter.getTime()).toBe(at(8, 0, 11).getTime());
    expect(slow?.deliveredAt).toBeNull();

    // Autre auteur, début dans 1 h 30 : part malgré la nuit.
    await follow(lea, nina);
    await launch(nina, {
      startsAt: new Date(at(23).getTime() + 90 * MINUTE).toISOString(),
      endsAt: at(1, 30, 11).toISOString(),
    });
    await notificationsService.flush();
    const slowId = (slow?.data as { meetupId?: string } | undefined)?.meetupId;
    const urgent = (await spotNotifs()).find((r) => (r.data as { meetupId?: string }).meetupId !== slowId);
    expect(urgent?.deliverAfter.getTime()).toBe(at(23).getTime());
  });

  it("de jour, une notification part tout de suite", async () => {
    const { kenji, lea } = await world();
    await follow(lea, kenji);
    await launch(kenji);
    const [row] = await spotNotifs();
    expect(row?.deliverAfter.getTime()).toBe(clock.now.getTime());
  });

  it("retenue la nuit puis annulée : elle ne part pas (supprimée)", async () => {
    const { kenji, lea } = await world();
    await follow(lea, kenji);
    clock.set(at(23));
    const m = await launch(kenji, { startsAt: at(12, 0, 11).toISOString(), endsAt: at(14, 0, 11).toISOString() });
    expect(await spotNotifs()).toHaveLength(1);
    await req(kenji, "DELETE", `/me/spot-meetups/${m.id}`);
    expect(await spotNotifs()).toHaveLength(0);
  });

  it("retenue la nuit, puis la personne se désabonne avant la livraison : supprimée à la livraison", async () => {
    const { kenji, lea } = await world();
    await follow(lea, kenji);
    clock.set(at(23));
    await launch(kenji, { startsAt: at(9, 0, 11).toISOString(), endsAt: at(12, 0, 11).toISOString() });
    expect(await spotNotifs()).toHaveLength(1);
    await db.delete(userFollows).where(eq(userFollows.followerId, lea.id));
    clock.set(at(8, 5, 11));
    await notificationsService.deliverDue();
    expect(await spotNotifs()).toHaveLength(0);
  });

  it("retenue la nuit, livrée à 8 h si tout tient toujours", async () => {
    const { kenji, lea } = await world();
    await follow(lea, kenji);
    clock.set(at(23));
    await launch(kenji, { startsAt: at(9, 0, 11).toISOString(), endsAt: at(12, 0, 11).toISOString() });
    clock.set(at(8, 5, 11));
    await notificationsService.deliverDue();
    const [row] = await spotNotifs();
    expect(row?.deliveredAt).not.toBeNull();
  });
});

describe("effacement à la fin", () => {
  it("dès ends_at : plus de lieu servi (même avant la tâche), « terminé » ; la tâche efface lieu et liste", async () => {
    const { kenji, lea, nina } = await world();
    await follow(lea, kenji);
    await follow(nina, kenji);
    const m = await launch(kenji, { endsAt: new Date(clock.now.getTime() + HOUR).toISOString() });
    await req(lea, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" });
    await req(nina, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" });
    clock.advance(HOUR + MINUTE);
    // Avant la tâche : le lieu n'est déjà plus servi, ni à l'auteur ni aux invités.
    for (const u of [kenji, lea]) {
      const r = await req(u, "GET", `/spot-meetups/${m.id}`);
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ phase: "ended", place: null, myAnswer: null, yesCount: 0, cameCount: 2 });
      expect(r.text).not.toMatch(/Saint-Cyprien|42\.62/);
    }
    expect((await req(kenji, "GET", `/spot-meetups/${m.id}/replies`)).json.items).toHaveLength(0);
    expect((await req(lea, "GET", "/me/spot-meetups/incoming")).json.items).toHaveLength(0);

    const done = await spotMeetupsPurge.run();
    expect(done).toMatchObject({ purged: 1, deleted: 0 });
    const [row] = await db.select().from(spotMeetups).where(eq(spotMeetups.id, m.id));
    expect(row).toMatchObject({ placeLabel: "", lat: 0, lng: 0, cameCount: 2 });
    expect(row?.purgedAt).not.toBeNull();
    expect(await db.select().from(spotMeetupReplies)).toHaveLength(0);
    // Idempotente.
    expect(await spotMeetupsPurge.run()).toMatchObject({ purged: 0 });
    expect((await req(lea, "GET", `/spot-meetups/${m.id}`)).json).toMatchObject({ place: null, cameCount: 2 });
  });

  it("un rendez-vous en cours n'est pas touché par la tâche", async () => {
    const { kenji } = await world();
    const m = await launch(kenji);
    expect(await spotMeetupsPurge.run()).toMatchObject({ purged: 0 });
    expect((await req(kenji, "GET", `/spot-meetups/${m.id}`)).json.place).not.toBeNull();
  });

  it("les lignes effacées sont supprimées au bout de 30 jours", async () => {
    const { kenji } = await world();
    await launch(kenji, { endsAt: new Date(clock.now.getTime() + HOUR).toISOString() });
    clock.advance(2 * HOUR);
    await spotMeetupsPurge.run();
    expect(await db.select().from(spotMeetups)).toHaveLength(1);
    clock.advance(29 * 24 * HOUR);
    expect(await spotMeetupsPurge.run()).toMatchObject({ deleted: 0 });
    clock.advance(2 * 24 * HOUR);
    expect(await spotMeetupsPurge.run()).toMatchObject({ deleted: 1 });
    expect(await db.select().from(spotMeetups)).toHaveLength(0);
  });
});

describe("reçus, Accueil, Fil, onglet Spots", () => {
  it("incoming : seulement ceux des abonnements acceptés et de mes crews, en cours, pas le mien, pas les annulés", async () => {
    const { kenji, lea, nina, paul } = await world();
    await follow(paul, kenji);
    await follow(paul, lea, false);
    const crew = await newCrew(nina, [paul]);
    const a = await launch(kenji);
    await launch(lea);
    const c = await launch(nina, { audience: "crew", crewId: crew.id });
    const mine = await launch(paul);
    const res = await req(paul, "GET", "/me/spot-meetups/incoming");
    expect(res.status).toBe(200);
    expect(res.json.items.map((i: { id: string }) => i.id).sort()).toEqual([a.id, c.id].sort());
    expect(res.json.items.map((i: { id: string }) => i.id)).not.toContain(mine.id);
    expect(res.json.nextCursor).toBeNull();
    await req(kenji, "DELETE", `/me/spot-meetups/${a.id}`);
    expect((await req(paul, "GET", "/me/spot-meetups/incoming")).json.items).toHaveLength(1);
    expect((await req(paul, "GET", "/me/spot-meetups/incoming?cursor=n-importe-quoi")).status).toBe(400);
  });

  it("l'Accueil : le prochain reçu, sinon le mien, sinon rien ; masqué = pas calculé", async () => {
    const { kenji, paul, lea } = await world();
    await follow(paul, kenji);
    const empty = await req(paul, "GET", "/me/home");
    expect(empty.status).toBe(200);
    expect(empty.json.spotMeetup).toBeNull();
    const mineOnly = await launch(paul);
    expect((await req(paul, "GET", "/me/home")).json.spotMeetup).toMatchObject({
      others: 0,
      meetup: { id: mineOnly.id, mine: true },
    });
    await launch(kenji, { placeLabel: "Parking de la plage" });
    const home = (await req(paul, "GET", "/me/home")).json.spotMeetup;
    expect(home).toMatchObject({ others: 0, meetup: { mine: false, place: { label: "Parking de la plage" } } });
    expect((await req(lea, "GET", "/me/home")).json.spotMeetup).toBeNull();
    // Bloc masqué : jamais calculé, donc `null`.
    await req(paul, "PUT", "/me/home/widgets", { order: [], hidden: ["spot_meetup"] });
    expect((await req(paul, "GET", "/me/home")).json.spotMeetup).toBeNull();
  });

  it("le Fil : la carte arrive aux invités seulement (jamais à l'auteur ni à un inconnu), avec le lieu", async () => {
    const { kenji, lea, paul } = await world();
    await follow(lea, kenji);
    await launch(kenji);
    const cardOf = async (u: TestUser) =>
      (
        (await req(u, "GET", "/fil?filter=for_you")).json.items as {
          kind: string;
          payload: { meetup: { place: { label: string } } };
        }[]
      ).filter((c) => c.kind === "spot_meetup");
    const asLea = await cardOf(lea);
    expect(asLea).toHaveLength(1);
    expect(asLea[0]?.payload.meetup.place.label).toBe("Port de Saint-Cyprien");
    expect(await cardOf(kenji)).toHaveLength(0);
    expect(await cardOf(paul)).toHaveLength(0);
    // Le filtre « Mes abonnements » garde la carte d'un auteur suivi.
    const following = (await req(lea, "GET", "/fil?filter=following")).json.items as { kind: string }[];
    expect(following.filter((c) => c.kind === "spot_meetup")).toHaveLength(1);
    // Fini : plus de carte.
    clock.advance(3 * HOUR);
    expect(await cardOf(lea)).toHaveLength(0);
  });

  it("onglet Spots du crew : membres seulement ; actifs avec lieu, passés (30 jours) sans lieu ; compte écarté exclu", async () => {
    const { kenji, lea, paul } = await world();
    const crew = await newCrew(kenji, [lea]);
    const past = await launch(lea, {
      audience: "crew",
      crewId: crew.id,
      endsAt: new Date(clock.now.getTime() + HOUR).toISOString(),
    });
    clock.advance(2 * HOUR);
    await spotMeetupsPurge.run();
    const live = await launch(kenji, {
      audience: "crew",
      crewId: crew.id,
      startsAt: clock.now.toISOString(),
      endsAt: new Date(clock.now.getTime() + HOUR).toISOString(),
    });
    // Un rendez-vous « abonnés » ne figure pas dans l'onglet du crew.
    expect((await req(paul, "GET", `/crews/${crew.id}/spot-meetups`)).status).toBe(404);
    const res = await req(lea, "GET", `/crews/${crew.id}/spot-meetups`);
    expect(res.status).toBe(200);
    expect(res.json.active.map((m: { id: string }) => m.id)).toEqual([live.id]);
    expect(res.json.active[0].place).not.toBeNull();
    expect(res.json.past.map((m: { id: string }) => m.id)).toEqual([past.id]);
    expect(res.json.past[0]).toMatchObject({ place: null, phase: "ended" });
    expect(JSON.stringify(res.json.past)).not.toMatch(/Saint-Cyprien/);
    // Plus de 30 jours : plus dans la liste.
    clock.advance(31 * 24 * HOUR);
    const later = await req(lea, "GET", `/crews/${crew.id}/spot-meetups`);
    expect(later.json.past).toHaveLength(0);
    // Un crew dissous : 404.
    await db.update(crews).set({ deletedAt: clock.now }).where(eq(crews.id, crew.id));
    expect((await req(lea, "GET", `/crews/${crew.id}/spot-meetups`)).status).toBe(404);
  });

  it("onglet Spots : passés paginés par curseur, sans trou ni doublon", async () => {
    const { kenji } = await world();
    const crew = await newCrew(kenji);
    const base = at(8).getTime();
    await db.insert(spotMeetups).values(
      Array.from({ length: 25 }, (_, i) => ({
        authorId: kenji.id,
        audience: "crew" as const,
        crewId: crew.id,
        placeLabel: "",
        lat: 0,
        lng: 0,
        startsAt: new Date(base + i * 13 * HOUR - 2 * HOUR),
        endsAt: new Date(base + i * 13 * HOUR),
        purgedAt: new Date(base + i * 13 * HOUR),
        cameCount: i,
      })),
    );
    clock.set(new Date(base + 25 * 13 * HOUR));
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await req(kenji, "GET", `/crews/${crew.id}/spot-meetups${cursor ? `?cursor=${cursor}` : ""}`);
      expect(res.status).toBe(200);
      for (const m of res.json.past) seen.push(m.id);
      cursor = res.json.nextCursor;
      pages++;
    } while (cursor && pages < 5);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
  });

  it("audiences : abonnés acceptés, mes crews, mon rendez-vous actif", async () => {
    const { kenji, lea, nina } = await world();
    await follow(lea, kenji);
    await follow(nina, kenji, false);
    const crew = await newCrew(kenji, [lea]);
    const res = await req(kenji, "GET", "/me/spot-meetups/audiences");
    expect(res.json).toMatchObject({ followers: 1, crews: [{ id: crew.id, members: 2 }], activeMeetupId: null });
    const m = await launch(kenji);
    expect((await req(kenji, "GET", "/me/spot-meetups/audiences")).json.activeMeetupId).toBe(m.id);
    expect((await req(kenji, "GET", "/me/spot-meetups/active")).json.meetup.id).toBe(m.id);
    expect((await req(lea, "GET", "/me/spot-meetups/active")).json.meetup).toBeNull();
  });
});

describe("migration 0074 : les garde-fous en base", () => {
  it("12 h au plus, crew ↔ audience, un seul actif par auteur", async () => {
    const { kenji } = await world();
    const base = {
      authorId: kenji.id,
      audience: "followers" as const,
      placeLabel: "Quelque part",
      lat: 1,
      lng: 1,
      startsAt: at(10),
    };
    await expect(
      db.insert(spotMeetups).values({ ...base, endsAt: new Date(at(10).getTime() + 12 * HOUR + 1000) }),
    ).rejects.toThrow();
    await expect(db.insert(spotMeetups).values({ ...base, endsAt: at(10) })).rejects.toThrow();
    await expect(
      db.insert(spotMeetups).values({ ...base, audience: "crew", endsAt: new Date(at(10).getTime() + HOUR) }),
    ).rejects.toThrow();
    await db.insert(spotMeetups).values({ ...base, endsAt: new Date(at(10).getTime() + HOUR) });
    await expect(
      db.insert(spotMeetups).values({ ...base, endsAt: new Date(at(10).getTime() + 2 * HOUR) }),
    ).rejects.toThrow();
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(spotMeetups);
    expect(n?.n).toBe(1);
  });

  it("l'API de lancement limite le débit (6 par heure) sans jamais répondre 500", async () => {
    const { kenji } = await world();
    resetRateLimits();
    let last = 0;
    for (let i = 0; i < 8; i++) {
      const res = await req(kenji, "POST", "/me/spot-meetups", body());
      last = res.status;
      expect([201, 409, 429]).toContain(res.status);
    }
    expect(last).toBe(429);
  });
});

describe("tour 2 : le lieu ne sort jamais à qui n'a pas droit, ni après la fin", () => {
  const suspend = (u: TestUser) =>
    db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, u.id));
  const spotCards = async (u: TestUser) =>
    ((await req(u, "GET", "/fil?filter=for_you")).json.items as { kind: string }[]).filter(
      (c) => c.kind === "spot_meetup",
    );

  it("compte suspendu : ni Fil, ni Accueil, ni « mon rendez-vous », ni onglet Spots du crew", async () => {
    const { kenji, lea, nina } = await world();
    await follow(lea, kenji);
    const crew = await newCrew(nina, [lea]);
    await launch(kenji);
    await launch(nina, { audience: "crew", crewId: crew.id });
    // Avant la suspension, Léa voit tout.
    expect(await spotCards(lea)).toHaveLength(1);
    expect((await req(lea, "GET", `/crews/${crew.id}/spot-meetups`)).json.active).toHaveLength(1);
    expect((await req(nina, "GET", "/me/home")).json.spotMeetup).not.toBeNull();
    await suspend(lea);
    await suspend(nina);
    expect(await spotCards(lea)).toHaveLength(0);
    const crewList = await req(lea, "GET", `/crews/${crew.id}/spot-meetups`);
    expect(crewList.json).toMatchObject({ active: [], past: [], nextCursor: null });
    expect(crewList.text).not.toMatch(/Saint-Cyprien|42\.62/);
    expect((await req(lea, "GET", "/me/spot-meetups/incoming")).json.items).toHaveLength(0);
    // Nina suspendue : son propre rendez-vous n'est servi ni à l'Accueil ni par « mon rendez-vous ».
    const home = await req(nina, "GET", "/me/home");
    expect(home.json.spotMeetup).toBeNull();
    expect(home.text).not.toMatch(/Saint-Cyprien/);
    expect((await req(nina, "GET", "/me/spot-meetups/active")).json.meetup).toBeNull();
  });

  it("le mot disparaît avec le lieu : plus servi dès la fin, effacé à la purge et à l'annulation", async () => {
    const { kenji, lea } = await world();
    await follow(lea, kenji);
    const m = await launch(kenji, { note: "Devant le garage Dupont" });
    expect((await req(lea, "GET", `/spot-meetups/${m.id}`)).json.note).toBe("Devant le garage Dupont");
    clock.advance(2 * HOUR + MINUTE);
    for (const u of [kenji, lea]) {
      const r = await req(u, "GET", `/spot-meetups/${m.id}`);
      expect(r.json).toMatchObject({ note: null, place: null });
      expect(r.text).not.toMatch(/Dupont/);
    }
    await spotMeetupsPurge.run();
    const [row] = await db.select().from(spotMeetups).where(eq(spotMeetups.id, m.id));
    expect(row?.note).toBeNull();
    const n = await launch(kenji, {
      startsAt: clock.now.toISOString(),
      endsAt: new Date(clock.now.getTime() + HOUR).toISOString(),
      note: "Au fond du parking",
    });
    await req(kenji, "DELETE", `/me/spot-meetups/${n.id}`);
    const [gone] = await db.select().from(spotMeetups).where(eq(spotMeetups.id, n.id));
    expect(gone?.note).toBeNull();
  });

  it("livraison : un destinataire suspendu pendant la nuit ne reçoit rien, les autres oui", async () => {
    const { kenji, lea, nina } = await world();
    await follow(lea, kenji);
    await follow(nina, kenji);
    clock.set(at(23));
    await launch(kenji, { startsAt: at(9, 0, 11).toISOString(), endsAt: at(12, 0, 11).toISOString() });
    const rows = () => db.select().from(notifications).where(eq(notifications.type, "spot_meetup_new"));
    expect(await rows()).toHaveLength(2);
    await db
      .update(profiles)
      .set({ suspendedUntil: at(23, 0, 12) })
      .where(eq(profiles.userId, lea.id));
    clock.set(at(8, 5, 11));
    await notificationsService.deliverDue();
    const left = await rows();
    expect(left.map((r) => r.userId)).toEqual([nina.id]);
    expect(left[0]?.deliveredAt).not.toBeNull();
  });

  it("livraison : l'auteur suspendu pendant la nuit, aucune notification ne part", async () => {
    const { kenji, lea } = await world();
    await follow(lea, kenji);
    clock.set(at(23));
    await launch(kenji, { startsAt: at(9, 0, 11).toISOString(), endsAt: at(12, 0, 11).toISOString() });
    await db
      .update(profiles)
      .set({ suspendedUntil: at(23, 0, 12) })
      .where(eq(profiles.userId, kenji.id));
    clock.set(at(8, 5, 11));
    await notificationsService.deliverDue();
    expect(await db.select().from(notifications).where(eq(notifications.type, "spot_meetup_new"))).toHaveLength(0);
  });

  it("la purge et l'annulation effacent aussi « X vient » de l'Activité de l'auteur", async () => {
    const { kenji, lea } = await world();
    await follow(lea, kenji);
    const m = await launch(kenji);
    await req(lea, "PUT", `/spot-meetups/${m.id}/reply`, { answer: "yes" });
    const replyRows = () => db.select().from(notifications).where(eq(notifications.type, "spot_meetup_reply"));
    expect(await replyRows()).toHaveLength(1);
    clock.advance(2 * HOUR + MINUTE);
    await spotMeetupsPurge.run();
    expect(await replyRows()).toHaveLength(0);
    const n = await launch(kenji);
    await req(lea, "PUT", `/spot-meetups/${n.id}/reply`, { answer: "maybe" });
    expect(await replyRows()).toHaveLength(1);
    await req(kenji, "DELETE", `/me/spot-meetups/${n.id}`);
    expect(await replyRows()).toHaveLength(0);
  });

  it("une insertion qui échoue ne relance ni le nom du lieu ni ses coordonnées", async () => {
    const { kenji } = await world();
    const real = await viewerOf(kenji);
    // Un auteur sans compte en base : la clé étrangère refuse l'insertion, dont les paramètres portent le lieu.
    const ghost = { ...real, user: { ...real.user, id: "compte-fantome" } } as typeof real;
    let error: Error | null = null;
    try {
      await spotMeetupsService.create(
        ghost,
        body({ placeLabel: "Garage secret Dupont", lat: 42.123456, lng: 3.654321 }),
      );
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toMatch(/Rendez-vous non enregistré/);
    const everything = JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})) + String(error?.cause ?? "");
    expect(everything).not.toMatch(/Dupont|42\.123456|3\.654321/);
    expect(error?.cause).toBeUndefined();
  });

  it("rien d'un crew dans le Fil ; le rendez-vous de crew reste dans l'onglet Spots, l'Accueil et la notification", async () => {
    const { kenji, lea } = await world();
    const crew = await newCrew(kenji, [lea]);
    await follow(lea, kenji);
    const m = await launch(kenji, { audience: "crew", crewId: crew.id });
    expect(await spotCards(lea)).toHaveLength(0);
    expect((await req(lea, "GET", `/crews/${crew.id}/spot-meetups`)).json.active).toHaveLength(1);
    expect((await req(lea, "GET", "/me/home")).json.spotMeetup).toMatchObject({ meetup: { audience: "crew" } });
    expect(await db.select().from(notifications).where(eq(notifications.type, "spot_meetup_new"))).toHaveLength(1);
    // Un rendez-vous pour « mes abonnés » arrive bien dans le Fil.
    await req(kenji, "DELETE", `/me/spot-meetups/${m.id}`);
    await launch(kenji);
    expect(await spotCards(lea)).toHaveLength(1);
  });

  it("« Qui vient ? » au-delà de 50 : pages par curseur, identifiants de compte non UUID, sans trou ni doublon", async () => {
    const { kenji } = await world();
    const m = await launch(kenji);
    const fans: TestUser[] = [];
    for (let i = 0; i < 53; i += 10) {
      fans.push(
        ...(await Promise.all(
          Array.from({ length: Math.min(10, 53 - i) }, (_, j) => signUp(`Fan${String(i + j).padStart(2, "0")}`)),
        )),
      );
    }
    expect(fans[0]?.id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    for (const [i, f] of fans.entries()) {
      await db.insert(spotMeetupReplies).values({
        meetupId: m.id,
        userId: f.id,
        answer: i % 3 === 0 ? "maybe" : "yes",
        answeredAt: new Date(clock.now.getTime() + i * 1000),
      });
    }
    const first = await req(kenji, "GET", `/spot-meetups/${m.id}/replies`);
    expect(first.status).toBe(200);
    expect(first.json.items).toHaveLength(50);
    expect(first.json.nextCursor).toEqual(expect.any(String));
    const second = await req(
      kenji,
      "GET",
      `/spot-meetups/${m.id}/replies?cursor=${encodeURIComponent(first.json.nextCursor)}`,
    );
    expect(second.status, second.text).toBe(200);
    expect(second.json.items).toHaveLength(3);
    expect(second.json.nextCursor).toBeNull();
    const pseudos = [...first.json.items, ...second.json.items].map(
      (i: { person: { pseudo: string } }) => i.person.pseudo,
    );
    expect(new Set(pseudos).size).toBe(53);
    // Un curseur de liste de rendez-vous n'ouvre pas la liste des réponses, et inversement.
    const other = Buffer.from(`m|${clock.now.toISOString()}|${m.id}`).toString("base64url");
    expect((await req(kenji, "GET", `/spot-meetups/${m.id}/replies?cursor=${other}`)).status).toBe(400);
    expect(
      (await req(kenji, "GET", `/me/spot-meetups/incoming?cursor=${encodeURIComponent(first.json.nextCursor)}`)).status,
    ).toBe(400);
  });
});
