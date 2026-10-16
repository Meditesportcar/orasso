// Avis après l'événement (lot 12) : participant pointé, fenêtre d'une semaine, un avis par événement, réponse de
// l'organisateur, moyenne à partir de 3 avis, avis masqué par la modération, horloge simulée.
import { type Decide, fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

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
import { events, reviews } from "../../db/schema";
import type { Viewer } from "../../lib/session";
import { applicationsService } from "../applications/service";
import { checkinsService } from "../checkins/service";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0, year = 2026) =>
  fromWallTime({ year, month, day, hour, minute });

// Rassemblement le samedi 17 octobre 2026, 10:00–18:00 : avis possibles jusqu'au samedi 24 à 18:00.
const STARTS = paris(10, 17, 10);
const ENDS = paris(10, 17, 18);
const ACCEPT: Decide = { decision: "accept", sendReasons: true, note: null };

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let other: TestUser;
let staff: TestUser;
let eventId: string;
let slug: string;
/** Quatre pointés (a, b, c, d) et un retenu absent. */
let people: Record<"a" | "b" | "c" | "d" | "absent", { u: TestUser; v: Viewer; applicationId: string }>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 10, 12));
  const ref = await seedReference();
  orga = await signUp("Damien_66", { twoFactor: true });
  const orgaV = await viewerOf(orga);
  other = await signUp("Autre_Orga", { twoFactor: true });
  await createStructure(other.id);
  const structureId = (await createStructure(orga.id)).id;
  staff = await signUp("Julie_66");
  await addMember(structureId, staff.id, "staff", ["scan"]);
  const staffV = await viewerOf(staff);
  const event = await createEvent(structureId, { startsAt: STARTS, endsAt: ENDS, capacity: 10 });
  eventId = event.id;
  slug = event.slug;
  people = {} as typeof people;
  for (const key of ["a", "b", "c", "d", "absent"] as const) {
    const u = await signUp(`Pilote_${key}`);
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
    await applicationsService.decide(orgaV, eventId, app!.id, ACCEPT);
    people[key] = { u, v, applicationId: app!.id };
  }
  clock.set(paris(10, 17, 11));
  for (const key of ["a", "b", "c", "d"] as const) {
    await checkinsService.create(staffV, eventId, {
      applicationId: people[key].applicationId,
      method: "manual",
      note: null,
    });
  }
});

const review = (key: keyof typeof people, rating: number, comment = "Accueil au top, parking bien organisé.") =>
  call(people[key].u, "POST", `/applications/${people[key].applicationId}/review`, { rating, comment });

describe("avis après l'événement", () => {
  it("fenêtre : pas avant la fin, jusqu'à J+7, puis fermé (carnet de route à jour)", async () => {
    expect((await review("a", 3)).status).toBe(423); // pendant l'événement
    const during = (await call(people.a.u, "GET", "/me/applications?scope=upcoming")).json[0];
    expect(during.review).toMatchObject({ canReview: false, given: null });

    clock.set(paris(10, 24, 18)); // J+7 pile
    const card = (await call(people.a.u, "GET", "/me/applications?scope=past")).json[0];
    expect(card.review).toMatchObject({ canReview: true, given: null, deadline: paris(10, 24, 18).toISOString() });
    expect((await review("a", 3)).status).toBe(201);
    const after = (await call(people.a.u, "GET", "/me/applications?scope=past")).json[0];
    expect(after.review).toMatchObject({ canReview: false, given: { rating: 3, reply: null } });

    clock.set(paris(10, 24, 18, 1));
    const late = await review("b", 2);
    expect(late.status).toBe(423);
    expect(late.json.error.details.deadline).toBe(paris(10, 24, 18).toISOString());
  });

  it("réservé aux participants pointés, à leur propre candidature ; un seul avis par événement", async () => {
    clock.set(paris(10, 18, 9));
    const absent = await review("absent", 1, "Je n'y étais pas.");
    expect(absent.status).toBe(403);
    expect((await call(people.absent.u, "GET", "/me/applications?scope=past")).json[0].review).toBeNull();
    // La candidature d'un autre : introuvable.
    const stolen = await call(people.b.u, "POST", `/applications/${people.a.applicationId}/review`, {
      rating: 1,
      comment: "Usurpation",
    });
    expect(stolen.status).toBe(404);
    expect((await call(null, "POST", `/applications/${people.a.applicationId}/review`, {})).status).toBe(401);
    // Commentaire obligatoire, note de 1 à 3.
    expect((await review("a", 3, "  ")).status).toBe(400);
    expect((await review("a", 4)).status).toBe(400);
    expect((await review("a", 2)).status).toBe(201);
    const again = await review("a", 3);
    expect(again.status).toBe(409);
    expect(await db.query.reviews.findMany({ where: eq(reviews.eventId, eventId) })).toHaveLength(1);
  });

  it("page publique : pseudo, note, commentaire ; moyenne à partir de 3 avis ; rien d'autre sur l'auteur", async () => {
    clock.set(paris(10, 18, 9));
    await review("a", 3);
    await review("b", 2);
    let list = (await call(null, "GET", `/events/by-slug/${slug}/reviews`)).json;
    expect(list).toMatchObject({ count: 2, average: null, minForAverage: 3 });
    expect(Object.keys(list.items[0]).sort()).toEqual(["comment", "createdAt", "id", "pseudo", "rating", "reply"]);
    expect(list.items.map((i: { pseudo: string }) => i.pseudo).sort()).toEqual([people.a.u.pseudo, people.b.u.pseudo]);
    await review("c", 2);
    list = (await call(null, "GET", `/events/by-slug/${slug}/reviews`)).json;
    expect(list).toMatchObject({ count: 3, average: 2.3 });
    // Brouillon : introuvable comme sa page.
    await db.update(events).set({ status: "draft" }).where(eq(events.id, eventId));
    expect((await call(null, "GET", `/events/by-slug/${slug}/reviews`)).status).toBe(404);
  });

  it("droit de réponse public de l'organisateur ; ni le staff, ni une autre structure, ni l'auteur", async () => {
    clock.set(paris(10, 18, 9));
    const created = (await review("a", 1, "Trop d'attente à l'entrée.")).json;
    const body = { reply: "Merci, on ouvre une deuxième file l'an prochain." };
    expect((await call(staff, "PUT", `/reviews/${created.id}/reply`, body)).status).toBe(403);
    expect((await call(other, "PUT", `/reviews/${created.id}/reply`, body)).status).toBe(403);
    expect((await call(people.a.u, "PUT", `/reviews/${created.id}/reply`, body)).status).toBe(403);
    expect((await call(staff, "GET", `/events/${eventId}/reviews`)).status).toBe(403);
    const replied = await call(orga, "PUT", `/reviews/${created.id}/reply`, body);
    expect(replied.status).toBe(200);
    expect(replied.json.reply).toMatchObject({ text: body.reply });
    const pub = (await call(null, "GET", `/events/by-slug/${slug}/reviews`)).json;
    expect(pub.items[0].reply.text).toBe(body.reply);
    const orgaList = (await call(orga, "GET", `/events/${eventId}/reviews`)).json;
    expect(orgaList.items[0]).toMatchObject({ id: created.id, reply: { text: body.reply } });
    const card = (await call(people.a.u, "GET", "/me/applications?scope=past")).json[0];
    expect(card.review.given).toMatchObject({ rating: 1, reply: body.reply });
  });

  it("avis masqué par la modération : ni affiché, ni compté, plus de réponse possible", async () => {
    clock.set(paris(10, 18, 9));
    const hidden = (await review("a", 1)).json;
    await review("b", 3);
    await review("c", 3);
    await review("d", 3);
    expect((await call(null, "GET", `/events/by-slug/${slug}/reviews`)).json).toMatchObject({ count: 4, average: 2.5 });
    await db.update(reviews).set({ hiddenAt: clock.now }).where(eq(reviews.id, hidden.id));
    expect((await call(null, "GET", `/events/by-slug/${slug}/reviews`)).json).toMatchObject({ count: 3, average: 3 });
    expect((await call(orga, "PUT", `/reviews/${hidden.id}/reply`, { reply: "…" })).status).toBe(404);
  });
});
