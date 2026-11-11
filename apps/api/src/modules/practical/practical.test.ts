// Lot R8q : « Pratique » (POST /practical). Règles : les deux départements les plus proches, un rayon de 30 km, 200 lieux au plus,
// aucune donnée de prix, une réponse partielle (jamais un 500) quand une source ne répond pas, un seul chargement par
// département (24 h pour les stations, 7 jours pour le lavage), la sortie = un événement où j'ai une place.
// Aucun appel réseau : les deux sources sont des bouchons (`test/practicalStubs.ts`).
import { HOUR, NEARBY_STATIONS_ENABLED, nearestDepartments, practicalTexts } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
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
import { practicalSources, type StubFuel, type StubWash } from "../../../test/practicalStubs";
import { db, pool } from "../../db/client";
import {
  applications,
  type events,
  externalCache,
  orders,
  profiles,
  profileWeatherPlaces,
  signingKeys,
  tickets,
  ticketTypes,
} from "../../db/schema";
import { setExternalFetch } from "../../lib/external/cache";
import { resetRateLimits } from "../../lib/rateLimit";
import { practicalService } from "./service";

afterAll(async () => {
  await pool.end();
});

const NOW = new Date("2026-10-16T09:00:00Z");
const DAY = 24 * HOUR;
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  await db.delete(externalCache);
  clock = useClock(NOW);
  ref = await seedReference();
  setExternalFetch(null);
  resetRateLimits();
});
afterEach(() => {
  setExternalFetch(null);
});

async function fan(pseudo: string, departments: string[] = ["66"]) {
  const u = await signUp(pseudo);
  await db.update(profiles).set({ departments }).where(eq(profiles.userId, u.id));
  return u;
}

const PERPIGNAN = { lat: 42.7, lng: 2.9 };
const here = (u: TestUser | null) => call(u, "POST", "/practical", { near: "position", ...PERPIGNAN });
const gare: StubFuel = { adresse: "Route de Canet", ville: "Perpignan", cp: "66000", lat: 42.7, lon: 2.9 };
const port: StubWash = { name: "Lavage du Port", lat: 42.71, lon: 2.9 };
const kinds = (r: { json: { places: { kind: string }[] } }) => r.json.places.map((p) => p.kind);

describe("POST /practical : la réponse", () => {
  it("session requise ; pas de cache ; la position n'est pas dans l'adresse (pas de GET)", async () => {
    expect((await here(null)).status).toBe(401);
    const u = await fan("Fan_Droits");
    const res = await here(u);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect([404, 405]).toContain((await call(u, "GET", "/practical?lat=42.7&lng=2.9")).status);
  });

  it("des lieux proches, des deux sortes, sans aucun prix, liste blanche des champs", async () => {
    practicalSources({
      wash: { "66": [port, { lat: 42.72, lon: 2.92 }] },
      fuel: { "66": [{ adresse: "12 rue de la Gare", ville: "Perpignan", cp: "66000", lat: 42.705, lon: 2.89 }] },
    });
    const res = await here(await fan("Fan_Liste"));
    expect(Object.keys(res.json).sort()).toEqual(["attribution", "origin", "partial", "places"]);
    expect(res.json.origin).toEqual({ kind: "cell", label: practicalTexts.myPosition, lat: 42.7, lng: 2.9 });
    expect(res.json.attribution.wash).toContain("OpenStreetMap");
    expect(res.json.attribution.fuel).toContain("data.economie.gouv.fr");
    expect(res.json.places).toHaveLength(3);
    for (const p of res.json.places) {
      expect(Object.keys(p).sort()).toEqual(["address", "id", "kind", "lat", "lng", "name"]);
    }
    const text = JSON.stringify(res.json);
    for (const forbidden of ["prices", "price", "gazole", "sp95", "updatedAt", "distance", "1.789", "1.859"]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    const fuel = res.json.places.find((p: { kind: string }) => p.kind === "fuel");
    expect(fuel.address).toBe("12 rue de la Gare, 66000 Perpignan");
    expect(res.json.places.find((p: { name: string }) => p.name === "Lavage du Port")).toBeTruthy();
    // Un identifiant stable (sorte, position) : le même d'une demande à l'autre, distinct d'un lieu à l'autre.
    const again = await here(await fan("Fan_Liste2"));
    const ids = (r: typeof res) => r.json.places.map((p: { id: string }) => p.id);
    expect(ids(again)).toEqual(ids(res));
    expect(new Set(ids(res)).size).toBe(3);
  });

  it("rayon de 30 km, les plus proches d'abord, 200 lieux au plus", async () => {
    const stations: StubFuel[] = Array.from({ length: 250 }, (_, i) => ({
      adresse: `${i + 1} rue ${i}`,
      ville: "Perpignan",
      cp: "66000",
      lat: 42.71 + (i % 50) * 0.001,
      lon: 2.9 + Math.floor(i / 50) * 0.002,
    }));
    practicalSources({
      wash: {
        "66": [
          { name: "Trop loin", lat: 43.2, lon: 2.9 },
          { name: "Près", lat: 42.7005, lon: 2.9 },
        ],
      },
      fuel: { "66": stations },
    });
    const res = await here(await fan("Fan_Plafond"));
    expect(res.json.places).toHaveLength(200);
    expect(res.json.places.some((p: { name: string }) => p.name === "Trop loin")).toBe(false);
    expect(res.json.places[0].name).toBe("Près");
  });

  it("deux départements : un lieu de l'autre côté de la limite n'est pas oublié", async () => {
    const [first, second] = nearestDepartments(PERPIGNAN) as [string, string];
    expect(first).toBe("66");
    const sources = practicalSources({
      wash: {
        [first]: [{ name: "Chez nous", lat: 42.7, lon: 2.91 }],
        [second]: [{ name: "Voisin", lat: 42.69, lon: 2.88 }],
      },
    });
    const res = await here(await fan("Fan_Limite"));
    expect(res.json.places.map((p: { name: string }) => p.name).sort()).toEqual(["Chez nous", "Voisin"]);
    // Les sources n'ont reçu que ces deux départements (et rien d'autre).
    expect(new Set(sources.calls.map((c) => c.department))).toEqual(new Set([first, second]));
    expect(sources.count("wash")).toBe(2);
    expect(sources.count("fuel")).toBe(2);
  });

  it("le jeu public n'a pas de nom de station : le nom générique, l'adresse ensuite", async () => {
    practicalSources({ fuel: { "66": [gare] } });
    const res = await here(await fan("Fan_Nom"));
    expect(res.json.places[0].name).toBe("Station-service");
    expect(res.json.places[0].address).toContain("Route de Canet");
  });

  it("corps invalides : hors de France, champ en trop, sorte inconnue", async () => {
    practicalSources({});
    const u = await fan("Fan_Corps");
    expect((await call(u, "POST", "/practical", { near: "position", lat: 51.5, lng: -0.12 })).status).toBe(400);
    expect((await call(u, "POST", "/practical", { near: "city", lat: 42.7 })).status).toBe(400);
    expect((await call(u, "POST", "/practical", { near: "elsewhere" })).status).toBe(400);
    expect((await call(u, "POST", "/practical", { near: "outing", eventId: "pas-un-uuid" })).status).toBe(400);
    expect((await call(u, "POST", "/practical", {})).status).toBe(400);
  });
});

describe("POST /practical : ma ville", () => {
  it("un lieu choisi dans Ma météo d'abord, sinon la préfecture du premier département, sinon rien", async () => {
    practicalSources({ wash: { "66": [{ name: "Lavage", lat: 42.55, lon: 3.02 }] } });
    const chosen = await fan("Fan_Choisi");
    await db
      .insert(profileWeatherPlaces)
      .values({ userId: chosen.id, slot: 0, label: "Argelès-sur-Mer", lat: 42.55, lng: 3.02, updatedAt: clock.now });
    const a = await call(chosen, "POST", "/practical", { near: "city" });
    expect(a.json.origin).toEqual({ kind: "city", label: "Argelès-sur-Mer", lat: 42.55, lng: 3.02 });
    expect(a.json.places).toHaveLength(1);
    const dflt = await call(await fan("Fan_Defaut"), "POST", "/practical", { near: "city" });
    expect(dflt.json.origin.kind).toBe("city");
    expect(dflt.json.origin.label).toBe("Perpignan");
    const none = await call(await fan("Fan_Sans", []), "POST", "/practical", { near: "city" });
    expect(none.status).toBe(200);
    expect(none.json.origin).toBeNull();
    expect(none.json.places).toEqual([]);
    expect(none.json.partial).toBe(false);
  });
});

describe("POST /practical : ma sortie", () => {
  const start = (days: number) => new Date(NOW.getTime() + days * DAY);
  const withCoords = (days: number, over: Partial<typeof events.$inferInsert> = {}) => ({
    startsAt: start(days),
    endsAt: new Date(start(days).getTime() + 5 * HOUR),
    lat: 42.69,
    lng: 3.03,
    ...over,
  });
  async function structure() {
    const owner = await signUp("Orga_R8q", { twoFactor: true });
    return createStructure(owner.id);
  }
  async function apply(
    u: TestUser,
    eventId: string,
    status: (typeof applications.$inferInsert)["status"] = "accepted",
  ) {
    const car = await createVehicle(u.id, ref);
    await db
      .insert(applications)
      .values({ eventId, userId: u.id, vehicleId: car.id, status, rulesAcceptedAt: clock.now, followStructure: false });
  }
  async function ticket(u: TestUser, eventId: string, status: "valid" | "used" | "cancelled" = "valid") {
    const [type] = await db.insert(ticketTypes).values({ eventId, name: "Entrée", capacity: 100 }).returning();
    const [order] = await db
      .insert(orders)
      .values({
        eventId,
        userId: u.id,
        ticketTypeId: type!.id,
        status: "paid",
        quantity: 1,
        amountCents: 0,
        paidAt: clock.now,
      })
      .returning();
    await db
      .insert(signingKeys)
      .values({ kid: 1, publicKey: Buffer.alloc(32) })
      .onConflictDoNothing();
    await db.insert(tickets).values({
      orderId: order!.id,
      eventId,
      userId: u.id,
      ticketTypeId: type!.id,
      status,
      kid: 1,
      signature: Buffer.from("00", "hex"),
      issuedAt: clock.now,
    });
  }
  const outing = (u: TestUser, eventId?: string) =>
    call(u, "POST", "/practical", { near: "outing", ...(eventId ? { eventId } : {}) });

  it("ma prochaine sortie à venir ou en cours : l'origine est l'événement", async () => {
    practicalSources({ wash: { "66": [{ name: "Lavage du Port", lat: 42.691, lon: 3.031 }] } });
    const s = await structure();
    const u = await fan("Fan_Sortie");
    const later = await createEvent(s.id, withCoords(9, { title: "Plus tard" }));
    const soon = await createEvent(s.id, withCoords(3, { title: "Nocturne de Canet" }));
    await apply(u, later.id);
    await apply(u, soon.id);
    const res = await outing(u);
    expect(res.json.origin).toEqual({ kind: "outing", label: "Nocturne de Canet", lat: 42.69, lng: 3.03 });
    expect(res.json.places[0].name).toBe("Lavage du Port");
    // En cours : une sortie commencée avant et pas finie passe avant.
    const running = await createEvent(s.id, withCoords(-0.05, { title: "En cours", endsAt: start(0.3) }));
    await apply(u, running.id);
    expect((await outing(u)).json.origin.label).toBe("En cours");
  });

  it("billet valable ou contrôlé : une sortie ; candidature en attente, désistée, billet annulé, événement fini : non", async () => {
    practicalSources({});
    const s = await structure();
    const u = await fan("Fan_Billet");
    expect((await outing(u)).json.origin).toBeNull();
    const pending = await createEvent(s.id, withCoords(2, { title: "En attente" }));
    await apply(u, pending.id, "pending");
    const withdrawn = await createEvent(s.id, withCoords(2, { title: "Désisté" }));
    await apply(u, withdrawn.id, "withdrawn");
    const cancelled = await createEvent(s.id, withCoords(2, { title: "Annulé" }));
    await ticket(u, cancelled.id, "cancelled");
    const over = await createEvent(s.id, withCoords(-3, { title: "Fini" }));
    await apply(u, over.id);
    expect((await outing(u)).json.origin).toBeNull();
    const withTicket = await createEvent(s.id, withCoords(4, { title: "Avec billet" }));
    await ticket(u, withTicket.id);
    expect((await outing(u)).json.origin.label).toBe("Avec billet");
    const used = await createEvent(s.id, withCoords(-0.05, { title: "Billet contrôlé", endsAt: start(0.2) }));
    await ticket(u, used.id, "used");
    expect((await outing(u)).json.origin.label).toBe("Billet contrôlé");
  });

  it("eventId : seulement un événement où j'ai une place, sinon 404", async () => {
    practicalSources({});
    const s = await structure();
    const u = await fan("Fan_EventId");
    const mine = await createEvent(s.id, withCoords(5, { title: "À moi" }));
    const other = await createEvent(s.id, withCoords(2, { title: "Pas à moi" }));
    const waiting = await createEvent(s.id, withCoords(2, { title: "Attente" }));
    await apply(u, mine.id);
    await apply(u, waiting.id, "pending");
    expect((await outing(u, mine.id)).json.origin.label).toBe("À moi");
    expect((await outing(u, other.id)).status).toBe(404);
    expect((await outing(u, waiting.id)).status).toBe(404);
    expect((await outing(u, "d3b07384-d9a1-4f4e-8a8e-3f0f2d1c9a11")).status).toBe(404);
    // La place d'une autre personne ne m'ouvre rien.
    expect((await outing(await fan("Fan_Autre"), mine.id)).status).toBe(404);
  });

  it("événement sans coordonnées : pas d'origine, pas d'erreur", async () => {
    practicalSources({});
    const s = await structure();
    const u = await fan("Fan_SansGps");
    const e = await createEvent(s.id, { ...withCoords(2), lat: null, lng: null });
    await apply(u, e.id);
    const res = await outing(u);
    expect(res.status).toBe(200);
    expect(res.json.origin).toBeNull();
    expect(res.json.places).toEqual([]);
  });
});

describe("POST /practical : sources en panne ou lentes", () => {
  it("source en panne : partial, l'autre source répond, jamais un 500 ; le cache périmé est servi", async () => {
    const down = practicalSources({ fuel: { "66": [gare] } }, { fail: ["wash"] });
    const u = await fan("Fan_Panne");
    const first = await here(u);
    expect(first.status).toBe(200);
    expect(first.json.partial).toBe(true);
    expect(kinds(first)).toEqual(["fuel"]);
    expect(down.count("wash", "66")).toBe(1);

    // La source revient : réponse complète, puis tout retombe en panne : le cache périmé (tolérance) sert encore.
    const back = practicalSources({ wash: { "66": [port] }, fuel: { "66": [gare] } });
    clock.advance(11 * 60_000);
    const full = await here(u);
    expect(full.json.partial).toBe(false);
    expect(full.json.places).toHaveLength(2);
    expect(back.count("wash", "66")).toBe(1);
    practicalSources({}, { fail: ["wash", "fuel"] });
    clock.advance(2 * DAY); // stations périmées (24 h) mais toujours tolérées (7 jours) ; lavage encore valable
    const stale = await here(u);
    expect(stale.status).toBe(200);
    expect(stale.json.partial).toBe(false);
    expect(stale.json.places).toHaveLength(2);
    // Au-delà de la tolérance, plus rien de périmé n'est servi : réponse partielle.
    clock.advance(8 * DAY);
    const gone = await here(u);
    expect(gone.status).toBe(200);
    expect(gone.json.partial).toBe(true);
  });

  it("source lente : le service ne dépasse pas son budget et dit partial", async () => {
    practicalSources({}, { hang: ["wash", "fuel"] });
    const u = await fan("Fan_Lent");
    const started = Date.now();
    const res = await practicalService.get(await viewerOf(u), { near: "city" }, 60);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(res.partial).toBe(true);
    expect(res.places).toEqual([]);
    expect(res.origin?.kind).toBe("city");
  });

  it("sources désactivées dans les tests (sans bouchon) : réponse vide et partielle, jamais d'appel réel", async () => {
    const res = await here(await fan("Fan_Off"));
    expect(res.status).toBe(200);
    expect(res.json.places).toEqual([]);
    expect(res.json.partial).toBe(true);
  });
});

describe("POST /practical : quotas des sources", () => {
  const data = { wash: { "66": [port] }, fuel: { "66": [gare] } };

  it("deux demandes pour le même département : un seul chargement ; stations 24 h, lavage 7 jours", async () => {
    const stub = practicalSources(data);
    const u = await fan("Fan_Quota");
    await here(u);
    await here(u);
    await here(await fan("Fan_Quota2"));
    expect(stub.count("wash", "66")).toBe(1);
    expect(stub.count("fuel", "66")).toBe(1);
    clock.advance(23 * HOUR);
    await here(u);
    expect(stub.count("fuel", "66")).toBe(1);
    clock.advance(2 * HOUR); // 25 h : les stations seulement
    await here(u);
    expect(stub.count("fuel", "66")).toBe(2);
    expect(stub.count("wash", "66")).toBe(1);
    clock.advance(7 * DAY); // plus de 7 jours : le lavage aussi
    await here(u);
    expect(stub.count("wash", "66")).toBe(2);
  });

  it("des demandes simultanées : un seul chargement par département et par source", async () => {
    const stub = practicalSources(data);
    const users = await Promise.all([fan("Fan_S1"), fan("Fan_S2"), fan("Fan_S3")]);
    await Promise.all(users.map((u) => here(u)));
    expect(stub.count("wash", "66")).toBe(1);
    expect(stub.count("fuel", "66")).toBe(1);
  });

  it("limite de débit par compte : 429 au-delà", async () => {
    practicalSources(data);
    const u = await fan("Fan_Limite429");
    let last = 200;
    for (let i = 0; i < 45; i++) last = (await call(u, "POST", "/practical", { near: "city" })).status;
    expect(last).toBe(429);
  });
});

describe("rien ne change pour l'APK en ligne", () => {
  it("NEARBY_STATIONS_ENABLED reste faux ; GET /me/home garde wash et fuel vides et n'appelle aucune source", async () => {
    expect(NEARBY_STATIONS_ENABLED).toBe(false);
    const stub = practicalSources({ wash: { "66": [port] }, fuel: { "66": [gare] } });
    const u = await fan("Fan_Home");
    const res = await call(u, "GET", "/me/home");
    expect(res.status).toBe(200);
    expect(res.json.wash ?? []).toEqual([]);
    expect(res.json.fuel ?? []).toEqual([]);
    expect(stub.calls).toHaveLength(0);
  });
});

describe("POST /practical : Overpass un appel à la fois, cache toléré en repli", () => {
  it("quatre demandes simultanées de régions différentes : jamais deux appels Overpass en même temps", async () => {
    const stub = practicalSources({}, { delayMs: 40 });
    const users = await Promise.all([fan("Fan_O1"), fan("Fan_O2"), fan("Fan_O3"), fan("Fan_O4")]);
    const cells = [
      { lat: 42.7, lng: 2.9 },
      { lat: 43.6, lng: 1.4 },
      { lat: 45.8, lng: 4.8 },
      { lat: 48.9, lng: 2.3 },
    ];
    await Promise.all(users.map((u, i) => call(u, "POST", "/practical", { near: "position", ...cells[i] })));
    expect(stub.count("wash")).toBeGreaterThanOrEqual(6);
    expect(stub.maxWashInFlight()).toBe(1);
  });

  it("source lente avec un cache périmé tolérable : le cache est servi et la réponse est partielle", async () => {
    const departments = nearestDepartments(PERPIGNAN);
    const old = new Date(NOW.getTime() - 2 * DAY);
    for (const d of departments) {
      await db.insert(externalCache).values([
        {
          key: `wash:${d}`,
          fetchedAt: new Date(NOW.getTime() - HOUR),
          data: d === "66" ? [{ name: "Lavage du cache", address: null, lat: 42.71, lng: 2.9 }] : [],
        },
        {
          key: `fuel:${d}`,
          fetchedAt: old,
          data:
            d === "66"
              ? [
                  {
                    name: "Station-service",
                    address: "Route du cache, 66000 Perpignan",
                    lat: 42.7,
                    lng: 2.9,
                    prices: {},
                    updatedAt: null,
                  },
                ]
              : [],
        },
      ]);
    }
    practicalSources({}, { hang: ["fuel"] });
    const u = await fan("Fan_Cache");
    const res = await practicalService.get(
      await viewerOf(u),
      { near: "position", cell: { lat: 42.7, lng: 2.9, key: "42.7,2.9" } },
      60,
    );
    expect(res.partial).toBe(true);
    expect(res.places.map((p) => p.name).sort()).toEqual(["Lavage du cache", "Station-service"]);
  });
});
