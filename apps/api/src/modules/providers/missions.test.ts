// Lot 46 : prestataires v2 — besoins de l'organisateur (missions), missions du prestataire par métier et distance,
// candidature sur une mission, emplacement attribué, avis des organisateurs, vitrine, anonymisation.
import { randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
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
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  applications,
  assistanceRequests,
  events,
  notifications,
  providerPhotos,
  providerReviews,
  structures,
  ticketTypes,
} from "../../db/schema";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });
const DAY = 86_400_000;
const ACCEPT = { decision: "accept", sendReasons: true, note: null } as const;

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let structureId: string;
let nocturneId: string;
let rivesaltesId: string;
let toulouseId: string;
let sofia: TestUser;
let sofiaProviderId: string;

/** Prestataire prêt à candidater (profil + une photo). */
async function readyProvider(u: TestUser, over: Record<string, unknown> = {}) {
  const res = await call(u, "PUT", "/me/provider-profile", {
    type: "food_truck",
    name: "La Brasa",
    departments: ["66", "11"],
    ...over,
  });
  expect(res.status).toBe(200);
  await db.insert(providerPhotos).values({ providerId: res.json.id, storageKey: `providers/${res.json.id}/x.webp` });
  return res.json.id as string;
}

const addNeed = async (eventId: string, body: Record<string, unknown> = {}) => {
  const res = await call(orga, "POST", `/events/${eventId}/needs`, { trade: "food_truck", ...body });
  expect(res.status).toBe(201);
  return res.json as { id: string; remaining: number; quantity: number };
};

const applyTo = (u: TestUser, eventId: string, needId?: string | null) =>
  call(u, "POST", `/events/${eventId}/provider-applications`, { rulesAccepted: true, message: null, needId });

async function acceptedOn(u: TestUser, eventId: string, needId?: string) {
  const app = await applyTo(u, eventId, needId);
  expect(app.status).toBe(201);
  const decided = await call(orga, "POST", `/events/${eventId}/applications/${app.json.id}/decide`, ACCEPT);
  expect(decided.status).toBe(200);
  return app.json.id as string;
}

const notifsOf = (userId: string, type: string) =>
  db.query.notifications.findMany({ where: and(eq(notifications.userId, userId), eq(notifications.type, type)) });

/**
 * Nocturne (Canet, 17/10), Expo (Rivesaltes, 24/10), Toulouse (31/10, loin du 66). Sofia : food truck « La Brasa »,
 * zone 66 puis 11. Aucun événement n'attend de food truck au départ (`vendor_types`) : c'est le besoin qui l'ajoute.
 */
beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 10, 12));
  orga = await signUp("Damien_66", { twoFactor: true });
  structureId = (await createStructure(orga.id)).id;
  const at = (slug: string, title: string, day: number, place: Partial<typeof events.$inferInsert>) =>
    createEvent(structureId, {
      slug,
      title,
      startsAt: paris(10, day, 19),
      endsAt: paris(10, day, 23),
      vendorTypes: ["Photographe"],
      ...place,
    });
  nocturneId = (await at("nocturne", "Nocturne de Canet", 17, { department: "66", lat: 42.7046, lng: 3.0352 })).id;
  rivesaltesId = (await at("expo-rivesaltes", "Expo Rivesaltes", 24, { department: "66", lat: 42.769, lng: 2.8728 }))
    .id;
  toulouseId = (await at("toulouse", "Rassemblement de Toulouse", 31, { department: "31", lat: 43.6, lng: 1.44 })).id;
  sofia = await signUp("Sofia_66");
  sofiaProviderId = await readyProvider(sofia);
});

describe("besoins de l'organisateur", () => {
  it("créer, lister, modifier, supprimer ; le métier rejoint les types attendus ; 403 aux autres", async () => {
    const created = await call(orga, "POST", `/events/${nocturneId}/needs`, {
      trade: "food_truck",
      quantity: 1,
      power: "a16",
      installAt: paris(10, 17, 16).toISOString(),
    });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ trade: "food_truck", quantity: 1, filled: 0, remaining: 1, power: "a16" });
    const event = await db.query.events.findFirst({ where: eq(events.id, nocturneId) });
    expect(event?.vendorTypes).toEqual(["Photographe", "Food truck"]);

    const list = await call(orga, "GET", `/events/${nocturneId}/needs`);
    expect(list.json).toHaveLength(1);
    expect((await call(sofia, "GET", `/events/${nocturneId}/needs`)).status).toBe(403);
    expect((await call(null, "GET", `/events/${nocturneId}/needs`)).status).toBe(401);
    expect((await call(sofia, "POST", `/events/${nocturneId}/needs`, { trade: "food_truck" })).status).toBe(403);
    const needId = created.json.id;
    expect((await call(sofia, "PATCH", `/events/${nocturneId}/needs/${needId}`, { quantity: 3 })).status).toBe(403);
    expect((await call(sofia, "DELETE", `/events/${nocturneId}/needs/${needId}`)).status).toBe(403);

    const patched = await call(orga, "PATCH", `/events/${nocturneId}/needs/${needId}`, { quantity: 2, water: true });
    expect(patched.json).toMatchObject({ quantity: 2, water: true, power: "a16", remaining: 2 });
    // Un besoin d'un autre événement n'existe pas pour celui-ci.
    expect((await call(orga, "PATCH", `/events/${rivesaltesId}/needs/${needId}`, { quantity: 1 })).status).toBe(404);
    expect(
      (await call(orga, "POST", `/events/${nocturneId}/needs`, { trade: "food_truck", quantity: 10 })).status,
    ).toBe(400);

    // Supprimé : la candidature qui y répondait reste, sans mission.
    const app = await applyTo(sofia, nocturneId, needId);
    expect(app.status).toBe(201);
    expect((await call(orga, "DELETE", `/events/${nocturneId}/needs/${needId}`)).status).toBe(204);
    const row = await db.query.applications.findFirst({ where: eq(applications.id, app.json.id) });
    expect(row).toMatchObject({ status: "pending", needId: null });
    expect((await call(orga, "GET", `/events/${nocturneId}/needs`)).json).toEqual([]);
  });

  it("un événement terminé ne change plus de besoins ; la fiche publique montre ce qui est cherché", async () => {
    const need = await addNeed(nocturneId, { quantity: 2, power: "generator_ok", notes: "Prise au poteau" });
    const pub = await call(null, "GET", "/events/by-slug/nocturne/needs");
    expect(pub.status).toBe(200);
    expect(pub.json).toEqual([
      expect.objectContaining({ id: need.id, quantity: 2, remaining: 2, power: "generator_ok" }),
    ]);
    expect(pub.json[0].notes).toBeUndefined();
    expect(pub.json[0].filled).toBeUndefined();
    clock.set(paris(10, 18, 10));
    expect((await call(orga, "POST", `/events/${nocturneId}/needs`, { trade: "barber" })).status).toBe(409);
    expect((await call(orga, "DELETE", `/events/${nocturneId}/needs/${need.id}`)).status).toBe(409);
  });
});

describe("missions du prestataire", () => {
  it("filtre par métier et par rayon, du plus proche au plus loin ; un besoin comblé disparaît", async () => {
    const nocturneNeed = await addNeed(nocturneId, { quantity: 1, power: "a16" });
    const expoNeed = await addNeed(rivesaltesId, { quantity: 2, power: "a16", water: true });
    await addNeed(rivesaltesId, { trade: "barber" });
    await addNeed(toulouseId);

    const res = await call(sofia, "GET", "/missions");
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ trade: "food_truck", radiusKm: 80, from: "66" });
    // Depuis le centre du 66 : Rivesaltes (≈ 34 km) avant Canet (≈ 44 km) ; Toulouse est hors du rayon.
    expect(res.json.items.map((m: { slug: string }) => m.slug)).toEqual(["expo-rivesaltes", "nocturne"]);
    expect(res.json.items[0]).toMatchObject({
      distanceKm: 34,
      structureName: "Club de test",
      needs: [{ id: expoNeed.id, quantity: 2, remaining: 2, water: true, power: "a16" }],
      myApplication: null,
    });
    const barbers = await call(sofia, "GET", "/missions?trade=barber");
    expect(barbers.json.items.map((m: { slug: string }) => m.slug)).toEqual(["expo-rivesaltes"]);
    const wide = await call(sofia, "GET", "/missions?radiusKm=500");
    expect(wide.json.items.map((m: { slug: string }) => m.slug)).toEqual(["expo-rivesaltes", "nocturne", "toulouse"]);
    const fromAude = await call(sofia, "GET", "/missions?from=31&radiusKm=60");
    expect(fromAude.json.items.map((m: { slug: string }) => m.slug)).toEqual(["toulouse"]);

    // Léa est retenue sur la Nocturne (besoin comblé) et sur une des deux places de Rivesaltes.
    const lea = await signUp("Lea_Truck");
    await readyProvider(lea, { name: "La Caravane" });
    await acceptedOn(lea, nocturneId, nocturneNeed.id);
    await acceptedOn(lea, rivesaltesId, expoNeed.id);
    const after = await call(sofia, "GET", "/missions");
    expect(after.json.items.map((m: { slug: string }) => m.slug)).toEqual(["expo-rivesaltes"]);
    expect(after.json.items[0].needs[0]).toMatchObject({ quantity: 2, filled: 1, remaining: 1 });

    // Ma candidature apparaît sur la carte.
    const mine = await applyTo(sofia, rivesaltesId, expoNeed.id);
    const withMine = await call(sofia, "GET", "/missions");
    expect(withMine.json.items[0].myApplication).toEqual({ id: mine.json.id, status: "pending", needId: expoNeed.id });
  });

  it("visiteurs attendus : places de la billetterie Orasso ouverte", async () => {
    await addNeed(rivesaltesId);
    await db.update(events).set({ ticketsEnabled: true }).where(eq(events.id, rivesaltesId));
    await db.insert(ticketTypes).values({ eventId: rivesaltesId, name: "Entrée", capacity: 800, priceCents: 0 });
    const res = await call(sofia, "GET", "/missions");
    expect(res.json.items[0]).toMatchObject({ slug: "expo-rivesaltes", expectedVisitors: 800 });
  });
});

describe("candidature sur une mission", () => {
  it("mission d'un autre événement ou inconnue → 400, autre métier → 400, comblée → 409 ; l'organisateur est prévenu", async () => {
    const need = await addNeed(nocturneId, { quantity: 1 });
    const barber = await addNeed(nocturneId, { trade: "barber" });
    const elsewhere = await addNeed(rivesaltesId);

    const unknown = await applyTo(sofia, nocturneId, randomUUID());
    expect(unknown.status).toBe(400);
    expect(unknown.json.error.details).toMatchObject({ reason: "need_invalid" });
    expect((await applyTo(sofia, nocturneId, elsewhere.id)).status).toBe(400);
    const otherTrade = await applyTo(sofia, nocturneId, barber.id);
    expect(otherTrade.status).toBe(400);
    expect(otherTrade.json.error.details).toMatchObject({ reason: "need_trade" });
    expect(
      (await call(sofia, "POST", `/events/${nocturneId}/provider-applications`, { rulesAccepted: true, needId: "x" }))
        .status,
    ).toBe(400);

    const ok = await applyTo(sofia, nocturneId, need.id);
    expect(ok.status).toBe(201);
    expect(ok.json).toMatchObject({ status: "pending", need: { id: need.id, trade: "food_truck" }, spot: null });
    expect(await notifsOf(orga.id, "need_application_received")).toHaveLength(1);

    // Comblée par Sofia : Léa ne peut plus y répondre.
    await call(orga, "POST", `/events/${nocturneId}/applications/${ok.json.id}/decide`, ACCEPT);
    const lea = await signUp("Lea_Truck");
    await readyProvider(lea, { name: "La Caravane" });
    expect((await applyTo(lea, nocturneId, need.id)).status).toBe(409);
  });
});

describe("emplacement", () => {
  it("409 tant que la candidature n'est pas retenue ; ensuite prévenu avec emplacement, arrivée, électricité et consignes", async () => {
    await db.update(events).set({ instructions: "Entrée par le quai nord." }).where(eq(events.id, nocturneId));
    const need = await addNeed(nocturneId, { power: "a16", installAt: paris(10, 17, 16).toISOString() });
    const app = await applyTo(sofia, nocturneId, need.id);
    const spot = { spotLabel: "B2", spotNote: "Près de l'entrée" };
    expect((await call(orga, "PATCH", `/events/${nocturneId}/applications/${app.json.id}/spot`, spot)).status).toBe(
      409,
    );
    await call(orga, "POST", `/events/${nocturneId}/applications/${app.json.id}/decide`, ACCEPT);

    // Un autre organisateur (autre structure) ou le prestataire lui-même : refusé.
    const other = await signUp("Autre_Orga", { twoFactor: true });
    await createStructure(other.id);
    expect((await call(other, "PATCH", `/events/${nocturneId}/applications/${app.json.id}/spot`, spot)).status).toBe(
      403,
    );
    expect((await call(sofia, "PATCH", `/events/${nocturneId}/applications/${app.json.id}/spot`, spot)).status).toBe(
      403,
    );
    expect(
      (
        await call(orga, "PATCH", `/events/${nocturneId}/applications/${app.json.id}/spot`, {
          spotLabel: "B2-TRES-LONG" + "X",
        })
      ).status,
    ).toBe(400);

    const res = await call(orga, "PATCH", `/events/${nocturneId}/applications/${app.json.id}/spot`, spot);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ spotLabel: "B2", spotNote: "Près de l'entrée" });
    const [n] = await notifsOf(sofia.id, "provider_spot_assigned");
    expect(n?.body).toBe(
      "Emplacement B2 · arrivée 16 h · électricité 16 A · Près de l'entrée.\n\nEntrée par le quai nord.",
    );

    const mine = await call(sofia, "GET", "/me/provider-applications");
    expect(mine.json[0]).toMatchObject({
      status: "accepted",
      spot: { label: "B2", note: "Près de l'entrée" },
      installAt: paris(10, 17, 16).toISOString(),
      power: "a16",
      instructions: "Entrée par le quai nord.",
      review: null,
    });
  });
});

describe("avis des organisateurs", () => {
  // Candidatures sans mission : les événements attendent des food trucks.
  beforeEach(async () => {
    await db.update(events).set({ vendorTypes: ["Food truck"] });
  });

  it("après la fin seulement, une fois, dans les 30 jours ; moyenne et derniers sur la vitrine", async () => {
    const appId = await acceptedOn(sofia, nocturneId);
    const lea = await signUp("Lea_Truck");
    await readyProvider(lea, { name: "La Caravane" });
    const pending = await applyTo(lea, nocturneId);
    const review = { rating: 5, comment: "Service rapide jusqu'à la fin. On la reprend." };

    const early = await call(orga, "POST", `/events/${nocturneId}/applications/${appId}/provider-review`, review);
    expect(early.status).toBe(409);
    expect(early.json.error.details).toMatchObject({ reason: "not_ended" });

    clock.set(paris(10, 18, 10));
    expect(
      (await call(sofia, "POST", `/events/${nocturneId}/applications/${appId}/provider-review`, review)).status,
    ).toBe(403);
    expect(
      (await call(orga, "POST", `/events/${nocturneId}/applications/${pending.json.id}/provider-review`, review))
        .status,
    ).toBe(409);
    expect(
      (await call(orga, "POST", `/events/${nocturneId}/applications/${appId}/provider-review`, { rating: 6 })).status,
    ).toBe(400);
    const ok = await call(orga, "POST", `/events/${nocturneId}/applications/${appId}/provider-review`, review);
    expect(ok.status).toBe(201);
    expect(ok.json).toMatchObject({
      rating: 5,
      structureName: "Club de test",
      eventTitle: "Nocturne de Canet",
    });
    // La vue publique ne nomme jamais l'auteur : l'avis engage la structure.
    expect(ok.json.authorName).toBeUndefined();
    expect(await notifsOf(sofia.id, "provider_review_received")).toHaveLength(1);
    const dup = await call(orga, "POST", `/events/${nocturneId}/applications/${appId}/provider-review`, review);
    expect(dup.status).toBe(409);
    expect(dup.json.error.details).toMatchObject({ reason: "duplicate" });

    // Rivesaltes : retenue, mais l'avis arrive 31 jours après la fin.
    clock.set(paris(10, 20, 10));
    const second = await acceptedOn(sofia, rivesaltesId);
    clock.set(new Date(paris(10, 24, 23).getTime() + 31 * DAY));
    const late = await call(orga, "POST", `/events/${rivesaltesId}/applications/${second}/provider-review`, {
      rating: 4,
    });
    expect(late.status).toBe(409);
    expect(late.json.error.details).toMatchObject({ reason: "window_closed" });
    clock.set(new Date(paris(10, 24, 23).getTime() + 29 * DAY));
    expect(
      (await call(orga, "POST", `/events/${rivesaltesId}/applications/${second}/provider-review`, { rating: 4 }))
        .status,
    ).toBe(201);

    const summary = await call(sofia, "GET", `/providers/${sofiaProviderId}/reviews`);
    expect(summary.json).toMatchObject({ average: 4.5, count: 2 });
    expect(summary.json.latest.map((r: { rating: number }) => r.rating)).toEqual([4, 5]);
    const vitrine = await call(await signUp("Kenji_66"), "GET", `/providers/${sofiaProviderId}`);
    expect(vitrine.json.reviews).toMatchObject({ average: 4.5, count: 2 });
    const mine = await call(sofia, "GET", "/me/provider-applications?scope=past");
    expect(mine.json.map((a: { review: { rating: number } | null }) => a.review?.rating)).toEqual([4, 5]);
    expect(mine.json[1].review.authorName).toBe("Damien_66");
    expect(summary.json.latest[0].authorName).toBeUndefined();

    // Un avis retiré par la modération ne compte plus.
    await db.update(providerReviews).set({ hiddenAt: new Date() }).where(eq(providerReviews.rating, 4));
    expect((await call(sofia, "GET", `/providers/${sofiaProviderId}/reviews`)).json).toMatchObject({
      average: 5,
      count: 1,
    });
  });

  it("compte de l'auteur supprimé : l'avis reste, signé « Compte supprimé »", async () => {
    const coOrga = await signUp("Sarah_66", { twoFactor: true });
    await addMember(structureId, coOrga.id, "co_organizer");
    const appId = await acceptedOn(sofia, nocturneId);
    clock.set(paris(10, 19, 10));
    const ok = await call(coOrga, "POST", `/events/${nocturneId}/applications/${appId}/provider-review`, { rating: 5 });
    expect(ok.status).toBe(201);
    expect((await call(sofia, "GET", "/me/provider-applications?scope=past")).json[0].review.authorName).toBe(
      "Sarah_66",
    );
    await accountService.anonymize(coOrga.id, null);
    const summary = await call(sofia, "GET", `/providers/${sofiaProviderId}/reviews`);
    expect(summary.json).toMatchObject({ count: 1, latest: [{ rating: 5, structureName: "Club de test" }] });
    const mine = await call(sofia, "GET", "/me/provider-applications?scope=past");
    expect(mine.json[0].review).toMatchObject({ rating: 5, authorName: "Compte supprimé" });
  });
});

describe("vitrine", () => {
  it("menu mal formé → 400 avec la ligne ; menu lu, métiers, besoins, rayon ; un champ absent reste tel quel", async () => {
    const bad = await call(sofia, "PUT", "/me/provider-profile", {
      type: "food_truck",
      name: "La Brasa",
      menu: "Bocata de botifarra · 9 €\nFrites maison",
    });
    expect(bad.status).toBe(400);
    expect(bad.json.error.details.fields.menu).toMatch(/^Ligne 2/);

    const ok = await call(sofia, "PUT", "/me/provider-profile", {
      type: "food_truck",
      name: "La Brasa",
      departments: ["66", "11"],
      trades: ["animation"],
      tagline: "Grillades catalanes",
      teamSize: 2,
      menu: "Bocata de botifarra · 9 €\nBrochettes catalanes · 11 €\nFrites maison 4€\nCrema catalana · 4 €",
      powerNeed: "a16",
      frontageM: 6,
      waterNeed: false,
      radiusKm: 80,
    });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({
      trades: ["food_truck", "animation"],
      tagline: "Grillades catalanes",
      teamSize: 2,
      menuRange: { min: 400, max: 1100 },
      powerNeed: "a16",
      frontageM: 6,
      waterNeed: false,
      radiusKm: 80,
    });
    expect(ok.json.menu).toHaveLength(4);
    expect(ok.json.menuText.split("\n")[0]).toBe("Bocata de botifarra · 9 €");

    // Un ancien client qui n'envoie pas la vitrine ne l'efface pas.
    const kept = await call(sofia, "PUT", "/me/provider-profile", { type: "food_truck", name: "La Brasa 66" });
    expect(kept.json).toMatchObject({ name: "La Brasa 66", tagline: "Grillades catalanes", frontageM: 6 });
    expect(kept.json.menu).toHaveLength(4);

    const pub = await call(await signUp("Kenji_66"), "GET", `/providers/${sofiaProviderId}`);
    expect(pub.json).toMatchObject({
      tagline: "Grillades catalanes",
      powerNeed: "a16",
      reviews: { count: 0, average: null },
    });
    expect(pub.json.phone).toBeUndefined();
  });
});

// --- Corrections de la relecture (lot 46) --------------------------------------------------------------------------

describe("droits : structure suspendue, assistance, auto-évaluation, staff", () => {
  beforeEach(async () => {
    await db.update(events).set({ vendorTypes: ["Food truck"] });
  });

  it("structure suspendue : besoins en lecture seule ; l'emplacement reste permis (comme le tri)", async () => {
    const need = await addNeed(nocturneId);
    const appId = await acceptedOn(sofia, nocturneId, need.id);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, structureId));
    expect((await call(orga, "GET", `/events/${nocturneId}/needs`)).status).toBe(200);
    expect((await call(orga, "POST", `/events/${nocturneId}/needs`, { trade: "barber" })).status).toBe(403);
    expect((await call(orga, "PATCH", `/events/${nocturneId}/needs/${need.id}`, { quantity: 2 })).status).toBe(403);
    expect((await call(orga, "DELETE", `/events/${nocturneId}/needs/${need.id}`)).status).toBe(403);
    expect(
      (await call(orga, "PATCH", `/events/${nocturneId}/applications/${appId}/spot`, { spotLabel: "B2" })).status,
    ).toBe(200);
  });

  it("super admin en assistance : jamais d'avis au nom de la structure (403)", async () => {
    const appId = await acceptedOn(sofia, nocturneId);
    clock.set(paris(10, 18, 10));
    const admin = await signUp("Admin_Orasso", { twoFactor: true, role: "super_admin" });
    await db
      .insert(assistanceRequests)
      .values({ structureId, requestedBy: orga.id, message: "Aide", createdAt: clock.now });
    const res = await call(admin, "POST", `/events/${nocturneId}/applications/${appId}/provider-review`, { rating: 5 });
    expect(res.status).toBe(403);
    expect(res.json.error.message).toMatch(/organisateur de la structure/);
  });

  it("événement annulé : pas d'avis (409 event_cancelled)", async () => {
    const appId = await acceptedOn(sofia, nocturneId);
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, nocturneId));
    clock.set(paris(10, 18, 10));
    const res = await call(orga, "POST", `/events/${nocturneId}/applications/${appId}/provider-review`, { rating: 5 });
    expect(res.status).toBe(409);
    expect(res.json.error.details).toMatchObject({ reason: "event_cancelled" });
  });

  it("auto-évaluation : prestataire membre de la structure organisatrice → 403, pour lui comme pour le propriétaire", async () => {
    const sarah = await signUp("Sarah_66", { twoFactor: true });
    await addMember(structureId, sarah.id, "co_organizer");
    await readyProvider(sarah, { name: "Chez Sarah" });
    const appId = await acceptedOn(sarah, nocturneId);
    clock.set(paris(10, 18, 10));
    const byHerself = await call(sarah, "POST", `/events/${nocturneId}/applications/${appId}/provider-review`, {
      rating: 5,
    });
    expect(byHerself.status).toBe(403);
    const byOwner = await call(orga, "POST", `/events/${nocturneId}/applications/${appId}/provider-review`, {
      rating: 5,
    });
    expect(byOwner.status).toBe(403);
    expect(byOwner.json.error.message).toMatch(/propre structure/);
    expect(await db.query.providerReviews.findMany()).toEqual([]);
  });

  it("le staff de l'événement lit les besoins, ne les modifie pas ; un inconnu ne les lit pas", async () => {
    const need = await addNeed(nocturneId);
    const julie = await signUp("Julie_Staff");
    await addMember(structureId, julie.id, "staff", ["scan"]);
    const list = await call(julie, "GET", `/events/${nocturneId}/needs`);
    expect(list.status).toBe(200);
    expect(list.json[0].id).toBe(need.id);
    expect((await call(julie, "POST", `/events/${nocturneId}/needs`, { trade: "barber" })).status).toBe(403);
    const shop = await signUp("Max_Boutique");
    await addMember(structureId, shop.id, "staff", ["shop"]);
    expect((await call(shop, "GET", `/events/${nocturneId}/needs`)).status).toBe(403);
  });
});

describe("emplacement : garde-fous", () => {
  beforeEach(async () => {
    await db.update(events).set({ vendorTypes: ["Food truck"] });
  });

  it("404 pour une candidature d'un autre événement ou de véhicule ; 409 après la fin ou si annulé ; une seule notification par changement", async () => {
    const appId = await acceptedOn(sofia, nocturneId);
    const spot = { spotLabel: "B2", spotNote: null };
    expect((await call(orga, "PATCH", `/events/${rivesaltesId}/applications/${appId}/spot`, spot)).status).toBe(404);

    const ref = await seedReference();
    const kenji = await signUp("Kenji_66");
    const car = await createVehicle(kenji.id, ref);
    const [vApp] = await db
      .insert(applications)
      .values({
        eventId: nocturneId,
        userId: kenji.id,
        kind: "vehicle",
        vehicleId: car.id,
        status: "accepted",
        rulesAcceptedAt: clock.now,
        followStructure: false,
      })
      .returning();
    expect((await call(orga, "PATCH", `/events/${nocturneId}/applications/${vApp?.id}/spot`, spot)).status).toBe(404);

    expect((await call(orga, "PATCH", `/events/${nocturneId}/applications/${appId}/spot`, spot)).status).toBe(200);
    expect((await call(orga, "PATCH", `/events/${nocturneId}/applications/${appId}/spot`, spot)).status).toBe(200);
    expect(await notifsOf(sofia.id, "provider_spot_assigned")).toHaveLength(1);
    const moved = { spotLabel: "B2", spotNote: "Côté quai" };
    expect((await call(orga, "PATCH", `/events/${nocturneId}/applications/${appId}/spot`, moved)).status).toBe(200);
    expect(await notifsOf(sofia.id, "provider_spot_assigned")).toHaveLength(2);

    clock.set(paris(10, 18, 10));
    expect((await call(orga, "PATCH", `/events/${nocturneId}/applications/${appId}/spot`, spot)).status).toBe(409);
    clock.set(paris(10, 12, 10));
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, nocturneId));
    expect((await call(orga, "PATCH", `/events/${nocturneId}/applications/${appId}/spot`, spot)).status).toBe(409);
  });
});

describe("vue de l'organisation après rechargement", () => {
  it("le tri montre mission, emplacement et avis ; les besoins listent leurs retenus", async () => {
    const need = await addNeed(nocturneId, { quantity: 2 });
    const appId = await acceptedOn(sofia, nocturneId, need.id);
    const lea = await signUp("Lea_Truck");
    await readyProvider(lea, { name: "La Caravane" });
    const pendingLea = await applyTo(lea, nocturneId, need.id);
    await call(orga, "PATCH", `/events/${nocturneId}/applications/${appId}/spot`, {
      spotLabel: "B2",
      spotNote: "Près de l'entrée",
    });

    const triage = await call(orga, "GET", `/events/${nocturneId}/applications?kind=provider&status=accepted`);
    const card = triage.json.items.find((i: { id: string }) => i.id === appId);
    expect(card.provider).toMatchObject({
      need: { id: need.id, trade: "food_truck", tradeLabel: "Food truck" },
      spot: { label: "B2", note: "Près de l'entrée" },
      review: null,
    });

    const needs = await call(orga, "GET", `/events/${nocturneId}/needs`);
    expect(needs.json[0]).toMatchObject({ filled: 1, remaining: 1 });
    expect(needs.json[0].retained).toEqual([
      {
        applicationId: appId,
        providerId: sofiaProviderId,
        providerName: "La Brasa",
        spot: { label: "B2", note: "Près de l'entrée" },
        reviewed: false,
      },
    ]);
    expect(needs.json[0].retained.map((r: { applicationId: string }) => r.applicationId)).not.toContain(
      pendingLea.json.id,
    );

    clock.set(paris(10, 18, 10));
    await call(orga, "POST", `/events/${nocturneId}/applications/${appId}/provider-review`, { rating: 4 });
    const after = await call(orga, "GET", `/events/${nocturneId}/needs`);
    expect(after.json[0].retained[0].reviewed).toBe(true);
    const one = await call(orga, "GET", `/applications/${appId}`);
    expect(one.json.provider.review).toMatchObject({ rating: 4 });
  });
});
