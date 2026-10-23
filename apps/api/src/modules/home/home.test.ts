// Accueil complet (lot 30) : sources externes (lavage, carburant : réponses réelles enregistrées, aucun appel réseau),
// cache en base (expiration, indisponibilité, un seul appel), agrégation `GET /me/home` (chaque widget absent sans donnée,
// rayon mis à jour, position de l'appareil jamais enregistrée), réglage des widgets, garage favori, emplacement
// sponsorisé (ciblage, période, plafond, pondération, clics), confidentialité. Routes essayées en cookie ET en porteur.
import { readFileSync } from "node:fs";
import { PRO_PAID_FROM } from "@orasso/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
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
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  adminAuditLog,
  applications,
  externalCache,
  proFollows,
  profileInterests,
  profiles,
  proProfiles,
  sponsoredDailySeen,
  sponsoredDailyStats,
  sponsoredPlacements,
  structures,
} from "../../db/schema";
import { setExternalFetch } from "../../lib/external/cache";
import { fuelNear, fuelUrl, parseFuel } from "../../lib/external/fuel";
import { parseOverpass, washNear } from "../../lib/external/overpass";
import { resetRateLimits } from "../../lib/rateLimit";
import { homeService, nearestPlaces, pickNextAccess } from "./service";
import { sponsoredService } from "./sponsored";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-17T10:00:00Z");
const MODES = ["cookie", "bearer"] as const;
type Mode = (typeof MODES)[number];

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../test/fixtures/${name}`, import.meta.url), "utf8"));

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
  return { status: res.status, json, headers: res.headers };
}

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await resetDb();
  await db.delete(externalCache);
  clock = useClock(NOW);
  setExternalFetch(null);
});
afterEach(() => setExternalFetch(null));

/** `fetch` simulé : une réponse par source, avec compteur d'appels. */
function sources(over: { wash?: () => Response; fuel?: () => Response } = {}) {
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("overpass")) return over.wash ? over.wash() : Response.json(fixture("overpass-66.json"));
    return over.fuel ? over.fuel() : Response.json(fixture("fuel-66.json"));
  });
  setExternalFetch(fn as unknown as typeof fetch);
  return fn;
}

async function user(pseudo: string, departments: string[] = ["66"]) {
  const u = await signUp(pseudo);
  await db.update(profiles).set({ departments }).where(eq(profiles.userId, u.id));
  return u;
}

describe("sources externes : lecture des réponses réelles", () => {
  it("Overpass : lieux désaffectés retirés, plus proche d'abord, au plus 10, nom de repli", () => {
    const places = parseOverpass(fixture("overpass-66.json"), { lat: 42.62, lng: 2.52 });
    expect(places.length).toBeGreaterThan(0);
    expect(places.length).toBeLessThanOrEqual(10);
    // L'ancien lavage « Intermarché » est marqué `disused=yes` dans OpenStreetMap : jamais proposé.
    expect(places.some((p) => p.name === "Intermarché" && p.lat === 42.62182)).toBe(false);
    for (const p of places) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(p.lat) && Number.isFinite(p.lng)).toBe(true);
    }
    expect(parseOverpass({ nope: true }, { lat: 0, lng: 0 })).toEqual([]);
  });

  it("carburant : prix plausibles seulement, position et date, adresse lisible", () => {
    const stations = parseFuel(fixture("fuel-66.json"));
    expect(stations.length).toBeGreaterThan(0);
    const prades = stations.find((s) => s.address?.includes("Prades"));
    expect(prades).toMatchObject({ prices: { gazole: 2.339, sp98: 2.289, e85: 0.858, sp95: null } });
    expect(prades?.updatedAt).toBe("2026-10-16T07:27:44.000Z");
    expect(parseFuel({ results: [{ geom: { lat: 1, lon: 1 }, gazole_prix: 99 }] })).toEqual([]);
    expect(parseFuel({ results: [{ sp95_prix: 1.9 }] })).toEqual([]);
    expect(parseFuel(null)).toEqual([]);
  });

  it("carburant : la requête charge tout le département (code_departement), par pages de 100", () => {
    const url = new URL(fuelUrl("https://exemple.test/records", "66", 100));
    expect(url.searchParams.get("where")).toBe('code_departement="66"');
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("offset")).toBe("100");
  });

  it("les stations les plus proches de la position sont triées avec leur distance", () => {
    const list = nearestPlaces(
      [
        { name: "loin", address: null, lat: 43, lng: 3 },
        { name: "près", address: null, lat: 42.71, lng: 2.9 },
      ],
      { lat: 42.7, lng: 2.9 },
    );
    expect(list.map((p) => p.name)).toEqual(["près", "loin"]);
    expect(list[0]?.distanceKm).toBeLessThan(2);
  });
});

describe("cache des sources externes", () => {
  it("jamais d'appel réseau dans les tests sans simulation : listes vides", async () => {
    expect(await washNear("66")).toEqual([]);
    expect(await fuelNear("66")).toEqual([]);
  });

  it("un seul appel tant que le cache est valable, puis un nouvel appel à l'expiration (carburant 1 h, lavage 7 j)", async () => {
    const fetched = sources();
    expect((await fuelNear("66")).length).toBeGreaterThan(0);
    expect((await washNear("66")).length).toBeGreaterThan(0);
    expect(fetched).toHaveBeenCalledTimes(2);
    await fuelNear("66");
    await washNear("66");
    expect(fetched).toHaveBeenCalledTimes(2);
    clock.advance(HOUR + 1000);
    await fuelNear("66");
    await washNear("66");
    expect(fetched).toHaveBeenCalledTimes(3); // carburant seulement
    clock.advance(7 * DAY);
    await washNear("66");
    expect(fetched).toHaveBeenCalledTimes(4);
  });

  it("appels simultanés regroupés : un seul appel au fournisseur", async () => {
    const fetched = sources();
    await Promise.all([fuelNear("66"), fuelNear("66"), fuelNear("66")]);
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("source indisponible : tableau vide sans cache, ancien cache sinon ; pas de nouvel appel avant 10 minutes", async () => {
    const fetched = sources({ fuel: () => new Response("panne", { status: 503 }) });
    expect(await fuelNear("66")).toEqual([]);
    expect(await fuelNear("66")).toEqual([]);
    expect(fetched).toHaveBeenCalledTimes(1);
    clock.advance(11 * 60_000);
    await fuelNear("66");
    expect(fetched).toHaveBeenCalledTimes(2);

    // Cache existant puis panne : l'ancien cache sert (moins d'un jour), puis plus rien.
    setExternalFetch(null);
    sources();
    clock.advance(11 * 60_000);
    expect((await fuelNear("66")).length).toBeGreaterThan(0);
    sources({ fuel: () => new Response("panne", { status: 503 }) });
    clock.advance(HOUR + 1000);
    expect((await fuelNear("66")).length).toBeGreaterThan(0);
    clock.advance(25 * HOUR);
    sources({ fuel: () => new Response("panne", { status: 503 }) });
    expect(await fuelNear("66")).toEqual([]);
  });

  it("réponse sans liste (message d'erreur en 200) : un échec, pas une liste vide mise en cache", async () => {
    sources({ wash: () => Response.json({ remark: "runtime error: Query timed out" }) });
    expect(await washNear("66")).toEqual([]);
    expect(await db.query.externalCache.findFirst({ where: eq(externalCache.key, "wash:66") })).toBeUndefined();
  });

  it("département inconnu ou source désactivée : rien", async () => {
    const fetched = sources();
    expect(await washNear("00")).toEqual([]);
    expect(fetched).not.toHaveBeenCalled();
  });

  it("envoie un User-Agent identifiant", async () => {
    const fetched = sources();
    await washNear("66");
    const init = fetched.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(new Headers(init[1].headers).get("user-agent")).toMatch(/^Orasso\//);
  });
});

describe("GET /me/home : agrégation", () => {
  it.each(MODES)(
    "compte neuf sans donnée (%s) : chaque widget absent, réglage par défaut, cache privé",
    async (mode) => {
      const u = await user("Neuf_Home", []);
      const r = await req(u, "GET", "/me/home", undefined, mode);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("private, no-cache");
      expect(r.json).toMatchObject({
        nextAccess: null,
        pendingStatuses: [],
        nearby: { radiusKm: 50, source: null, events: [] },
        weather: null,
        favoriteGarage: null,
        wash: [],
        fuel: [],
        agenda: [],
        sponsored: null,
        widgets: {
          order: ["next_access", "pending", "nearby", "weather", "agenda", "favorite_garage", "wash", "fuel"],
          hidden: [],
        },
      });
      expect(r.json.nudge).toBe("verify_email");
    },
  );

  it("sans connexion : 401", async () => {
    expect((await req(null, "GET", "/me/home")).status).toBe(401);
    expect((await req(null, "PUT", "/me/home/widgets", { order: [], hidden: [] })).status).toBe(401);
  });

  it("prochain accès, en attente et agenda viennent des candidatures à venir", async () => {
    const ref = await seedReference();
    const orga = await signUp("Orga_Home");
    const s = await createStructure(orga.id);
    const u = await user("Fan_Home");
    const v = await createVehicle(u.id, ref);
    const e1 = await createEvent(s.id, { title: "Premier", startsAt: new Date(NOW.getTime() + 3 * DAY) });
    const e2 = await createEvent(s.id, { title: "Second", startsAt: new Date(NOW.getTime() + 6 * DAY) });
    const base = { userId: u.id, vehicleId: v.id, rulesAcceptedAt: NOW, followStructure: false };
    await db.insert(applications).values({ ...base, eventId: e1.id, status: "pending" });
    const r0 = await req(u, "GET", "/me/home");
    expect(r0.json.nextAccess.event.title).toBe("Premier");
    expect(r0.json.pendingStatuses).toHaveLength(1);
    await db.insert(applications).values({ ...base, eventId: e2.id, status: "accepted" });
    const r = await req(u, "GET", "/me/home");
    // La retenue passe avant la candidature en cours, même plus lointaine.
    expect(r.json.nextAccess.event.title).toBe("Second");
    expect(r.json.pendingStatuses.map((a: { event: { title: string } }) => a.event.title)).toEqual(["Premier"]);
    expect(r.json.agenda).toHaveLength(2);
    expect(pickNextAccess([])).toBeNull();
  });

  it("autour de moi : 50 km puis 150 km, trié, sans événement privé, sans structure suspendue, sans mes candidatures", async () => {
    const orga = await signUp("Orga_Autour");
    const s = await createStructure(orga.id);
    const suspended = await createStructure(orga.id);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, suspended.id));
    const at = (days: number) => new Date(NOW.getTime() + days * DAY);
    const canet = await createEvent(s.id, { title: "Canet", lat: 42.7, lng: 3.03, startsAt: at(5), department: "66" });
    const narbonne = await createEvent(s.id, {
      title: "Narbonne",
      lat: 43.18,
      lng: 3.0,
      startsAt: at(6),
      department: "11",
    });
    const toulouse = await createEvent(s.id, {
      title: "Toulouse",
      lat: 43.6,
      lng: 1.44,
      startsAt: at(7),
      department: "31",
    });
    await createEvent(s.id, { title: "Paris", lat: 48.86, lng: 2.35, startsAt: at(8), department: "75" });
    await createEvent(s.id, {
      title: "Privé",
      lat: 42.7,
      lng: 3.0,
      startsAt: at(5),
      admission: "invite_only",
      department: "66",
    });
    await createEvent(suspended.id, { title: "Suspendue", lat: 42.7, lng: 3.0, startsAt: at(5), department: "66" });
    await createEvent(s.id, { title: "Passé", lat: 42.7, lng: 3.0, startsAt: new Date(NOW.getTime() - 5 * DAY) });

    const u = await user("Autour_Home");
    const titles = (j: { nearby: { events: { title: string }[] } }) => j.nearby.events.map((e) => e.title);
    const near = await req(u, "GET", "/me/home");
    expect(near.json.nearby).toMatchObject({ radiusKm: 50, source: "sector" });
    expect(titles(near.json)).toEqual(["Canet"]);

    const far = await req(u, "GET", "/me/home?radiusKm=150");
    expect(far.json.nearby.radiusKm).toBe(150);
    expect(titles(far.json)).toEqual(expect.arrayContaining(["Canet", "Narbonne"]));
    expect(titles(far.json)).not.toContain("Paris");
    expect(titles(far.json)).not.toContain("Privé");
    expect(titles(far.json)).not.toContain("Suspendue");
    expect(titles(far.json)).not.toContain("Passé");
    // Une lecture n'écrit pas : le rayon ne s'enregistre que par PATCH /me/settings, et la lecture suivante le garde.
    expect((await db.query.profiles.findFirst({ where: eq(profiles.userId, u.id) }))?.radiusKm).toBe(50);
    expect((await req(u, "GET", "/me/home")).json.nearby.radiusKm).toBe(50);
    expect((await req(u, "PATCH", "/me/settings", { radiusKm: 150 })).status).toBe(200);
    expect((await req(u, "GET", "/me/home")).json.nearby.radiusKm).toBe(150);
    // Au-delà de 200 km : refusé. « Partout en France » (`null`) : plus de limite, toujours depuis le coin enregistré.
    expect((await req(u, "PATCH", "/me/settings", { radiusKm: 250 })).status).toBe(400);
    expect((await req(u, "PATCH", "/me/settings", { radiusKm: null })).status).toBe(200);
    const wide = await req(u, "GET", "/me/home");
    expect(wide.json.nearby).toMatchObject({ radiusKm: null, source: "sector" });
    expect(titles(wide.json)).toContain("Toulouse");

    // Candidat à Canet : il ne lui est plus suggéré.
    const ref = await seedReference();
    const v = await createVehicle(u.id, ref);
    await db.insert(applications).values({
      eventId: canet.id,
      userId: u.id,
      vehicleId: v.id,
      status: "pending",
      rulesAcceptedAt: NOW,
      followStructure: false,
    });
    expect(titles((await req(u, "GET", "/me/home?radiusKm=150")).json)).not.toContain("Canet");
    expect(narbonne.id).toBeTruthy();
    expect(toulouse.id).toBeTruthy();
  });

  it("rayon hors bornes : 400 ; compte suspendu : le rayon sert à l'affichage, PATCH refusé", async () => {
    const u = await user("Rayon_Home");
    expect((await req(u, "GET", "/me/home?radiusKm=5")).status).toBe(400);
    expect((await req(u, "GET", "/me/home?radiusKm=201")).status).toBe(400);
    expect((await req(u, "GET", "/me/home?radiusKm=abc")).status).toBe(400);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(NOW.getTime() + DAY) })
      .where(eq(profiles.userId, u.id));
    const r = await req(u, "GET", "/me/home?radiusKm=200");
    expect(r.status).toBe(200);
    expect(r.json.nearby.radiusKm).toBe(200);
    expect((await db.query.profiles.findFirst({ where: eq(profiles.userId, u.id) }))?.radiusKm).toBe(50);
    expect((await req(u, "PATCH", "/me/settings", { radiusKm: 100 })).status).toBe(403);
  });

  it("position de l'appareil : arrondie par le serveur, jamais enregistrée, utilisée pour cet affichage seulement", async () => {
    const orga = await signUp("Orga_Pos");
    const s = await createStructure(orga.id);
    await createEvent(s.id, { title: "Paris", lat: 48.86, lng: 2.35, startsAt: new Date(NOW.getTime() + 5 * DAY) });
    const u = await user("Pos_Home");
    expect((await req(u, "GET", "/me/home")).json.nearby.events).toEqual([]);
    const before = await db.query.profiles.findFirst({ where: eq(profiles.userId, u.id) });
    const r = await req(u, "GET", "/me/home?lat=48.8566&lng=2.3522");
    expect(r.json.nearby.source).toBe("device");
    expect(r.json.nearby.events.map((e: { title: string }) => e.title)).toEqual(["Paris"]);
    expect(JSON.stringify(r.json)).not.toContain("48.8566");
    const after = await db.query.profiles.findFirst({ where: eq(profiles.userId, u.id) });
    expect(after?.departments).toEqual(before?.departments);
    expect(after?.radiusKm).toBe(before?.radiusKm);
    // Une moitié de couple est refusée.
    expect((await req(u, "GET", "/me/home?lat=48.8")).status).toBe(400);
  });

  it("lavage et carburant : distances à ma position, cache du département, rien ne sort sans position", async () => {
    const fetched = sources();
    const u = await user("Station_Home");
    const r = await req(u, "GET", "/me/home");
    expect(r.json.wash.length).toBeGreaterThan(0);
    expect(r.json.wash.length).toBeLessThanOrEqual(3);
    expect(r.json.fuel.length).toBeGreaterThan(0);
    for (const p of [...r.json.wash, ...r.json.fuel]) {
      expect(typeof p.distanceKm).toBe("number");
      expect(p.name).toBeTruthy();
    }
    expect(r.json.fuel[0].prices).toBeTruthy();
    const sorted = [...r.json.fuel].sort((a, b) => a.distanceKm - b.distanceKm);
    expect(r.json.fuel).toEqual(sorted);
    expect(fetched).toHaveBeenCalledTimes(2);
    // Deux autres chargements, un autre compte du même département : aucun appel de plus.
    await req(u, "GET", "/me/home");
    await req(await user("Station_Deux"), "GET", "/me/home");
    expect(fetched).toHaveBeenCalledTimes(2);

    // Sans secteur ni position : aucune station, aucun appel.
    setExternalFetch(null);
    const none = sources();
    const lost = await user("Perdu_Home", []);
    const rl = await req(lost, "GET", "/me/home");
    expect(rl.json.wash).toEqual([]);
    expect(rl.json.fuel).toEqual([]);
    expect(none).not.toHaveBeenCalled();
  });

  it("sources en panne : l'accueil répond quand même, sans ces widgets", async () => {
    sources({ wash: () => new Response("", { status: 429 }), fuel: () => new Response("", { status: 500 }) });
    const u = await user("Panne_Home");
    const r = await req(u, "GET", "/me/home");
    expect(r.status).toBe(200);
    expect(r.json.wash).toEqual([]);
    expect(r.json.fuel).toEqual([]);
  });

  it("une source lente ne retarde pas l'accueil (budget de 2,5 s)", async () => {
    const slow = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => resolve(Response.json(fixture("fuel-66.json"))), 4000);
        }),
    );
    setExternalFetch(slow as unknown as typeof fetch);
    const u = await user("Lent_Home");
    const t0 = Date.now();
    const r = await req(u, "GET", "/me/home");
    expect(Date.now() - t0).toBeLessThan(3600);
    expect(r.json.fuel).toEqual([]);
  }, 15_000);

  it("incitation : une seule à la fois, la sécurité d'abord", async () => {
    const u = await user("Nudge_Home");
    const ref = await seedReference();
    expect((await req(u, "GET", "/me/home")).json.nudge).toBe("verify_email");
    const { user: userTable } = await import("../../db/schema");
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, u.id));
    expect((await req(u, "GET", "/me/home")).json.nudge).toBe("add_vehicle");
    await createVehicle(u.id, ref);
    expect((await req(u, "GET", "/me/home")).json.nudge).toBe("create_crew");
    // Organisateur sans second facteur : l'activation passe avant.
    const s = await createStructure(u.id);
    expect(s.id).toBeTruthy();
    expect((await req(u, "GET", "/me/home")).json.nudge).toBe("enable_2fa");
  });
});

describe("widgets réglables", () => {
  it.each(MODES)("PUT /me/home/widgets (%s) : ordre et masquage enregistrés et relus", async (mode) => {
    const u = await user("Widgets_Home");
    const put = await req(u, "PUT", "/me/home/widgets", { order: ["fuel", "weather"], hidden: ["wash"] }, mode);
    expect(put.status).toBe(200);
    expect(put.json.order[0]).toBe("next_access");
    expect(put.json.order.slice(1, 3)).toEqual(["fuel", "weather"]);
    expect(put.json.order).toHaveLength(8);
    expect(put.json.hidden).toEqual(["wash"]);
    const home = await req(u, "GET", "/me/home", undefined, mode);
    expect(home.json.widgets).toEqual(put.json);
    const settings = await req(u, "GET", "/me/settings", undefined, mode);
    expect(settings.json.homeWidgets).toEqual(put.json);
  });

  it("« Prochain accès » reste en tête et ne se masque pas", async () => {
    const u = await user("Fixe_Home");
    const put = await req(u, "PUT", "/me/home/widgets", { order: ["nearby", "next_access"], hidden: ["next_access"] });
    expect(put.json.order[0]).toBe("next_access");
    expect(put.json.hidden).toEqual([]);
  });

  it("validation stricte : identifiant inconnu, champ en trop, listes trop longues, ancien format", async () => {
    const u = await user("Strict_Home");
    expect((await req(u, "PUT", "/me/home/widgets", { order: ["inconnu"], hidden: [] })).status).toBe(400);
    expect((await req(u, "PUT", "/me/home/widgets", { order: [], hidden: [], plus: 1 })).status).toBe(400);
    expect((await req(u, "PUT", "/me/home/widgets", { order: Array(30).fill("fuel"), hidden: [] })).status).toBe(400);
    expect((await req(u, "PUT", "/me/home/widgets", [{ id: "meteo", visible: true }])).status).toBe(400);
    expect((await req(u, "PUT", "/me/home/widgets", { order: "fuel" })).status).toBe(400);
    expect((await req(u, "PATCH", "/me/settings", { homeWidgets: { order: ["x"], hidden: [] } })).status).toBe(400);
    expect((await req(u, "PATCH", "/me/settings", { homeWidgets: { order: ["weather"], hidden: [] } })).status).toBe(
      200,
    );
  });

  it("un widget masqué n'est pas calculé : aucun appel de source externe", async () => {
    const fetched = sources();
    const u = await user("Cache_Home");
    await req(u, "PUT", "/me/home/widgets", { order: [], hidden: ["wash", "fuel"] });
    const r = await req(u, "GET", "/me/home");
    expect(r.json.wash).toEqual([]);
    expect(r.json.fuel).toEqual([]);
    expect(fetched).not.toHaveBeenCalled();
    await req(u, "PUT", "/me/home/widgets", { order: [], hidden: [] });
    await req(u, "GET", "/me/home");
    expect(fetched).toHaveBeenCalledTimes(2);
  });

  it("valeur enregistrée illisible (ancien format) : l'ordre par défaut", async () => {
    const u = await user("Ancien_Home");
    await db
      .update(profiles)
      .set({ homeWidgets: [{ id: "meteo", visible: false }] })
      .where(eq(profiles.userId, u.id));
    expect((await req(u, "GET", "/me/home")).json.widgets.order).toHaveLength(8);
  });

  it("compte suspendu : lecture seule, écriture refusée", async () => {
    const u = await user("Suspendu_Home");
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(NOW.getTime() + DAY) })
      .where(eq(profiles.userId, u.id));
    expect((await req(u, "GET", "/me/home")).status).toBe(200);
    const put = await req(u, "PUT", "/me/home/widgets", { order: ["fuel"], hidden: [] });
    expect(put.status).toBe(403);
    expect(put.json.error.code).toBe("suspended");
    const pro = await createPro((await signUp("Pro_Susp")).id);
    expect((await req(u, "POST", `/pros/${pro.id}/favorite`)).status).toBe(403);
  });
});

describe("garage favori", () => {
  async function setup() {
    const owner = await signUp("Pro_Garage");
    const pro = await createPro(owner.id, { name: "Garage Kenji", phone: "0468000000", lat: 42.7, lng: 2.9 });
    const u = await user("Fan_Garage");
    return { owner, pro, u };
  }

  it.each(MODES)("POST/DELETE /pros/:id/favorite (%s) : un seul favori, suivi automatiquement", async (mode) => {
    const { owner, pro, u } = await setup();
    expect((await req(u, "GET", "/me/home", undefined, mode)).json.favoriteGarage).toBeNull();
    expect((await req(u, "POST", `/pros/${pro.id}/favorite`, undefined, mode)).status).toBe(204);
    const home = await req(u, "GET", "/me/home", undefined, mode);
    expect(home.json.favoriteGarage).toMatchObject({ slug: pro.slug, name: "Garage Kenji", phone: "0468000000" });
    expect(await db.query.proFollows.findFirst({ where: eq(proFollows.userId, u.id) })).toMatchObject({
      favorite: true,
    });

    // Un second pro prend la place : un seul favori par personne.
    const pro2 = await createPro((await signUp("Pro_Deux")).id, { name: "Autre garage" });
    expect((await req(u, "POST", `/pros/${pro2.id}/favorite`, undefined, mode)).status).toBe(204);
    expect((await req(u, "GET", "/me/home", undefined, mode)).json.favoriteGarage.name).toBe("Autre garage");
    const rows = await db.query.proFollows.findMany({ where: eq(proFollows.userId, u.id) });
    expect(rows.filter((r) => r.favorite)).toHaveLength(1);
    expect(rows).toHaveLength(2);

    // Retirer le favori garde l'abonnement.
    expect((await req(u, "DELETE", `/pros/${pro2.id}/favorite`, undefined, mode)).status).toBe(204);
    expect((await req(u, "GET", "/me/home", undefined, mode)).json.favoriteGarage).toBeNull();
    expect(await db.query.proFollows.findFirst({ where: eq(proFollows.proId, pro2.id) })).toBeTruthy();
    expect(owner.id).toBeTruthy();
  });

  it("réservé aux pros visibles : publié, titulaire en règle, pas le sien, fiche complète", async () => {
    const { owner, pro, u } = await setup();
    // Brouillon et fiche supprimée : introuvables.
    await db.update(proProfiles).set({ publishedAt: null }).where(eq(proProfiles.id, pro.id));
    expect((await req(u, "POST", `/pros/${pro.id}/favorite`)).status).toBe(404);
    await db
      .update(proProfiles)
      .set({ publishedAt: new Date(0) })
      .where(eq(proProfiles.id, pro.id));
    // Sa propre fiche.
    expect((await req(owner, "POST", `/pros/${pro.id}/favorite`)).status).toBe(400);
    // Titulaire suspendu.
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(NOW.getTime() + DAY) })
      .where(eq(profiles.userId, owner.id));
    expect((await req(u, "POST", `/pros/${pro.id}/favorite`)).status).toBe(404);
    await db.update(profiles).set({ suspendedUntil: null }).where(eq(profiles.userId, owner.id));
    expect((await req(u, "POST", `/pros/${pro.id}/favorite`)).status).toBe(204);
    // Titulaire suspendu après coup, ou fiche dépubliée : le widget disparaît.
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(NOW.getTime() + DAY) })
      .where(eq(profiles.userId, owner.id));
    expect((await req(u, "GET", "/me/home")).json.favoriteGarage).toBeNull();
    await db.update(profiles).set({ suspendedUntil: null }).where(eq(profiles.userId, owner.id));
    expect((await req(u, "GET", "/me/home")).json.favoriteGarage).not.toBeNull();
    await db.update(proProfiles).set({ publishedAt: null }).where(eq(proProfiles.id, pro.id));
    expect((await req(u, "GET", "/me/home")).json.favoriteGarage).toBeNull();
    expect((await req(u, "POST", "/pros/00000000-0000-4000-8000-000000000000/favorite")).status).toBe(404);
  });

  it("après le 21/06/2027, une fiche de base n'est plus proposée en garage favori (proVisibility)", async () => {
    const { pro, u } = await setup();
    expect((await req(u, "POST", `/pros/${pro.id}/favorite`)).status).toBe(204);
    clock.set(new Date(PRO_PAID_FROM.getTime() + DAY));
    expect((await req(u, "GET", "/me/home")).json.favoriteGarage).toBeNull();
    const other = await createPro((await signUp("Pro_Tard")).id);
    const r = await req(u, "POST", `/pros/${other.id}/favorite`);
    expect(r.status).toBe(403);
  });

  it("le garage favori d'une personne n'est jamais lisible par une autre", async () => {
    const { pro, u } = await setup();
    await req(u, "POST", `/pros/${pro.id}/favorite`);
    const other = await user("Curieux_Garage");
    expect((await req(other, "GET", "/me/home")).json.favoriteGarage).toBeNull();
  });
});

describe("emplacement sponsorisé", () => {
  const today = "2026-10-17";
  async function placement(proId: string, over: Partial<typeof sponsoredPlacements.$inferInsert> = {}) {
    const [p] = await db
      .insert(sponsoredPlacements)
      .values({
        proProfileId: proId,
        title: "Jantes d'hiver",
        body: "-15 % sur la pose",
        linkUrl: "https://exemple.fr/offre",
        startsOn: "2026-10-01",
        endsOn: "2026-10-31",
        status: "active",
        ...over,
      })
      .returning();
    return p!;
  }

  async function withPro() {
    const owner = await signUp("Pro_Sponso");
    const pro = await createPro(owner.id, { name: "Pneus 66" });
    return { owner, pro };
  }

  it.each(MODES)(
    "carte « Sponsorisé » (%s) : seulement le nécessaire, aucune donnée personnelle, affichage compté",
    async (mode) => {
      const { pro } = await withPro();
      const p = await placement(pro.id);
      const u = await user("Cible_Sponso");
      const r = await req(u, "GET", "/me/home", undefined, mode);
      expect(r.json.sponsored).toEqual({
        id: p.id,
        title: "Jantes d'hiver",
        body: "-15 % sur la pose",
        imageUrl: null,
        linkUrl: "https://exemple.fr/offre",
        pro: { slug: pro.slug, name: "Pneus 66", logoUrl: null },
      });
      const row = await db.query.sponsoredPlacements.findFirst({ where: eq(sponsoredPlacements.id, p.id) });
      expect(row?.impressions).toBe(1);
      const day = await db.query.sponsoredDailyStats.findFirst({ where: eq(sponsoredDailyStats.placementId, p.id) });
      expect(day).toMatchObject({ day: today, impressions: 1, clicks: 0 });
    },
  );

  it("ciblage : département du secteur et centres d'intérêt, vide = tous", async () => {
    const { pro } = await withPro();
    const ref = await seedReference();
    const only66 = await placement(pro.id, { title: "Seulement 66", departments: ["66"] });
    const only31 = await placement(pro.id, { title: "Seulement 31", departments: ["31"] });
    const u66 = await user("U66_Sponso", ["66"]);
    const u31 = await user("U31_Sponso", ["31"]);
    const seen = async (u: TestUser) => (await req(u, "GET", "/me/home")).json.sponsored?.title;
    // Deux emplacements ciblés : chacun ne voit que le sien.
    expect(await seen(u66)).toBe("Seulement 66");
    expect(await seen(u31)).toBe("Seulement 31");
    await db.delete(sponsoredPlacements).where(eq(sponsoredPlacements.id, only66.id));
    expect(await seen(u66)).toBeUndefined();
    expect(only31.id).toBeTruthy();
    // Ciblage par centre d'intérêt : visible seulement pour qui a la catégorie parmi ses centres d'intérêt.
    await placement(pro.id, { title: "JDM", categoryIds: [ref.jdm.id] });
    expect(await seen(u66)).toBeUndefined();
    await db.insert(profileInterests).values({ userId: u66.id, categoryId: ref.jdm.id });
    expect(await seen(u66)).toBe("JDM");
    expect(await seen(u31)).not.toBe("JDM");
  });

  it("statut, période et plafond du jour", async () => {
    const { pro } = await withPro();
    const u = await user("Per_Sponso");
    const seen = async () => (await req(u, "GET", "/me/home")).json.sponsored?.id;
    const draft = await placement(pro.id, { status: "draft" });
    const paused = await placement(pro.id, { status: "paused" });
    const ended = await placement(pro.id, { status: "ended" });
    const future = await placement(pro.id, { startsOn: "2026-10-18", endsOn: "2026-10-30" });
    const past = await placement(pro.id, { startsOn: "2026-09-01", endsOn: "2026-10-16" });
    expect(await seen()).toBeUndefined();
    expect([draft, paused, ended, future, past]).toHaveLength(5);
    const capped = await placement(pro.id, { dailyCap: 2 });
    // Un affichage n'est compté qu'une fois par personne et par jour : recharger l'Accueil ne consomme pas le plafond.
    for (let i = 0; i < 5; i++) expect(await seen()).toBe(capped.id);
    const total = async () =>
      (await db.query.sponsoredPlacements.findFirst({ where: eq(sponsoredPlacements.id, capped.id) }))?.impressions;
    expect(await total()).toBe(1);
    const u2 = await user("Per_Deux");
    expect((await req(u2, "GET", "/me/home")).json.sponsored?.id).toBe(capped.id);
    // Plafond de 2 atteint par deux personnes : une troisième ne voit plus rien aujourd'hui, les deux premières gardent le leur…
    const u3 = await user("Per_Trois");
    expect((await req(u3, "GET", "/me/home")).json.sponsored).toBeNull();
    expect(await seen()).toBe(capped.id);
    expect(await total()).toBe(2);
    // … le lendemain, oui.
    await db.delete(sponsoredPlacements).where(eq(sponsoredPlacements.id, future.id));
    clock.advance(DAY);
    expect((await req(u3, "GET", "/me/home")).json.sponsored?.id).toBe(capped.id);
  });

  it("tirage pondéré et stable : le même emplacement toute la journée pour une personne", async () => {
    const { pro } = await withPro();
    const a = await placement(pro.id, { title: "A" });
    const b = await placement(pro.id, { title: "B", departments: ["66"] });
    const u = await user("Poids_Sponso");
    const first = (await req(u, "GET", "/me/home")).json.sponsored.id;
    for (let i = 0; i < 4; i++) expect((await req(u, "GET", "/me/home")).json.sponsored.id).toBe(first);
    expect([a.id, b.id]).toContain(first);
  });

  it("proVisibility : pro dépublié ou titulaire suspendu → rien ; après le 21/06/2027 sans abonnement → rien", async () => {
    const { owner, pro } = await withPro();
    await placement(pro.id);
    const u = await user("Vis_Sponso");
    const seen = async () => (await req(u, "GET", "/me/home")).json.sponsored;
    expect(await seen()).not.toBeNull();
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(NOW.getTime() + DAY) })
      .where(eq(profiles.userId, owner.id));
    expect(await seen()).toBeNull();
    await db.update(profiles).set({ suspendedUntil: null }).where(eq(profiles.userId, owner.id));
    await db.update(proProfiles).set({ publishedAt: null }).where(eq(proProfiles.id, pro.id));
    expect(await seen()).toBeNull();
    await db
      .update(proProfiles)
      .set({ publishedAt: new Date(0) })
      .where(eq(proProfiles.id, pro.id));
    expect(await seen()).not.toBeNull();
    await db.update(sponsoredPlacements).set({ endsOn: "2028-01-01" });
    clock.set(new Date(PRO_PAID_FROM.getTime() + DAY));
    expect(await seen()).toBeNull();
  });

  it.each(MODES)(
    "POST /sponsored/:id/click (%s) : un clic compté, seulement pour un emplacement diffusé",
    async (mode) => {
      const { pro } = await withPro();
      const p = await placement(pro.id);
      const ended = await placement(pro.id, { status: "ended" });
      const u = await user("Clic_Sponso");
      // Sans affichage préalable à cette personne : refusé (l'emplacement n'a pas été choisi pour elle).
      expect((await req(u, "POST", `/sponsored/${p.id}/click`, undefined, mode)).status).toBe(404);
      await req(u, "GET", "/me/home", undefined, mode);
      expect((await req(u, "POST", `/sponsored/${p.id}/click`, undefined, mode)).status).toBe(204);
      // Un seul clic compté par personne et par jour.
      expect((await req(u, "POST", `/sponsored/${p.id}/click`, undefined, mode)).status).toBe(204);
      const row = await db.query.sponsoredPlacements.findFirst({ where: eq(sponsoredPlacements.id, p.id) });
      expect(row?.clicks).toBe(1);
      expect((await req(u, "POST", `/sponsored/${ended.id}/click`, undefined, mode)).status).toBe(404);
      expect((await req(null, "POST", `/sponsored/${p.id}/click`)).status).toBe(401);
      expect((await req(u, "POST", "/sponsored/pas-un-uuid/click")).status).toBe(400);
    },
  );

  it("clic limité : 60 par heure et par personne", async () => {
    const { pro } = await withPro();
    const p = await placement(pro.id);
    const u = await user("Spam_Sponso");
    await req(u, "GET", "/me/home");
    resetRateLimits();
    let last = 204;
    for (let i = 0; i < 61; i++) last = (await req(u, "POST", `/sponsored/${p.id}/click`)).status;
    expect(last).toBe(429);
  });

  it("administration : réservée au super administrateur, lien http(s) seulement, période cohérente", async () => {
    const { pro } = await withPro();
    const admin = await signUp("Admin_Sponso", { twoFactor: true, role: "super_admin" });
    const plain = await user("Simple_Sponso");
    const input = {
      proProfileId: pro.id,
      title: "Offre",
      body: "Texte",
      linkUrl: "https://exemple.fr",
      departments: ["66"],
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
      status: "active",
    };
    expect((await req(plain, "GET", "/admin/sponsored-placements")).status).toBe(403);
    expect((await req(plain, "POST", "/admin/sponsored-placements", input)).status).toBe(403);
    expect(
      (await req(admin, "POST", "/admin/sponsored-placements", { ...input, linkUrl: "javascript:alert(1)" })).status,
    ).toBe(400);
    expect((await req(admin, "POST", "/admin/sponsored-placements", { ...input, endsOn: "2026-09-01" })).status).toBe(
      400,
    );
    const created = await req(admin, "POST", "/admin/sponsored-placements", input);
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({
      proName: "Pneus 66",
      status: "active",
      impressions: 0,
      departments: ["66"],
    });
    const id = created.json.id as string;
    expect((await req(admin, "PATCH", `/admin/sponsored-placements/${id}`, { status: "paused" })).json.status).toBe(
      "paused",
    );
    expect((await req(admin, "PATCH", `/admin/sponsored-placements/${id}`, { endsOn: "2020-01-01" })).status).toBe(400);
    expect((await req(admin, "GET", "/admin/sponsored-placements", undefined, "bearer")).json).toHaveLength(1);
    expect((await req(admin, "DELETE", `/admin/sponsored-placements/${id}`)).status).toBe(204);
    expect((await req(admin, "DELETE", `/admin/sponsored-placements/${id}`)).status).toBe(404);
  });
});

describe("corrections de la relecture", () => {
  const place = (lat: number, lng: number, name: string) => ({
    type: "node",
    id: Math.round(lat * 1e4 + lng * 1e3),
    lat,
    lon: lng,
    tags: { amenity: "car_wash", name },
  });

  it("I1 : tout le département est en cache, une personne à Perpignan (33 km du centre) a ses stations", async () => {
    // 40 lavages autour du centre du 66, un seul à Perpignan : un cache « 10 plus proches du centre » l'aurait perdu.
    const around = Array.from({ length: 40 }, (_, i) => place(42.55 + i * 0.001, 2.4 + i * 0.001, `Centre ${i}`));
    const fetched = sources({
      wash: () => Response.json({ elements: [...around, place(42.699, 2.895, "Lavage Perpignan")] }),
    });
    const u = await user("Perpi_Home");
    const r = await req(u, "GET", "/me/home?lat=42.699&lng=2.895");
    expect(r.json.wash[0]).toMatchObject({ name: "Lavage Perpignan" });
    expect(r.json.wash[0].distanceKm).toBeLessThan(5);
    const cached = await db.query.externalCache.findFirst({ where: eq(externalCache.key, "wash:66") });
    expect(((cached?.data ?? []) as unknown[]).length).toBe(41);
    expect(fetched).toHaveBeenCalledTimes(2);
  });

  it("I1 : le carburant charge le département par pages jusqu'à la dernière", async () => {
    const station = (i: number) => ({
      adresse: `${i} rue`,
      ville: "Perpignan",
      cp: "66000",
      geom: { lat: 42.6 + i * 0.0005, lon: 2.5 },
      gazole_prix: 1.8,
    });
    const pages: string[] = [];
    const fn = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (!url.hostname.includes("economie")) return Response.json({ elements: [] });
      const offset = Number(url.searchParams.get("offset"));
      pages.push(String(offset));
      const n = Math.max(0, Math.min(100, 230 - offset));
      return Response.json({ results: Array.from({ length: n }, (_, i) => station(offset + i)) });
    });
    setExternalFetch(fn as unknown as typeof fetch);
    const stations = await fuelNear("66");
    expect(pages).toEqual(["0", "100", "200"]);
    expect(stations).toHaveLength(230);
  });

  it("réponse externe trop volumineuse (> 2 Mo) : abandonnée, rien en cache", async () => {
    const big = "x".repeat(3 * 1024 * 1024);
    sources({ wash: () => new Response(JSON.stringify({ elements: [], pad: big })) });
    expect(await washNear("66")).toEqual([]);
    expect(await db.query.externalCache.findFirst({ where: eq(externalCache.key, "wash:66") })).toBeUndefined();
  });

  it("I2 : deux chargements simultanés du même compte comptent un seul affichage ; le plafond tient sous concurrence", async () => {
    const owner = await signUp("Pro_Conc");
    const pro = await createPro(owner.id);
    const [pl] = await db
      .insert(sponsoredPlacements)
      .values({
        proProfileId: pro.id,
        title: "Offre",
        body: "Texte",
        linkUrl: "https://exemple.fr",
        startsOn: "2026-10-01",
        endsOn: "2026-10-31",
        status: "active",
        dailyCap: 3,
      })
      .returning();
    const users = await Promise.all(["Co_1", "Co_2", "Co_3", "Co_4", "Co_5", "Co_6"].map((n) => user(n)));
    const results = await Promise.all(users.map((u) => req(u, "GET", "/me/home")));
    const shown = results.filter((r) => r.json.sponsored).length;
    expect(shown).toBe(3);
    const row = await db.query.sponsoredPlacements.findFirst({ where: eq(sponsoredPlacements.id, pl!.id) });
    expect(row?.impressions).toBe(3);
    const first = users[0] as TestUser;
    await Promise.all([req(first, "GET", "/me/home"), req(first, "GET", "/me/home")]);
    expect(
      (await db.query.sponsoredPlacements.findFirst({ where: eq(sponsoredPlacements.id, pl!.id) }))?.impressions,
    ).toBe(3);
  });

  it("I2 : la table « déjà montré » ne garde ni identifiant de compte, et se purge après deux jours", async () => {
    const { pro } = await (async () => {
      const owner = await signUp("Pro_Purge");
      return { pro: await createPro(owner.id) };
    })();
    await db.insert(sponsoredPlacements).values({
      proProfileId: pro.id,
      title: "Offre",
      body: "Texte",
      linkUrl: "https://exemple.fr",
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
      status: "active",
    });
    const u = await user("Purge_Home");
    await req(u, "GET", "/me/home");
    const rows = await db.select().from(sponsoredDailySeen);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(u.id);
    expect(await sponsoredService.purgeSeen()).toBe(0);
    clock.advance(3 * DAY);
    expect(await sponsoredService.purgeSeen()).toBe(1);
  });

  it("mineur : PATCH vide refusé (400), image enregistrée dans le journal d'administration", async () => {
    const { pro } = await (async () => {
      const owner = await signUp("Pro_Admin");
      return { pro: await createPro(owner.id) };
    })();
    const admin = await signUp("Admin_Img", { twoFactor: true, role: "super_admin" });
    const created = await req(admin, "POST", "/admin/sponsored-placements", {
      proProfileId: pro.id,
      title: "Offre",
      body: "Texte",
      linkUrl: "https://exemple.fr",
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
    });
    const id = created.json.id as string;
    expect((await req(admin, "PATCH", `/admin/sponsored-placements/${id}`, {})).status).toBe(400);
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 200, g: 160, b: 40 } } })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append("image", new File([new Uint8Array(png)], "a.png", { type: "image/png" }));
    const res = await app.request(`/api/admin/sponsored-placements/${id}/image`, {
      method: "POST",
      headers: { cookie: admin.cookie, origin: ORIGIN },
      body: form,
    });
    expect(res.status).toBe(200);
    const audit = await db.query.adminAuditLog.findMany({ where: eq(adminAuditLog.action, "sponsored.image") });
    expect(audit).toHaveLength(1);
  });

  it("mineur : GET /me/settings rend les widgets normalisés ; DELETE favori limité", async () => {
    const u = await user("Norm_Home");
    await db
      .update(profiles)
      .set({ homeWidgets: { order: ["fuel"], hidden: ["wash"] } })
      .where(eq(profiles.userId, u.id));
    const r = await req(u, "GET", "/me/settings");
    expect(r.json.homeWidgets.order[0]).toBe("next_access");
    expect(r.json.homeWidgets.order).toHaveLength(8);
    resetRateLimits();
    let last = 204;
    for (let i = 0; i < 61; i++)
      last = (await req(u, "DELETE", "/pros/00000000-0000-4000-8000-000000000000/favorite")).status;
    expect(last).toBe(429);
  });
});

describe("service direct", () => {
  it("setWidgets normalise avant d'écrire", async () => {
    const u = await user("Direct_Home");
    const { viewerOf } = await import("../../../test/helpers");
    const v = await viewerOf(u);
    const out = await homeService.setWidgets(v, { order: ["fuel"], hidden: ["next_access", "wash"] });
    expect(out.order[0]).toBe("next_access");
    expect(out.hidden).toEqual(["wash"]);
  });
});
