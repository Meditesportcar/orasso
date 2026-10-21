// Accueil par profil (lot 43, prototype DA v2 `s-home`) : `GET /me/home?persona=` renvoie le profil et les blocs qui lui
// sont propres ; les autres blocs restent nuls (aucun bloc d'un profil n'est lu pour un autre). Exposant : prochain accès
// enrichi (arrivée, organisateur, affiche) ; visiteur : prochain billet ; pro : remises, vues, événements proches avec
// leurs clients, passionnés du coin, derniers scans ; prestataire : mission et message de l'organisateur ; média :
// reportage, badge, consignes seulement une fois accrédité.

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  call,
  createEvent,
  createPro,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  applications,
  eventNeeds,
  eventPressSettings,
  mediaContents,
  mediaProfiles,
  mediaSavedEvents,
  proDailyStats,
  proDiscountUses,
  proFollows,
  profiles,
  providerProfiles,
  sponsoredDailySeen,
  sponsoredPlacements,
  ticketTypes,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { ticketsService } from "../tickets/service";

afterAll(async () => {
  await pool.end();
});

const DAY = 86_400_000;
const NOW = new Date("2026-10-17T10:00:00Z");

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  useClock(NOW);
});

const at = (days: number) => new Date(NOW.getTime() + days * DAY);

async function home(u: Parameters<typeof call>[0], persona?: string) {
  const r = await call(u, "GET", `/me/home${persona ? `?persona=${persona}` : ""}`);
  expect(r.status).toBe(200);
  return r.json;
}

async function fixture() {
  const ref = await seedReference();
  const orga = await signUp("Orga_Profils");
  const structure = await createStructure(orga.id);
  return { ref, orga, structure };
}

describe("GET /me/home?persona= : le profil de l'accueil", () => {
  it("sans casquette ou pour l'organisateur : l'accueil de l'exposant, sans bloc d'un autre profil", async () => {
    const u = await signUp("Kenji_Profil");
    // Une casquette inconnue est refusée par la validation de la requête.
    expect((await call(u, "GET", "/me/home?persona=inconnue")).status).toBe(400);
    for (const persona of [undefined, "fan", "organizer"]) {
      const r = await home(u, persona);
      expect(r.profile).toBe("exhibitor");
      expect([r.nextTicket, r.pro, r.provider, r.media]).toEqual([null, null, null, null]);
      expect(r.stampsThisSeason).toBe(0);
    }
    expect((await home(u, "visitor")).profile).toBe("visitor");
    expect((await home(u, "pro")).profile).toBe("pro");
    expect((await home(u, "provider")).profile).toBe("provider");
    expect((await home(u, "media")).profile).toBe("media");
  });
});

describe("accueil des autres profils : aucune impression sponsorisée, aucune source externe", () => {
  it("un pro, un prestataire, un média ou une lecture légère ne comptent rien ; l'exposant compte", async () => {
    const owner = await signUp("Pro_Sponso");
    const pro = await createPro(owner.id);
    await db.insert(sponsoredPlacements).values({
      proProfileId: pro.id,
      title: "Offre",
      body: "Texte",
      linkUrl: "https://exemple.fr",
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
      status: "active",
    });
    const u = await signUp("Fan_Sponso");
    for (const persona of ["pro", "provider", "media"]) {
      const r = await home(u, persona);
      expect(r.sponsored).toBeNull();
      expect(r.nearby).toBeNull();
      expect(r.wash).toEqual([]);
    }
    expect((await home(u, "fan&light=1")).sponsored).toBeNull();
    expect(await db.select().from(sponsoredDailySeen)).toHaveLength(0);
    expect((await home(u, "fan")).sponsored).not.toBeNull();
    expect(await db.select().from(sponsoredDailySeen)).toHaveLength(1);
  });
});

describe("exposant : le prochain accès enrichi", () => {
  it("porte l'arrivée, l'organisateur (logo, nom, validé) et l'affiche de l'événement", async () => {
    const { ref, structure } = await fixture();
    const u = await signUp("Exposant_Accueil");
    const v = await createVehicle(u.id, ref);
    const e = await createEvent(structure.id, {
      title: "Nocturne de test",
      startsAt: at(2),
      posterPostKey: "posters/test-post.webp",
      arrivalExhibitorsFrom: "18:30:00",
      arrivalExhibitorsTo: "19:15:00",
      arrivalExhibitorsStrict: true,
    });
    await db.insert(applications).values({
      userId: u.id,
      eventId: e.id,
      vehicleId: v.id,
      rulesAcceptedAt: NOW,
      followStructure: false,
      status: "accepted",
    });
    const r = await home(u, "fan");
    expect(r.nextAccess.event.title).toBe("Nocturne de test");
    expect(r.nextAccess.arrival).toEqual({ from: "18:30", to: "19:15", strict: true, note: null });
    expect(r.nextAccess.organizer).toMatchObject({ name: "Club de test", verified: true });
    expect(r.nextAccess.posterUrl).toContain("posters/test-post.webp");
    // La candidature ellemême porte aussi le créneau (tickets de Sorties).
    expect(r.agenda[0].arrival).toEqual({ from: "18:30", to: "19:15", strict: true, note: null });
  });

  it("sans arrivée ni affiche : des champs nuls, jamais d'erreur", async () => {
    const { ref, structure } = await fixture();
    const u = await signUp("Exposant_Nu");
    const v = await createVehicle(u.id, ref);
    const e = await createEvent(structure.id, { startsAt: at(3) });
    await db.insert(applications).values({
      userId: u.id,
      eventId: e.id,
      vehicleId: v.id,
      rulesAcceptedAt: NOW,
      followStructure: false,
      status: "pending",
    });
    const r = await home(u, "fan");
    expect(r.nextAccess.arrival).toBeNull();
    expect(r.nextAccess.posterUrl).toBeNull();
  });
});

describe("visiteur : le prochain billet", () => {
  it("un billet valable d'un événement à venir, avec l'arrivée du public ; rien sans billet", async () => {
    const { structure } = await fixture();
    const u = await signUp("Visiteur_Accueil");
    expect((await home(u, "visitor")).nextTicket).toBeNull();
    const e = await createEvent(structure.id, {
      title: "Cars et café",
      startsAt: at(5),
      publicAccess: "free_reservation",
      ticketsEnabled: true,
      arrivalPublicFrom: "19:00:00",
      arrivalPublicStrict: false,
    });
    await db.insert(ticketTypes).values({ eventId: e.id, name: "Entrée visiteur", capacity: 50, priceCents: 0 });
    await ticketsService.reserve(await viewerOf(u), e.id, 1);
    const r = await home(u, "visitor");
    expect(r.nextTicket).toMatchObject({ name: "Entrée visiteur", event: { title: "Cars et café" } });
    expect(r.nextTicket.arrival).toEqual({ from: "19:00", to: null, strict: false, note: null });
    expect(r.nextTicket.organizer.name).toBe("Club de test");
    // Le même compte, vu en exposant, ne reçoit pas ce bloc.
    expect((await home(u, "fan")).nextTicket).toBeNull();
  });
});

describe("pro : remises, vues, événements proches, passionnés, scans", () => {
  it("compte la semaine, les clients retenus, les passionnés du département et les favoris", async () => {
    const { ref, orga, structure } = await fixture();
    // L'organisateur du test n'est pas du département de la fiche (les inscriptions du test prennent le 66 par défaut).
    await db
      .update(profiles)
      .set({ departments: ["11"] })
      .where(eq(profiles.userId, orga.id));
    const owner = await signUp("Pro_Accueil");
    const pro = await createPro(owner.id, { lat: 42.7, lng: 2.9, department: "66" });
    // Remises : trois cette semaine, une trop ancienne.
    await db.insert(proDiscountUses).values([
      { proId: pro.id, grade: "route", percent: 10, usedAt: at(-1) },
      { proId: pro.id, grade: "circuit", percent: 15, usedAt: at(-2) },
      { proId: pro.id, grade: "route", percent: 10, usedAt: at(-3) },
      { proId: pro.id, grade: "route", percent: 10, usedAt: at(-20) },
    ]);
    await db.insert(proDailyStats).values([
      { proId: pro.id, day: at(-1).toISOString().slice(0, 10), views: 12, calls: 0, routes: 0 },
      { proId: pro.id, day: at(-6).toISOString().slice(0, 10), views: 30, calls: 0, routes: 0 },
      { proId: pro.id, day: at(-30).toISOString().slice(0, 10), views: 500, calls: 0, routes: 0 },
    ]);
    // Deux abonnés, dont un en garage favori ; les deux sont retenus à l'événement proche.
    const a = await signUp("Client_A");
    const b = await signUp("Client_B");
    const c = await signUp("Client_C");
    await db.insert(proFollows).values([
      { proId: pro.id, userId: a.id, favorite: true },
      { proId: pro.id, userId: b.id, favorite: false },
    ]);
    for (const x of [a, b, c])
      await db
        .update(profiles)
        .set({ departments: ["66"] })
        .where(eq(profiles.userId, x.id));
    const near = await createEvent(structure.id, {
      title: "Proche de l'atelier",
      startsAt: at(4),
      lat: 42.71,
      lng: 2.95,
      department: "66",
    });
    const far = await createEvent(structure.id, {
      title: "Loin",
      startsAt: at(5),
      lat: 48.85,
      lng: 2.35,
      department: "75",
    });
    for (const x of [a, b, c]) {
      const v = await createVehicle(x.id, ref);
      await db.insert(applications).values({
        userId: x.id,
        eventId: near.id,
        vehicleId: v.id,
        rulesAcceptedAt: NOW,
        followStructure: false,
        status: "accepted",
      });
    }
    void far;
    // Événement privé près de l'atelier, avec photo : le pro, non invité, n'en voit rien (ni titre, ni affiche, ni photo).
    await createEvent(structure.id, {
      title: "Soirée privée",
      admission: "invite_only",
      startsAt: at(3),
      lat: 42.71,
      lng: 2.95,
      department: "66",
      posterPhotoKey: "event-posters/prive.webp",
      posterPostKey: "event-posters/prive-post.png",
    });
    const r = (await home(owner, "pro")).pro;
    expect(JSON.stringify(r)).not.toContain("prive");
    expect(JSON.stringify(r)).not.toContain("Soirée privée");
    expect(r.name).toBe("Garage de test");
    expect(r.discountsThisWeek).toBe(3);
    expect(r.profileViews).toBe(42);
    expect(r.favoritedBy).toBe(1);
    // Passionnés du département 66, hors le propriétaire de la fiche : A, B, C.
    expect(r.fansNearby).toBe(3);
    expect(r.nearbyEventsWithClients).toHaveLength(1);
    expect(r.nearbyEventsWithClients[0]).toMatchObject({ event: { title: "Proche de l'atelier" }, clientsGoing: 2 });
    expect(r.lastScans.map((s: { percent: number }) => s.percent)).toEqual([10, 15, 10, 10]);
    // Sans fiche pro : le bloc est nul.
    expect((await home(a, "pro")).pro).toBeNull();
  });
});

describe("prestataire : la mission, l'emplacement et le message de l'organisateur", () => {
  it("la mission retenue passe avant une demande en cours ; message et emplacement viennent de la candidature", async () => {
    const { structure } = await fixture();
    const owner = await signUp("Presta_Accueil");
    const [profile] = await db
      .insert(providerProfiles)
      .values({ userId: owner.id, type: "food_truck", name: "La Brasa", departments: ["66"] })
      .returning();
    const early = await createEvent(structure.id, { title: "Demande", startsAt: at(2) });
    const later = await createEvent(structure.id, { title: "Retenue", startsAt: at(9) });
    const [need] = await db
      .insert(eventNeeds)
      .values({ eventId: later.id, trade: "food_truck", installAt: at(9) })
      .returning();
    await db.insert(applications).values([
      {
        userId: owner.id,
        eventId: early.id,
        kind: "provider",
        providerProfileId: profile!.id,
        rulesAcceptedAt: NOW,
        followStructure: false,
        status: "pending",
      },
      {
        userId: owner.id,
        eventId: later.id,
        kind: "provider",
        providerProfileId: profile!.id,
        rulesAcceptedAt: NOW,
        followStructure: false,
        status: "accepted",
        needId: need!.id,
        spotLabel: "B2",
        spotNote: "Allée centrale, prise 16 A.",
      },
    ]);
    const r = (await home(owner, "provider")).provider;
    expect(r.nextMission).toMatchObject({
      status: "accepted",
      event: { title: "Retenue" },
      trade: "food_truck",
      spotLabel: "B2",
      organizerMessage: "Allée centrale, prise 16 A.",
      organizer: { name: "Club de test", verified: true },
    });
    expect(r.nextMission.installAt).toBe(at(9).toISOString());
    expect(Array.isArray(r.nearbyMissions)).toBe(true);
    // Sans profil de prestataire : bloc nul.
    expect((await home(await signUp("Sans_Profil"), "provider")).provider).toBeNull();
  });
});

describe("média : reportage, badge et consignes", () => {
  it("les consignes de l'organisateur ne sortent qu'une fois accrédité", async () => {
    const { structure } = await fixture();
    const owner = await signUp("Media_Accueil");
    const [media] = await db
      .insert(mediaProfiles)
      .values({ userId: owner.id, name: "Sud Cars", formats: ["photo"] })
      .returning();
    const e = await createEvent(structure.id, { title: "Reportage", startsAt: at(3) });
    const saved = await createEvent(structure.id, { title: "À couvrir", startsAt: at(8) });
    await db.insert(eventPressSettings).values({
      eventId: e.id,
      accreditationOpen: true,
      zones: "Zone piste 19 h - 21 h",
      instructions: "Gilet obligatoire.",
      contact: "presse@club.test",
    });
    await db.insert(mediaSavedEvents).values({ mediaProfileId: media!.id, eventId: saved.id });
    const [app] = await db
      .insert(applications)
      .values({
        userId: owner.id,
        eventId: e.id,
        kind: "media",
        mediaProfileId: media!.id,
        mediaFormats: ["photo", "video"],
        rulesAcceptedAt: NOW,
        followStructure: false,
        status: "pending",
      })
      .returning();
    await db.insert(mediaContents).values({
      mediaProfileId: media!.id,
      eventId: e.id,
      kind: "link",
      title: "Mon reportage",
      url: "https://example.org/reportage",
      views: 7,
    });

    let r = (await home(owner, "media")).media;
    expect(r.name).toBe("Sud Cars");
    expect(r.nextReport).toMatchObject({
      status: "pending",
      event: { title: "Reportage" },
      formats: ["photo", "video"],
    });
    expect(r.nextReport.briefing).toBeNull();
    expect(r.toCover.map((x: { title: string }) => x.title)).toEqual(["À couvrir"]);
    expect(r.contents).toEqual([
      expect.objectContaining({ title: "Mon reportage", eventTitle: "Reportage", views: 7 }),
    ]);

    await db.update(applications).set({ status: "accepted" }).where(eq(applications.id, app!.id));
    r = (await home(owner, "media")).media;
    expect(r.nextReport.status).toBe("accepted");
    expect(r.nextReport.briefing).toEqual({
      zones: "Zone piste 19 h - 21 h",
      instructions: "Gilet obligatoire.",
      contact: "presse@club.test",
    });
    expect((await home(await signUp("Sans_Media"), "media")).media).toBeNull();
  });
});
