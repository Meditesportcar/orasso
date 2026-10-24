// Recherche de premier niveau et Explorer (lot 29) : `GET /search`, `GET /events` (affinités, distance, filtres),
// `GET /pros` (distance, filtres). En cookie ET en jeton porteur. Confidentialité, abus, absence de déduction.
import { type affinityOf, compareByAffinity, fromWallTime } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  blurPlatesOf,
  createEvent,
  createPro,
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
  eventDays,
  friendships,
  profileInterests,
  profiles,
  proProfiles,
  structureFollows,
  structures,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
  vehicles,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { resetRateLimits } from "../../lib/rateLimit";
import { fold } from "../../lib/text-search";
import { socialRepo } from "../social/repo";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const DAY = 86_400_000;
type Mode = "cookie" | "bearer";
const MODES: Mode[] = ["cookie", "bearer"];

const bearerOf = (cookie: string) => {
  const raw = cookie
    .split("; ")
    .find((c) => c.startsWith("better-auth.session_token="))
    ?.slice("better-auth.session_token=".length);
  return raw ? decodeURIComponent(raw) : "";
};

/** GET authentifié par cookie (site) ou par jeton porteur (appli) ; `null` = visiteur sans compte. */
async function get(u: TestUser | null, path: string, mode: Mode = "cookie") {
  const res = await app.request(`/api${path}`, {
    headers: {
      origin: ORIGIN,
      ...(u && mode === "cookie" ? { cookie: u.cookie } : {}),
      ...(u && mode === "bearer" ? { authorization: `Bearer ${bearerOf(u.cookie)}` } : {}),
    },
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

let ref: Awaited<ReturnType<typeof seedReference>>;
let supra: { makeId: string; modelId: string; generationId: string };

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
  ref = await seedReference();
  const [make] = await db.insert(vehicleMakes).values({ name: "Toyota", slug: "toyota", country: "JP" }).returning();
  const [model] = await db
    .insert(vehicleModels)
    .values({ makeId: make!.id, name: "Supra", slug: "supra", vehicleType: "car" })
    .returning();
  const [gen] = await db
    .insert(vehicleGenerations)
    .values({ modelId: model!.id, name: "MK4", yearFrom: 1993, yearTo: 2002 })
    .returning();
  supra = { makeId: make!.id, modelId: model!.id, generationId: gen!.id };
});

async function person(
  pseudo: string,
  opts: { visibility?: "public" | "private"; departments?: string[] } = {},
): Promise<TestUser> {
  const u = await signUp(pseudo);
  await db
    .update(profiles)
    .set({ visibility: opts.visibility ?? "public", departments: opts.departments ?? ["66"] })
    .where(eq(profiles.userId, u.id));
  return u;
}

async function befriend(a: TestUser, b: TestUser) {
  await db
    .insert(friendships)
    .values({ requesterId: a.id, addresseeId: b.id, status: "accepted", respondedAt: new Date() });
  await socialRepo.recountFriends([a.id, b.id]);
}

const ids = (items: { slug?: string; id?: string }[]) => items.map((i) => i.slug ?? i.id);

// Positions réelles (à quelques km près) pour les distances.
const PERPIGNAN = { lat: 42.7, lng: 2.89 };
const RIVESALTES = { lat: 42.77, lng: 2.87 };
const NARBONNE = { lat: 43.18, lng: 3.0 };
const PARIS = { lat: 48.86, lng: 2.35 };

describe("affinités (S34) : GET /events?sort=affinity", () => {
  it("place en tête l'événement d'un organisateur suivi, puis les centres d'intérêt, puis la proximité, puis la date", async () => {
    const viewer = await person("Viewer_66", { departments: ["66"] });
    const owner = await person("Orga_A");
    const followed = await createStructure(owner.id);
    const other = await createStructure(owner.id);
    await db.insert(structureFollows).values({ structureId: followed.id, userId: viewer.id, source: "manual" });
    await db.insert(profileInterests).values([
      { userId: viewer.id, categoryId: ref.youngtimer.id },
      { userId: viewer.id, categoryId: ref.jdm.id },
    ]);
    const criteria = (...categoryIds: string[]) => ({ categoryIds, makeIds: [], countries: [], text: null });

    // Date croissante : e0 (rien, loin), e1 (proche seulement), e2 (1 catégorie), e3 (2 catégories),
    // e4 (suivi, loin), e5 (suivi + 2 catégories + proche).
    const e0 = await createEvent(other.id, {
      title: "Salon de Paris",
      ...PARIS,
      startsAt: new Date(Date.now() + 2 * DAY),
    });
    const e1 = await createEvent(other.id, {
      title: "Sortie Rivesaltes",
      ...RIVESALTES,
      startsAt: new Date(Date.now() + 3 * DAY),
    });
    const e2 = await createEvent(other.id, {
      title: "Youngtimers à Paris",
      ...PARIS,
      criteria: criteria(ref.youngtimer.id),
      startsAt: new Date(Date.now() + 4 * DAY),
    });
    const e3 = await createEvent(other.id, {
      title: "JDM et youngtimers à Paris",
      ...PARIS,
      criteria: criteria(ref.youngtimer.id, ref.jdm.id),
      startsAt: new Date(Date.now() + 5 * DAY),
    });
    const e4 = await createEvent(followed.id, {
      title: "Rassemblement suivi à Paris",
      ...PARIS,
      startsAt: new Date(Date.now() + 6 * DAY),
    });
    const e5 = await createEvent(followed.id, {
      title: "Meilleur choix à Perpignan",
      ...PERPIGNAN,
      criteria: criteria(ref.youngtimer.id, ref.jdm.id),
      startsAt: new Date(Date.now() + 7 * DAY),
    });

    for (const mode of MODES) {
      const res = await get(viewer, "/events?sort=affinity&limit=20", mode);
      expect(res.status).toBe(200);
      const items = res.json.items as {
        id: string;
        slug: string;
        startsAt: string;
        affinity: ReturnType<typeof affinityOf>;
      }[];
      // 3 + 4 + 1 = 8 ; 3 ; 4 ; 2 ; 1 ; 0.
      expect(items.map((i) => i.slug)).toEqual([e5, e3, e4, e2, e1, e0].map((e) => e.slug));
      expect(items.map((i) => i.affinity.score)).toEqual([8, 4, 3, 2, 1, 0]);
      expect(items[0]?.affinity).toMatchObject({ followed: true, commonCategories: 2, near: true });
    }
  });

  it("l'ordre rendu par le SQL est celui de la règle pure (score décroissant, puis date, puis identifiant)", async () => {
    const viewer = await person("Viewer_66");
    const owner = await person("Orga_A");
    const a = await createStructure(owner.id);
    const b = await createStructure(owner.id);
    await db.insert(structureFollows).values({ structureId: a.id, userId: viewer.id, source: "manual" });
    await db.insert(profileInterests).values({ userId: viewer.id, categoryId: ref.jdm.id });
    for (let i = 0; i < 6; i++) {
      await createEvent(i % 2 ? a.id : b.id, {
        title: `Événement ${i}`,
        ...(i % 3 === 0 ? RIVESALTES : PARIS),
        criteria: { categoryIds: i % 4 === 0 ? [ref.jdm.id] : [], makeIds: [], countries: [], text: null },
        startsAt: new Date(Date.now() + (i + 1) * DAY),
      });
    }
    const res = await get(viewer, "/events?sort=affinity&limit=20");
    const items = res.json.items as { id: string; startsAt: string; affinity: ReturnType<typeof affinityOf> }[];
    expect(items).toHaveLength(6);
    const sorted = [...items]
      .map((i) => ({ id: i.id, startsAt: i.startsAt, score: i.affinity.score }))
      .sort(compareByAffinity)
      .map((i) => i.id);
    expect(items.map((i) => i.id)).toEqual(sorted);
  });

  it("ne lit que les données de la personne qui demande : un autre compte n'a pas les mêmes affinités", async () => {
    const mine = await person("Moi_66");
    const stranger = await person("Autre_75", { departments: ["75"] });
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    await db.insert(structureFollows).values({ structureId: s.id, userId: mine.id, source: "manual" });
    await createEvent(s.id, { title: "Suivi", ...PARIS });
    const forMe = await get(mine, "/events?sort=affinity");
    const forOther = await get(stranger, "/events?sort=affinity");
    expect(forMe.json.items[0].affinity.followed).toBe(true);
    expect(forOther.json.items[0].affinity.followed).toBe(false);
  });

  it("sans compte, l'ordre par affinités se replie sur la date (ou la distance si une position est envoyée)", async () => {
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    const far = await createEvent(s.id, { title: "Loin mais tôt", ...PARIS, startsAt: new Date(Date.now() + 2 * DAY) });
    const near = await createEvent(s.id, {
      title: "Près mais tard",
      ...PERPIGNAN,
      startsAt: new Date(Date.now() + 9 * DAY),
    });
    const byDate = await get(null, "/events?sort=affinity");
    expect(ids(byDate.json.items)).toEqual([far.slug, near.slug]);
    expect(byDate.json.items[0].affinity).toBeUndefined();
    expect(byDate.json.items[0].distanceKm).toBeUndefined();
    const byDistance = await get(null, `/events?sort=affinity&lat=${PERPIGNAN.lat}&lng=${PERPIGNAN.lng}`);
    expect(ids(byDistance.json.items)).toEqual([near.slug, far.slug]);
  });
});

describe("structures suivies (lot 44) : GET /events?followed=1", () => {
  it("ne garde que les événements des structures que je suis ; sans compte, le filtre est ignoré", async () => {
    const viewer = await person("Suiveur_66", { departments: ["66"] });
    const owner = await person("Orga_A");
    const followed = await createStructure(owner.id);
    const other = await createStructure(owner.id);
    await db.insert(structureFollows).values({ structureId: followed.id, userId: viewer.id, source: "manual" });
    const mine = await createEvent(followed.id, { title: "Chez ceux que je suis", ...PARIS });
    const theirs = await createEvent(other.id, { title: "Ailleurs", ...PERPIGNAN });
    for (const mode of MODES) {
      const res = await get(viewer, "/events?followed=1&sort=distance", mode);
      expect(res.status).toBe(200);
      expect(ids(res.json.items)).toEqual([mine.slug]);
    }
    const anonymous = await get(null, "/events?followed=1");
    expect(ids(anonymous.json.items).sort()).toEqual([mine.slug, theirs.slug].sort());
  });
});

// Lot M4 (maquette 3.2) : « Nouveautés » (publiés depuis peu d'abord) et « Places restantes » (le plus de places
// exposants d'abord, sans limite en tête ; retenues et places offertes déduites).
describe("tris de l'Explorer : GET /events?sort=recent | seats", () => {
  it("ordonne par publication récente, puis par places restantes", async () => {
    const owner = await person("Orga_Tri");
    const s = await createStructure(owner.id);
    const old = await createEvent(s.id, { title: "Ancien", capacity: 50, publishedAt: new Date(Date.now() - 9 * DAY) });
    const fresh = await createEvent(s.id, { title: "Récent", capacity: 5, publishedAt: new Date(Date.now() - DAY) });
    const open = await createEvent(s.id, {
      title: "Sans limite",
      capacity: null,
      publishedAt: new Date(Date.now() - 5 * DAY),
    });
    const kenji = await person("Kenji_Tri");
    for (let i = 0; i < 3; i++) {
      const v = await createVehicle(kenji.id, ref);
      await db.insert(applications).values({
        eventId: fresh.id,
        userId: kenji.id,
        vehicleId: v.id,
        status: i === 0 ? "offered" : "accepted",
        rulesAcceptedAt: new Date(),
        followStructure: false,
      });
    }
    for (const mode of MODES) {
      const recent = await get(null, "/events?sort=recent", mode);
      expect(recent.status).toBe(200);
      expect(ids(recent.json.items)).toEqual([fresh, open, old].map((e) => e.slug));
      const seats = await get(null, "/events?sort=seats", mode);
      expect(ids(seats.json.items)).toEqual([open, old, fresh].map((e) => e.slug));
      expect(seats.json.items[2].remaining).toBe(2);
    }
  });

  // Tour 2 (relecture Codex) : même calcul par jour que le compteur affiché, et pagination stable.
  const accept = async (eventId: string, n: number, eventDayId: string | null = null) => {
    const who = await person(`Exp_${eventId.slice(0, 6)}_${eventDayId?.slice(0, 4) ?? "tout"}`);
    for (let i = 0; i < n; i++) {
      const v = await createVehicle(who.id, ref);
      await db.insert(applications).values({
        eventId,
        userId: who.id,
        vehicleId: v.id,
        eventDayId,
        status: "accepted",
        rulesAcceptedAt: new Date(),
        followStructure: false,
      });
    }
  };
  const twoDays = async (eventId: string, startsAt: Date, capacity: number | null = null) => {
    const days = await db
      .insert(eventDays)
      .values(
        [0, 1].map((i) => ({
          eventId,
          dayDate: new Date(startsAt.getTime() + i * DAY).toISOString().slice(0, 10),
          startsAt: new Date(startsAt.getTime() + i * DAY),
          endsAt: new Date(startsAt.getTime() + i * DAY + 4 * 3_600_000),
          capacity,
        })),
      )
      .returning();
    return days;
  };

  it("plusieurs jours : les places du meilleur jour, comme la carte (pas la capacité moins toutes les candidatures)", async () => {
    const owner = await person("Orga_Jours");
    const s = await createStructure(owner.id);
    const startsAt = new Date(now().getTime() + 10 * DAY);
    // 10 places par jour, 9 retenus le premier jour seulement : 10 places restent le second (affiché « 10 »).
    const weekend = await createEvent(s.id, { title: "Week-end", capacity: 10, startsAt });
    const [d1] = await twoDays(weekend.id, startsAt);
    await accept(weekend.id, 9, d1?.id ?? null);
    // Un jour, 5 places, aucune prise.
    const single = await createEvent(s.id, {
      title: "Un jour",
      capacity: 5,
      startsAt: new Date(startsAt.getTime() + DAY),
    });
    // Deux jours, 4 places, 2 inscrits à tout l'événement : 2 places chaque jour.
    const both = await createEvent(s.id, {
      title: "Deux jours",
      capacity: 4,
      startsAt: new Date(startsAt.getTime() + 2 * DAY),
    });
    await twoDays(both.id, new Date(startsAt.getTime() + 2 * DAY));
    await accept(both.id, 2);
    const res = await get(null, "/events?sort=seats");
    expect(ids(res.json.items)).toEqual([weekend, single, both].map((e) => e.slug));
    expect(res.json.items.map((x: { remaining: number }) => x.remaining)).toEqual([10, 5, 2]);
  });

  it("pagination par curseur : une inscription entre deux pages ne fait ni sauter ni répéter un événement", async () => {
    const owner = await person("Orga_Pages");
    const s = await createStructure(owner.id);
    const startsAt = new Date(now().getTime() + 10 * DAY);
    const a = await createEvent(s.id, { title: "A", capacity: 10, startsAt });
    const b = await createEvent(s.id, { title: "B", capacity: 8, startsAt });
    const c = await createEvent(s.id, { title: "C", capacity: 6, startsAt });
    const d = await createEvent(s.id, { title: "D", capacity: 4, startsAt });
    const first = await get(null, "/events?sort=seats&limit=2");
    expect(ids(first.json.items)).toEqual([a.slug, b.slug]);
    expect(first.json.nextCursor).toBeTruthy();
    // B passe derrière C (8 → 3 places) entre les deux pages.
    await accept(b.id, 5);
    const second = await get(null, `/events?sort=seats&limit=2&cursor=${first.json.nextCursor}`);
    // C n'est pas omis ; B peut revenir (l'appli l'écarte par son id), jamais un événement déjà passé devant.
    expect(ids(second.json.items)).toEqual([c.slug, d.slug]);
    const third = await get(null, `/events?sort=seats&limit=2&cursor=${second.json.nextCursor}`);
    expect(ids(third.json.items)).toEqual([b.slug]);
    expect(third.json.nextCursor).toBeNull();
    // Un curseur illisible repart du début (B est maintenant dernier).
    expect(ids((await get(null, "/events?sort=seats&limit=2&cursor=bidon")).json.items)).toEqual([a.slug, c.slug]);
  });
});

describe("distance : GET /events?sort=distance", () => {
  it("part du centre du département du profil, du plus proche au plus loin, sans position les événements sans adresse passent après", async () => {
    const viewer = await person("Viewer_66", { departments: ["66"] });
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    const paris = await createEvent(s.id, { title: "Paris", ...PARIS, startsAt: new Date(Date.now() + 2 * DAY) });
    const narbonne = await createEvent(s.id, {
      title: "Narbonne",
      ...NARBONNE,
      startsAt: new Date(Date.now() + 3 * DAY),
    });
    const rivesaltes = await createEvent(s.id, {
      title: "Rivesaltes",
      ...RIVESALTES,
      startsAt: new Date(Date.now() + 4 * DAY),
    });
    const nowhere = await createEvent(s.id, {
      title: "Sans adresse",
      lat: null,
      lng: null,
      startsAt: new Date(Date.now() + 1 * DAY),
    });
    for (const mode of MODES) {
      const res = await get(viewer, "/events?sort=distance", mode);
      expect(res.status).toBe(200);
      expect(ids(res.json.items)).toEqual([rivesaltes, narbonne, paris, nowhere].map((e) => e.slug));
      const km = res.json.items.map((i: { distanceKm: number | null }) => i.distanceKm);
      expect(km[0]).toBeGreaterThan(0);
      expect(km[0]).toBeLessThan(km[1]);
      expect(km[1]).toBeLessThan(km[2]);
      expect(km[3]).toBeNull();
    }
  });

  it("« Ailleurs… » (lot M4) : around=<département> part de son centre, sans toucher au profil ; sans rayon, partout", async () => {
    const viewer = await person("Viewer_66", { departments: ["66"] });
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    const paris = await createEvent(s.id, { title: "Paris", ...PARIS });
    const rivesaltes = await createEvent(s.id, { title: "Rivesaltes", ...RIVESALTES });
    for (const mode of MODES) {
      const res = await get(viewer, "/events?sort=distance&around=75", mode);
      expect(res.status).toBe(200);
      expect(ids(res.json.items)).toEqual([paris.slug, rivesaltes.slug]);
      expect(res.json.items[0].distanceKm).toBeLessThan(20);
    }
    // Rayon : seulement autour du centre choisi.
    expect(ids((await get(viewer, "/events?sort=distance&around=75&radiusKm=50")).json.items)).toEqual([paris.slug]);
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, viewer.id));
    expect(profile?.departments).toEqual(["66"]);
    expect((await get(viewer, "/events?around=999")).status).toBe(400);
  });

  it("formats des préférences (lot M4, tour 2) : plusieurs formats, `format` seul l'emporte", async () => {
    const owner = await person("Orga_Formats");
    const s = await createStructure(owner.id);
    const expo = await createEvent(s.id, { title: "Expo", format: "exhibition" });
    const rasso = await createEvent(s.id, { title: "Rasso", format: "gathering" });
    await createEvent(s.id, { title: "Cars", format: "cars_and_coffee" });
    expect(ids((await get(null, "/events?formats=exhibition,gathering")).json.items).sort()).toEqual(
      [expo.slug, rasso.slug].sort(),
    );
    expect(ids((await get(null, "/events?formats=exhibition,gathering&format=exhibition")).json.items)).toEqual([
      expo.slug,
    ]);
    expect((await get(null, "/events?formats=inconnu")).status).toBe(400);
  });

  it("« Partout en France » (lot M4, tour 2) : everywhere=1 enlève le rayon d'origine d'une position triée par date", async () => {
    const viewer = await person("Viewer_66", { departments: ["66"] });
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    const paris = await createEvent(s.id, { title: "Paris", ...PARIS });
    const rivesaltes = await createEvent(s.id, { title: "Rivesaltes", ...RIVESALTES });
    const at = `lat=${PERPIGNAN.lat}&lng=${PERPIGNAN.lng}`;
    // Comportement d'origine (lot 29) : position et tri par date, 50 km.
    expect(ids((await get(viewer, `/events?sort=date&${at}`)).json.items)).toEqual([rivesaltes.slug]);
    expect(ids((await get(viewer, `/events?sort=date&${at}&everywhere=1`)).json.items).sort()).toEqual(
      [paris.slug, rivesaltes.slug].sort(),
    );
    // Un rayon demandé s'applique comme avant.
    expect(ids((await get(viewer, `/events?sort=distance&${at}&radiusKm=50`)).json.items)).toEqual([rivesaltes.slug]);
  });

  it("la position de l'appareil prime pour la requête et n'est enregistrée nulle part", async () => {
    const viewer = await person("Viewer_66", { departments: ["66"] });
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    const paris = await createEvent(s.id, { title: "Paris", ...PARIS });
    const rivesaltes = await createEvent(s.id, { title: "Rivesaltes", ...RIVESALTES });
    const res = await get(viewer, `/events?sort=distance&lat=${PARIS.lat}&lng=${PARIS.lng}`);
    expect(ids(res.json.items)).toEqual([paris.slug, rivesaltes.slug]);
    expect(res.json.items[0].distanceKm).toBeLessThan(10);
    // Le profil n'a pas bougé : toujours le département 66, aucune colonne de position.
    const row = await db.query.profiles.findFirst({ where: eq(profiles.userId, viewer.id) });
    expect(row?.departments).toEqual(["66"]);
    expect(Object.keys(row ?? {}).some((k) => /^(lat|lng|latitude|longitude|position)/i.test(k))).toBe(false);
  });

  it("sans secteur ni position, la distance n'existe pas : retour à la date, aucun champ de distance", async () => {
    const viewer = await person("Sans_Secteur", { departments: [] });
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    const first = await createEvent(s.id, { title: "Tôt", ...PARIS, startsAt: new Date(Date.now() + 1 * DAY) });
    const second = await createEvent(s.id, { title: "Tard", ...RIVESALTES, startsAt: new Date(Date.now() + 5 * DAY) });
    const res = await get(viewer, "/events?sort=distance");
    expect(ids(res.json.items)).toEqual([first.slug, second.slug]);
    expect(res.json.items[0].distanceKm).toBeUndefined();
  });

  it("le rayon part du secteur du profil : rien au-delà", async () => {
    const viewer = await person("Viewer_66", { departments: ["66"] });
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    const near = await createEvent(s.id, { title: "Rivesaltes", ...RIVESALTES });
    await createEvent(s.id, { title: "Paris", ...PARIS });
    const res = await get(viewer, "/events?radiusKm=50&sort=date");
    expect(ids(res.json.items)).toEqual([near.slug]);
    // Un visiteur sans position ne peut pas demander de rayon : la liste n'est pas filtrée.
    const visitor = await get(null, "/events?radiusKm=50");
    expect(visitor.json.items).toHaveLength(2);
  });
});

describe("filtres combinés et texte", () => {
  it("format, catégorie, département, dates et texte se combinent", async () => {
    const viewer = await person("Viewer_66");
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    const target = await createEvent(s.id, {
      title: "Expo Rivesaltes",
      city: "Rivesaltes",
      department: "66",
      format: "exhibition",
      ...RIVESALTES,
      criteria: { categoryIds: [ref.youngtimer.id], makeIds: [], countries: [], text: null },
      startsAt: new Date(Date.now() + 20 * DAY),
    });
    await createEvent(s.id, {
      title: "Expo Paris",
      city: "Paris",
      department: "75",
      format: "exhibition",
      ...PARIS,
      startsAt: new Date(Date.now() + 20 * DAY),
    });
    await createEvent(s.id, {
      title: "Rassemblement Rivesaltes",
      city: "Rivesaltes",
      department: "66",
      format: "gathering",
      ...RIVESALTES,
      startsAt: new Date(Date.now() + 20 * DAY),
    });
    await createEvent(s.id, {
      title: "Expo Rivesaltes tardive",
      city: "Rivesaltes",
      department: "66",
      format: "exhibition",
      ...RIVESALTES,
      startsAt: new Date(Date.now() + 80 * DAY),
    });
    const from = new Date(Date.now() + 10 * DAY).toISOString();
    const to = new Date(Date.now() + 30 * DAY).toISOString();
    const query = `format=exhibition&department=66&categoryId=${ref.youngtimer.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&q=expo%20rivesaltes&sort=affinity`;
    for (const mode of MODES) {
      const res = await get(viewer, `/events?${query}`, mode);
      expect(res.status).toBe(200);
      expect(ids(res.json.items)).toEqual([target.slug]);
    }
    // Chaque mot doit se retrouver (titre ou ville) : « paris rivesaltes » ne trouve rien.
    const none = await get(viewer, "/events?q=paris%20rivesaltes");
    expect(none.json.items).toHaveLength(0);
  });

  it("lot R1 : le nom de l'organisateur, la ville et le lieu, sans accents ni casse, un début de mot suffit", async () => {
    const viewer = await person("Viewer_66");
    const owner = await person("Orga_A");
    const medite = await createStructure(owner.id);
    await db.update(structures).set({ name: "MéditeSportCar" }).where(eq(structures.id, medite.id));
    const other = await createStructure(owner.id);
    const night = await createEvent(medite.id, { title: "Nocturne du port", city: "Canet-en-Roussillon" });
    const elne = await createEvent(other.id, {
      title: "Rassemblement d'automne",
      city: "Elne",
      addressLine: "Parc des Expositions Élisée",
    });
    await createEvent(other.id, { title: "Autre", city: "Perpignan" });
    for (const q of ["Médite", "medite", "MEDI", "méditesportcar", "sportcar"]) {
      const res = await get(viewer, `/events?q=${encodeURIComponent(q)}`);
      expect(ids(res.json.items), `q=${q}`).toEqual([night.slug]);
    }
    // La ville et le lieu (adresse), sans accents : « canet », « elisee », « ÉLNE ».
    expect(ids((await get(viewer, "/events?q=canet")).json.items)).toEqual([night.slug]);
    for (const q of ["elisee", "ÉLNE", "expositions elne"]) {
      expect(ids((await get(viewer, `/events?q=${encodeURIComponent(q)}`)).json.items), `q=${q}`).toEqual([elne.slug]);
    }
    // Chaque mot doit se retrouver quelque part : l'organisateur et la ville d'un autre événement ne se mélangent pas.
    expect((await get(viewer, `/events?q=${encodeURIComponent("médite elne")}`)).json.items).toHaveLength(0);
    // Même règle dans la recherche de premier niveau (groupe Événements).
    const search = await get(viewer, `/search?q=${encodeURIComponent("Médite")}`);
    expect(ids(search.json.events)).toEqual([night.slug]);
  });

  it("lot R1, tour 2 : `orasso_fold` (base, index de la migration 0056) donne le même texte que `fold` (API)", async () => {
    for (const text of [
      "MéditeSportCar",
      "ÉLNE",
      "Ÿvelines",
      "Çà et là",
      "Noël à l'Île",
      "ÀÇÈÑ ÔÛ",
      "Canet-en-Roussillon",
    ]) {
      const { rows } = await db.execute<{ v: string }>(sql`select orasso_fold(${text}) as v`);
      expect(rows[0]?.v, text).toBe(fold(text));
    }
  });

  it("lot R1 : un événement terminé n'est jamais listé, même avec une période commencée plus tôt (plusieurs jours compris)", async () => {
    const clock = useClock(fromWallTime({ year: 2026, month: 10, day: 18, hour: 15, minute: 0 }));
    const viewer = await person("Viewer_66");
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    const at = (h: number) => new Date(clock.now.getTime() + h * 3_600_000);
    // Samedi 17 : fini la veille. Vendredi → dimanche 23 h : plusieurs jours, encore en cours. Mardi : à venir.
    await createEvent(s.id, { title: "Fini hier", startsAt: at(-28), endsAt: at(-24) });
    const running = await createEvent(s.id, { title: "En cours", startsAt: at(-48), endsAt: at(8) });
    const soon = await createEvent(s.id, { title: "Mardi", startsAt: at(48), endsAt: at(52) });
    // Fini il y a une minute.
    await createEvent(s.id, {
      title: "Fini à l'instant",
      startsAt: at(-4),
      endsAt: new Date(clock.now.getTime() - 60_000),
    });
    const saturday = fromWallTime({ year: 2026, month: 10, day: 17, hour: 0, minute: 0 }).toISOString();
    for (const path of ["/events", `/events?from=${encodeURIComponent(saturday)}`, "/events?sort=distance&limit=100"]) {
      const res = await get(viewer, path);
      expect(ids(res.json.items), path).toEqual([running.slug, soon.slug]);
    }
    // Les passés restent dans « passés ».
    const past = await get(viewer, "/events?scope=past");
    expect(past.json.items.map((e: { title: string }) => e.title)).toEqual(["Fini à l'instant", "Fini hier"]);
    // L'horloge avance : l'événement en cours se termine et disparaît.
    clock.advance(9 * 3_600_000);
    expect(ids((await get(viewer, "/events")).json.items)).toEqual([soon.slug]);
  });

  it("les jokers de like saisis ne sont pas des jokers", async () => {
    const viewer = await person("Viewer_66");
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    await createEvent(s.id, { title: "Expo Rivesaltes", city: "Rivesaltes" });
    for (const q of ["%25", "_", "%25%25", "R%25s", "Expo_Rives"]) {
      const res = await get(viewer, `/events?q=${q}`);
      expect(res.status).toBe(200);
      expect(res.json.items, `q=${q}`).toHaveLength(0);
    }
  });

  it("le curseur pagine sans trou ni doublon", async () => {
    const viewer = await person("Viewer_66");
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    for (let i = 0; i < 5; i++)
      await createEvent(s.id, { title: `Événement ${i}`, startsAt: new Date(Date.now() + (i + 1) * DAY) });
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 4; page++) {
      const res: { json: { items: { slug: string }[]; nextCursor: string | null } } = await get(
        viewer,
        `/events?sort=affinity&limit=2${cursor ? `&cursor=${cursor}` : ""}`,
      );
      seen.push(...res.json.items.map((i) => i.slug));
      cursor = res.json.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });
});

describe("événements jamais listés", () => {
  it("brouillon, sur invitation, annulé, structure non vérifiée, suspendue ou supprimée", async () => {
    const viewer = await person("Viewer_66");
    const owner = await person("Orga_A");
    const ok = await createStructure(owner.id);
    const unverified = await createStructure(owner.id, false);
    const suspended = await createStructure(owner.id);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, suspended.id));
    const deleted = await createStructure(owner.id);
    await db.update(structures).set({ deletedAt: new Date() }).where(eq(structures.id, deleted.id));

    const listed = await createEvent(ok.id, { title: "Visible Rivesaltes" });
    await createEvent(ok.id, { title: "Brouillon Rivesaltes", status: "draft" });
    await createEvent(ok.id, { title: "Invitation Rivesaltes", admission: "invite_only" });
    await createEvent(ok.id, { title: "Annulé Rivesaltes", status: "cancelled" });
    await createEvent(unverified.id, { title: "Non vérifié Rivesaltes" });
    await createEvent(suspended.id, { title: "Suspendu Rivesaltes" });
    await createEvent(deleted.id, { title: "Supprimé Rivesaltes" });
    // Lot M4 : « passé » à l'heure de l'API (horloge figée du fichier), pas à l'heure réelle du PC.
    await createEvent(ok.id, { title: "Passé Rivesaltes", startsAt: new Date(now().getTime() - 5 * DAY) });

    for (const path of [
      "/events?q=rivesaltes",
      "/events?sort=affinity&q=rivesaltes",
      "/events?sort=distance&q=rivesaltes",
    ]) {
      for (const mode of MODES) {
        const res = await get(viewer, path, mode);
        expect(ids(res.json.items), path).toEqual([listed.slug]);
      }
    }
    const search = await get(viewer, "/search?q=rivesaltes");
    expect(ids(search.json.events)).toEqual([listed.slug]);
    const visitor = await get(null, "/search?q=rivesaltes");
    expect(ids(visitor.json.events)).toEqual([listed.slug]);
  });
});

describe("GET /search : confidentialité des véhicules et des personnes", () => {
  async function garage() {
    const viewer = await person("Viewer_66");
    const pub = await person("Public_Fan", { visibility: "public", departments: ["11"] });
    const priv = await person("Prive_Fan", { visibility: "private", departments: ["34"] });
    const ami = await person("Ami_Prive", { visibility: "private", departments: ["31"] });
    await befriend(viewer, ami);
    await db.insert(profileInterests).values({ userId: priv.id, categoryId: ref.jdm.id });
    const vPub = await createVehicle(pub.id, supra);
    const vPriv = await createVehicle(priv.id, supra);
    const vAmi = await createVehicle(ami.id, supra);
    return { viewer, pub, priv, ami, vPub, vPriv, vAmi };
  }

  it("« Supra » : véhicules et propriétaires ; un compte privé non ami se réduit à marque et modèle, sans photo", async () => {
    const { viewer, pub, vPub, vPriv, vAmi } = await garage();
    // Vague R4, après fusion : une photo sans décision de plaque ne sort pas ; floutée, oui.
    const undecided = (await get(viewer, "/search?q=supra")).json.vehicles as { id: string; photoUrl: string | null }[];
    expect(undecided.find((h) => h.id === vPub.id)?.photoUrl).toBeNull();
    await blurPlatesOf(pub.id);
    for (const mode of MODES) {
      const res = await get(viewer, "/search?q=supra", mode);
      expect(res.status).toBe(200);
      expect(res.json.authenticated).toBe(true);
      const hits = res.json.vehicles as {
        id: string;
        label: string;
        photoUrl: string | null;
        owner: { pseudo: string };
      }[];
      expect(hits.map((h) => h.owner.pseudo).sort()).toEqual(["Ami_Prive", "Prive_Fan", "Public_Fan"]);
      const byId = new Map(hits.map((h) => [h.id, h]));
      expect(byId.get(vPub.id)?.label).toBe("Toyota Supra MK4");
      expect(byId.get(vPub.id)?.photoUrl).toBeTruthy();
      expect(byId.get(vAmi.id)?.label).toBe("Toyota Supra MK4");
      expect(byId.get(vPriv.id)?.label).toBe("Toyota Supra");
      expect(byId.get(vPriv.id)?.photoUrl).toBeNull();
      // Jamais de plaque, de département ni de centre d'intérêt dans un résultat.
      expect(JSON.stringify(res.json)).not.toMatch(/AA-\d{3}-ZZ|AA\d{3}ZZ|plate/i);
    }
  });

  it("la génération ne trouve pas un compte privé non ami (sinon elle la révélerait) mais trouve un compte public et un ami", async () => {
    const { viewer } = await garage();
    const res = await get(viewer, "/search?q=mk4");
    expect(res.json.vehicles.map((h: { owner: { pseudo: string } }) => h.owner.pseudo).sort()).toEqual([
      "Ami_Prive",
      "Public_Fan",
    ]);
    const both = await get(viewer, "/search?q=toyota%20mk4");
    expect(both.json.vehicles).toHaveLength(2);
  });

  it("les personnes se cherchent par pseudo seulement : pas de département, de centre d'intérêt ni de véhicule pour un privé", async () => {
    const { viewer, priv } = await garage();
    type Card = { pseudo: string; departments: string[] | null; vehicles: { label: string }[] };
    const people = [
      ...(await get(viewer, "/search?q=prive")).json.people,
      ...(await get(viewer, "/search?q=ami_")).json.people,
    ] as Card[];
    expect(people.map((p) => p.pseudo).sort()).toEqual(["Ami_Prive", "Prive_Fan"]);
    const privCard = people.find((p) => p.pseudo === "Prive_Fan");
    expect(privCard?.departments).toBeNull();
    expect(privCard?.vehicles.map((v) => v.label)).toEqual(["Toyota Supra"]);
    const amiCard = people.find((p) => p.pseudo === "Ami_Prive");
    expect(amiCard?.departments).toEqual(["31"]);
    // Le département et le centre d'intérêt d'un privé ne sont pas des critères de la recherche de premier niveau.
    for (const q of ["34", "jdm", "youngtimer"]) {
      const miss = await get(viewer, `/search?q=${q}`);
      expect(
        miss.json.people.some((p: { userId: string }) => p.userId === priv.id),
        q,
      ).toBe(false);
    }
    // Une recherche ne se retrouve pas elle-même.
    const self = await get(viewer, "/search?q=viewer");
    expect(self.json.people).toHaveLength(0);
  });

  it("véhicules archivés, comptes supprimés et suspendus : jamais listés", async () => {
    const { viewer, pub, priv, vPub } = await garage();
    await db.update(vehicles).set({ status: "sold" }).where(eq(vehicles.id, vPub.id));
    const afterSold = await get(viewer, "/search?q=supra");
    expect(afterSold.json.vehicles.some((h: { id: string }) => h.id === vPub.id)).toBe(false);

    // Suspendu (la sanction n'a pas encore de route : état posé, comme dans les tests du lot 17).
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 400 * DAY) })
      .where(eq(profiles.userId, priv.id));
    const afterSuspend = await get(viewer, "/search?q=supra");
    expect(afterSuspend.json.vehicles.map((h: { owner: { pseudo: string } }) => h.owner.pseudo)).toEqual(["Ami_Prive"]);
    expect((await get(viewer, "/search?q=prive_fan")).json.people).toHaveLength(0);

    // Supprimé par la vraie route de suppression de compte.
    const del = await app.request("/api/me", {
      method: "DELETE",
      headers: { cookie: pub.cookie, origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ password: "motdepasse-test-123" }),
    });
    expect(del.status).toBe(200);
    const afterDelete = await get(viewer, "/search?q=public_fan");
    expect(afterDelete.json.people).toHaveLength(0);
    expect(
      (await get(viewer, "/search?q=supra")).json.vehicles.some(
        (h: { owner: { pseudo: string } }) => h.owner.pseudo === "Public_Fan",
      ),
    ).toBe(false);
  }, 30_000);
});

describe("GET /search : pros, événements, visiteur, abus", () => {
  it("un visiteur sans compte cherche les événements et les pros, rien d'autre", async () => {
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    const ev = await createEvent(s.id, { title: "Expo Rivesaltes", city: "Rivesaltes" });
    const pro = await createPro(owner.id, { name: "Garage Rivesaltes Auto", city: "Rivesaltes" });
    await createVehicle(owner.id, supra);
    const res = await get(null, "/search?q=rivesaltes");
    expect(res.status).toBe(200);
    expect(res.json.authenticated).toBe(false);
    expect(ids(res.json.events)).toEqual([ev.slug]);
    expect(ids(res.json.pros)).toEqual([pro.slug]);
    expect(res.json.people).toEqual([]);
    expect(res.json.vehicles).toEqual([]);
    expect(res.json.crews).toEqual([]);
    const supraAnon = await get(null, "/search?q=supra");
    expect(supraAnon.json.vehicles).toEqual([]);
    expect(supraAnon.json.people).toEqual([]);
  });

  it("5 résultats par groupe, `more` signale la suite ; la limite se règle jusqu'à 10", async () => {
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    for (let i = 0; i < 7; i++)
      await createEvent(s.id, { title: `Expo ${i}`, startsAt: new Date(Date.now() + (i + 1) * DAY) });
    const res = await get(null, "/search?q=expo");
    expect(res.json.events).toHaveLength(5);
    expect(res.json.more.events).toBe(true);
    expect(res.json.more.pros).toBe(false);
    const ten = await get(null, "/search?q=expo&limit=10");
    expect(ten.json.events).toHaveLength(7);
    expect(ten.json.more.events).toBe(false);
    expect((await get(null, "/search?q=expo&limit=11")).status).toBe(400);
  });

  it("texte trop court ou trop long, absent : 400 ; les jokers ne listent pas tout", async () => {
    const viewer = await person("Viewer_66");
    const owner = await person("Orga_A");
    const s = await createStructure(owner.id);
    await createEvent(s.id, { title: "Expo Rivesaltes" });
    expect((await get(viewer, "/search?q=a")).status).toBe(400);
    expect((await get(viewer, "/search")).status).toBe(400);
    expect((await get(viewer, `/search?q=${"x".repeat(61)}`)).status).toBe(400);
    for (const q of ["%25%25", "__", "%25_"]) {
      const res = await get(viewer, `/search?q=${q}`);
      expect(res.status).toBe(200);
      expect(res.json.events, q).toHaveLength(0);
      expect(res.json.people, q).toHaveLength(0);
      expect(res.json.vehicles, q).toHaveLength(0);
    }
  });

  it("limite de débit : 60 recherches par minute et par personne, 30 par adresse pour un visiteur", async () => {
    const viewer = await person("Viewer_66");
    resetRateLimits();
    for (let i = 0; i < 60; i++) expect((await get(viewer, "/search?q=zz")).status).toBe(200);
    const blocked = await get(viewer, "/search?q=zz");
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe("rate_limited");
    resetRateLimits();
    for (let i = 0; i < 30; i++) expect((await get(null, "/search?q=zz")).status).toBe(200);
    expect((await get(null, "/search?q=zz")).status).toBe(429);
    // Les listes avec un texte comptent dans la même limite.
    resetRateLimits();
    for (let i = 0; i < 30; i++) expect((await get(null, "/events?q=zz")).status).toBe(200);
    expect((await get(null, "/pros?q=zz")).status).toBe(429);
  });
});

describe("GET /pros : filtres, distance, visibilité", () => {
  it("fiches non publiées, supprimées, titulaire suspendu ou supprimé : jamais listées", async () => {
    const viewer = await person("Viewer_66");
    const a = await person("Pro_A");
    const b = await person("Pro_B");
    const c = await person("Pro_C");
    const d = await person("Pro_D");
    const ok = await createPro(a.id, { name: "Garage Visible" });
    await createPro(b.id, { name: "Garage Brouillon", publishedAt: null });
    await createPro(c.id, { name: "Garage Suspendu" });
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 400 * DAY) })
      .where(eq(profiles.userId, c.id));
    await createPro(d.id, { name: "Garage Supprimé" });
    await db.update(proProfiles).set({ deletedAt: new Date() }).where(eq(proProfiles.ownerUserId, d.id));
    for (const mode of MODES) {
      const res = await get(viewer, "/pros?q=garage", mode);
      expect(ids(res.json.items)).toEqual([ok.slug]);
    }
    expect(ids((await get(null, "/pros")).json.items)).toEqual([ok.slug]);
    expect(ids((await get(viewer, "/search?q=garage")).json.pros)).toEqual([ok.slug]);
  });

  it("filtres activité et département (adresse ou zone d'intervention), texte sur le nom, la ville et l'activité", async () => {
    const viewer = await person("Viewer_66");
    const a = await person("Pro_A");
    const b = await person("Pro_B");
    const c = await person("Pro_C");
    const detailing = await createPro(a.id, {
      name: "Brillance",
      activities: ["detailing"],
      department: "66",
      ...PERPIGNAN,
    });
    const covering = await createPro(b.id, {
      name: "Wrap Studio",
      activities: ["covering"],
      department: null,
      city: null,
      lat: null,
      lng: null,
      interventionDepartments: ["66", "11"],
    });
    await createPro(c.id, { name: "Pièces Paris", activities: ["parts"], department: "75", city: "Paris", ...PARIS });
    expect(ids((await get(viewer, "/pros?activity=detailing")).json.items)).toEqual([detailing.slug]);
    expect(ids((await get(viewer, "/pros?department=66")).json.items).sort()).toEqual(
      [detailing.slug, covering.slug].sort(),
    );
    expect(ids((await get(viewer, "/pros?department=11")).json.items)).toEqual([covering.slug]);
    expect(ids((await get(viewer, "/pros?q=detailing")).json.items)).toEqual([detailing.slug]);
    expect(ids((await get(viewer, "/pros?q=wrap")).json.items)).toEqual([covering.slug]);
    expect(ids((await get(viewer, "/pros?q=paris&activity=parts")).json.items)).toHaveLength(1);
    // Lot R1 : sans accents ni casse, comme les événements (« pieces » trouve « Pièces Paris »).
    expect(ids((await get(viewer, "/pros?q=pieces")).json.items)).toHaveLength(1);
    expect(ids((await get(viewer, "/pros?q=PIÈC")).json.items)).toHaveLength(1);
    expect((await get(viewer, "/pros?activity=inconnue")).status).toBe(400);
  });

  it("tri par distance depuis le secteur, rayon, fiches sans adresse en dernier", async () => {
    const viewer = await person("Viewer_66", { departments: ["66"] });
    const a = await person("Pro_A");
    const b = await person("Pro_B");
    const c = await person("Pro_C");
    const d = await person("Pro_D");
    const near = await createPro(a.id, { name: "Près", ...RIVESALTES });
    const mid = await createPro(b.id, { name: "Narbonne Auto", ...NARBONNE });
    const far = await createPro(c.id, { name: "Paris Auto", ...PARIS });
    const zone = await createPro(d.id, {
      name: "À domicile",
      lat: null,
      lng: null,
      city: null,
      interventionDepartments: ["66"],
    });
    for (const mode of MODES) {
      const res = await get(viewer, "/pros?sort=distance", mode);
      expect(ids(res.json.items)).toEqual([near, mid, far, zone].map((p) => p.slug));
      expect(res.json.items[0].distanceKm).toBeGreaterThan(0);
      expect(res.json.items[3].distanceKm).toBeNull();
    }
    // Lot R2 : avec un rayon, le pro sans atelier qui se déplace dans le secteur reste (« Se déplacent chez toi »).
    expect(ids((await get(viewer, "/pros?radiusKm=50")).json.items)).toEqual([near.slug, zone.slug]);
    expect(ids((await get(viewer, `/pros?sort=distance&lat=${PARIS.lat}&lng=${PARIS.lng}`)).json.items)[0]).toBe(
      far.slug,
    );
    // Sans compte ni position : alphabétique, sans distance.
    const anon = await get(null, "/pros?sort=distance");
    expect(anon.json.items[0].distanceKm).toBeUndefined();
  });

  it("après le 21/06/2027 sans abonnement : fiche de base listée sans remise ni publication, plus de « vérifiés d'abord »", async () => {
    const viewer = await person("Viewer_66");
    const a = await person("Pro_A");
    const b = await person("Pro_B");
    await createPro(a.id, { name: "Alpha Auto" });
    await createPro(b.id, { name: "Zèbre Auto", verifiedAt: new Date() });
    const names = async () => (await get(viewer, "/pros")).json.items.map((p: { name: string }) => p.name);
    // Avant la date : les pros vérifiés d'abord.
    expect(await names()).toEqual(["Zèbre Auto", "Alpha Auto"]);
    // Après : fiche de base, plus de mise en avant, ordre alphabétique.
    useClock(fromWallTime({ year: 2027, month: 7, day: 1, hour: 12, minute: 0 }));
    expect(await names()).toEqual(["Alpha Auto", "Zèbre Auto"]);
    const res = await get(viewer, "/pros");
    for (const card of res.json.items) {
      expect(Object.keys(card).sort()).toEqual(
        [
          "activities",
          "city",
          "department",
          // Lot R2 : l'étoile du garage favori (connecté) ; la remise reste absente de la fiche de base.
          "favorite",
          "followersCount",
          "interventionDepartments",
          "lat",
          "lng",
          "logoUrl",
          "name",
          "registryName",
          "slug",
          "verified",
        ].sort(),
      );
    }
  });
});
