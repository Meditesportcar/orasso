// Lot R8e1 : la météo de l'événement est une ligne de sa carte dans « Prochaine sortie » (`outingsWeather`, clé = identifiant
// de l'événement) ; le bloc « Météo » ne dit plus que le département ; « Météo de l'événement » (`event_weather`) commande la
// ligne et, masqué, n'est pas calculé. `GET /me/weather` garde sa réponse (lue par l'APK en ligne).
import { departmentPrefectures, eventDates, type HomeData, weatherCell } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  applications,
  events,
  eventWeather,
  profiles,
  tickets,
  weatherDepartments,
  weatherPlacesCache,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { setWeatherFetch } from "../../lib/weather";
import { resetPlaceCellState, weatherService } from "../weather/service";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-10T10:00:00Z");
const POS = { lat: 42.7, lng: 2.9 };

let ref: Awaited<ReturnType<typeof seedReference>>;
beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  useClock(NOW);
  ref = await seedReference();
  // `resetDb` ne vide pas le cache des départements (il est partagé).
  await db.delete(weatherDepartments);
  await db.delete(weatherPlacesCache);
  resetPlaceCellState();
});

const at = (days: number, hours = 0) => new Date(NOW.getTime() + days * DAY + hours * HOUR);

async function world() {
  const orga = await signUp("Orga_R8e1", { twoFactor: true });
  const s = await createStructure(orga.id);
  const u = await signUp("Fan_R8e1");
  await db
    .update(profiles)
    .set({ departments: ["66"] })
    .where(eq(profiles.userId, u.id));
  const veh = await createVehicle(u.id, ref);
  return { s, u, veh, orga };
}
const apply = (
  u: TestUser,
  vehicleId: string,
  eventId: string,
  status: "accepted" | "pending" | "refused" | "waitlisted",
) =>
  db.insert(applications).values({
    userId: u.id,
    vehicleId,
    eventId,
    status,
    rulesAcceptedAt: NOW,
    followStructure: false,
  });

/** Un événement avec position, et sa prévision en stock (« clear »). */
async function stored(structureId: string, o: Partial<typeof events.$inferInsert>, withWeather = true) {
  const e = await createEvent(structureId, { lat: POS.lat, lng: POS.lng, ...o });
  if (withWeather) {
    await db.insert(eventWeather).values({
      eventId: e.id,
      provider: "open-meteo",
      lat: POS.lat,
      lng: POS.lng,
      fetchedAt: NOW,
      forecast: {
        days: eventDates(e).map((date) => ({
          date,
          tempMin: 9,
          tempMax: 16.6,
          precipitationProbability: 5,
          precipitationMm: 0,
          windMaxKmh: 24.6,
          code: "clear" as const,
        })),
        hours: [],
      },
    });
  }
  return e;
}

async function home(u: TestUser, query = "") {
  const res = await app.request(`/api/me/home${query}`, { headers: { origin: ORIGIN, cookie: u.cookie } });
  return { status: res.status, json: (await res.json()) as HomeData };
}

describe("outingsWeather : la ligne météo des cartes de « Prochaine sortie »", () => {
  it("une place retenue à 4 jours : présente, avec le jour de début à Paris, le résumé, l'attribution et uncertain faux", async () => {
    const { s, u, veh } = await world();
    const e = await stored(s.id, { startsAt: at(4, 8) });
    await apply(u, veh.id, e.id, "accepted");
    const r = await home(u);
    expect(r.status).toBe(200);
    expect(Object.keys(r.json.outingsWeather)).toEqual([e.id]);
    const w = r.json.outingsWeather[e.id];
    expect(w).toMatchObject({
      day: "2026-11-14",
      provider: "open-meteo",
      attribution: "Météo : Open-Meteo",
      uncertain: false,
      summary: { code: "clear", tempMax: 16.6, windMaxKmh: 24.6 },
    });
    // Liste blanche des champs.
    expect(Object.keys(w ?? {}).sort()).toEqual(["attribution", "day", "provider", "summary", "uncertain"]);
  });

  it("le jour est celui de Paris : 23 h 30 à Paris (22 h 30 UTC) reste ce jour-là", async () => {
    const { s, u, veh } = await world();
    const e = await stored(s.id, { startsAt: new Date("2026-11-14T22:30:00Z") });
    await apply(u, veh.id, e.id, "accepted");
    expect((await home(u)).json.outingsWeather[e.id]?.day).toBe("2026-11-14");
  });

  it("à 9 jours : absente ; fini : absente ; sans météo stockée : absente ; en cours : présente", async () => {
    const { s, u, veh } = await world();
    const far = await stored(s.id, { startsAt: at(9) });
    const over = await stored(s.id, { startsAt: at(-3), endsAt: at(-2) });
    const none = await stored(s.id, { startsAt: at(3) }, false);
    const live = await stored(s.id, { startsAt: at(-1), endsAt: at(2) });
    for (const e of [far, over, none, live]) await apply(u, veh.id, e.id, "accepted");
    const r = await home(u);
    expect(Object.keys(r.json.outingsWeather)).toEqual([live.id]);
  });

  it("à exactement 7 jours : présente (règle weatherVisible) ; une position changée invalide la prévision", async () => {
    const { s, u, veh } = await world();
    const edge = await stored(s.id, { startsAt: at(7) });
    const moved = await stored(s.id, { startsAt: at(2) });
    await db.update(events).set({ lat: 43.1 }).where(eq(events.id, moved.id));
    await apply(u, veh.id, edge.id, "accepted");
    await apply(u, veh.id, moved.id, "accepted");
    expect(Object.keys((await home(u)).json.outingsWeather)).toEqual([edge.id]);
  });

  it("uncertain est vrai quand l'organisateur a passé l'événement en « Incertain »", async () => {
    const { s, u, veh } = await world();
    const e = await stored(s.id, { startsAt: at(4), outlook: "uncertain" });
    await apply(u, veh.id, e.id, "accepted");
    expect((await home(u)).json.outingsWeather[e.id]?.uncertain).toBe(true);
  });

  it("candidature en attente ou refusée : pas d'entrée ; un billet valable : une entrée ; un billet annulé : aucune", async () => {
    const { s, u, veh, orga } = await world();
    const pending = await stored(s.id, { startsAt: at(2) });
    const refused = await stored(s.id, { startsAt: at(3) });
    await apply(u, veh.id, pending.id, "pending");
    await apply(u, veh.id, refused.id, "refused");
    expect((await home(u)).json.outingsWeather).toEqual({});

    const ticketed = await stored(s.id, { startsAt: at(5), publicAccess: "free_reservation" });
    expect((await call(orga, "PUT", `/events/${ticketed.id}/ticketing`, { enabled: true, capacity: 5 })).status).toBe(
      200,
    );
    expect((await call(u, "POST", `/events/${ticketed.id}/tickets/reserve`, { quantity: 1 })).status).toBe(201);
    expect(Object.keys((await home(u)).json.outingsWeather)).toEqual([ticketed.id]);
    await db.update(tickets).set({ status: "cancelled", cancelledAt: NOW });
    expect((await home(u)).json.outingsWeather).toEqual({});
  });

  it("jamais la météo d'un autre : un compte sans sortie n'a aucune entrée ; anciens appels (light, v2) : {}", async () => {
    const { s, u, veh } = await world();
    const e = await stored(s.id, { startsAt: at(3) });
    await apply(u, veh.id, e.id, "accepted");
    const other = await signUp("Autre_R8e1");
    expect((await home(other)).json.outingsWeather).toEqual({});
    expect((await home(u, "?light=1&persona=fan")).json.outingsWeather).toEqual({});
    expect((await home(u, "?blocks=v2&persona=fan")).json.outingsWeather).toEqual({});
  });

  it("un événement non publié n'a pas d'entrée ; une seule lecture pour toute la liste", async () => {
    const { s, u, veh } = await world();
    const a = await stored(s.id, { startsAt: at(1) });
    const b = await stored(s.id, { startsAt: at(2) });
    const c = await stored(s.id, { startsAt: at(3) });
    for (const e of [a, b, c]) await apply(u, veh.id, e.id, "accepted");
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, c.id));
    const spy = vi.spyOn(weatherService, "forOutings");
    const r = await home(u);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(Object.keys(r.json.outingsWeather).sort()).toEqual([a.id, b.id].sort());
    spy.mockRestore();
  });

  it("« Météo de l'événement » masqué : {} et aucune lecture de météo ; réaffiché : la ligne revient", async () => {
    const { s, u, veh } = await world();
    const e = await stored(s.id, { startsAt: at(3) });
    await apply(u, veh.id, e.id, "accepted");
    const spy = vi.spyOn(weatherService, "forOutings");
    expect((await call(u, "PUT", "/me/home/widgets", { order: [], hidden: ["event_weather"] })).status).toBe(200);
    const hidden = await home(u);
    expect(hidden.json.outingsWeather).toEqual({});
    expect(hidden.json.widgets.hidden).toContain("event_weather");
    expect(spy).not.toHaveBeenCalled();
    await call(u, "PUT", "/me/home/widgets", { order: [], hidden: [] });
    expect(Object.keys((await home(u)).json.outingsWeather)).toEqual([e.id]);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("un réglage enregistré avant le lot : « Météo de l'événement » prend sa place juste après « Prochaine sortie », visible", async () => {
    const { u } = await world();
    await db
      .update(profiles)
      .set({ homeWidgets: { order: ["next_access", "live", "weather", "nearby"], hidden: ["agenda"] } })
      .where(eq(profiles.userId, u.id));
    const r = await home(u);
    expect(r.json.widgets.order.slice(0, 3)).toEqual(["next_access", "event_weather", "live"]);
    expect(r.json.widgets.hidden).not.toContain("event_weather");
  });
});

describe("le bloc « Météo » et GET /me/weather", () => {
  it("le bloc « Météo » du passionné ne dit jamais l'événement : le département, ou rien", async () => {
    const { s, u, veh } = await world();
    const e = await stored(s.id, { startsAt: at(2) });
    await apply(u, veh.id, e.id, "accepted");
    await db.insert(weatherDepartments).values({
      department: "66",
      provider: "open-meteo",
      fetchedAt: NOW,
      forecast: {
        days: [
          {
            date: "2026-11-10",
            tempMin: 8,
            tempMax: 14,
            precipitationProbability: 20,
            precipitationMm: 0,
            windMaxKmh: 12,
            code: "cloudy",
          },
        ],
        hours: [],
      },
    });
    const r = await home(u);
    expect(r.json.weather).toMatchObject({ kind: "place", department: "66", summary: { code: "cloudy" } });
    // Sans département : rien (jamais l'événement à la place).
    await db.update(profiles).set({ departments: [] }).where(eq(profiles.userId, u.id));
    expect((await home(u)).json.weather).toBeNull();
  });

  it("GET /me/weather garde sa réponse d'aujourd'hui : le prochain événement retenu à 7 jours au plus", async () => {
    const { s, u, veh } = await world();
    const e = await stored(s.id, { startsAt: at(2) });
    await apply(u, veh.id, e.id, "accepted");
    const r = await call(u, "GET", "/me/weather");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      kind: "event",
      event: { id: e.id },
      attribution: "Météo : Open-Meteo",
      summary: { code: "clear" },
    });
  });
});

// --- Tour 2 -------------------------------------------------------------------------------------------------------------

/** Réponse Open-Meteo minimale : une journée, ciel dégagé, 17°, vent 25 km/h. */
const omDay = (date: string) => ({
  daily: {
    time: [date],
    weather_code: [0],
    temperature_2m_max: [17],
    temperature_2m_min: [9],
    precipitation_probability_max: [5],
    precipitation_sum: [0],
    wind_speed_10m_max: [25],
  },
  hourly: { time: [] },
});
const departmentRow = (date: string, fetchedAt: Date, department = "66") => ({
  department,
  provider: "open-meteo" as const,
  fetchedAt,
  forecast: {
    days: [
      {
        date,
        tempMin: 8,
        tempMax: 14,
        precipitationProbability: 20,
        precipitationMm: 0,
        windMaxKmh: 12,
        code: "cloudy" as const,
      },
    ],
    hours: [],
  },
});
/** Chaque test a son département : l'échec d'un fournisseur (retenté au plus toutes les 10 minutes) est retenu par département. */
const moveTo = (u: TestUser, department: string) =>
  db
    .update(profiles)
    .set({ departments: [department] })
    .where(eq(profiles.userId, u.id));
const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

describe("tour 2 : le bloc « Météo » ne lit que le stock", () => {
  afterEach(() => setWeatherFetch(null));

  it("cache périmé sans la journée d'aujourd'hui et fournisseur en échec : rien (jamais l'ancienne journée)", async () => {
    const { u } = await world();
    await db.insert(weatherDepartments).values(departmentRow("2026-11-07", new Date(NOW.getTime() - 5 * HOUR)));
    const calls = vi.fn(async () => new Response("{}", { status: 503 }));
    setWeatherFetch(calls as unknown as typeof fetch);
    expect((await home(u)).json.weather).toBeNull();
    // Le rafraîchissement part sans être attendu, puis la route qui l'attend (GET /me/weather) dit aussi « rien ».
    await vi.waitFor(() => expect(calls).toHaveBeenCalled());
    await settle();
    expect((await call(u, "GET", "/me/weather")).json).toBeNull();
  });

  it("un fournisseur lent n'attend pas l'Accueil : réponse immédiate, un seul appel regroupé, la prochaine ouverture a la météo", async () => {
    const { u } = await world();
    await moveTo(u, "11");
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify(omDay("2026-11-10")), { status: 200 });
    });
    setWeatherFetch(calls as unknown as typeof fetch);
    const started = Date.now();
    const [a, b] = await Promise.all([home(u), home(u)]);
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(a.json.weather).toBeNull();
    expect(b.json.weather).toBeNull();
    await vi.waitFor(() => expect(calls).toHaveBeenCalled());
    // Lot R8m : « Ma météo » réchauffe aussi la case de la préfecture (un second point, regroupé lui aussi) : deux appels, pas quatre.
    await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
    release();
    await vi.waitFor(async () => expect(await db.query.weatherDepartments.findFirst()).toBeTruthy());
    expect((await home(u)).json.weather).toMatchObject({ kind: "place", department: "11", summary: { code: "clear" } });
  });

  it("stock frais d'aujourd'hui : servi sans appel au fournisseur ; périmé mais d'aujourd'hui : servi, rafraîchi en arrière-plan", async () => {
    const { u } = await world();
    await moveTo(u, "34");
    await db.insert(weatherDepartments).values(departmentRow("2026-11-10", new Date(NOW.getTime() - HOUR), "34"));
    // Lot R8m : la case de la préfecture (« Ma météo ») est fraîche aussi, sinon l'Accueil la rafraîchirait.
    const prefecture = weatherCell(departmentPrefectures["34"] as { lat: number; lng: number });
    await db.insert(weatherPlacesCache).values({
      cell: prefecture.key,
      provider: "open-meteo",
      fetchedAt: new Date(NOW.getTime() - HOUR),
      forecast: { days: [], hours: [] },
    });
    const calls = vi.fn(async () => new Response(JSON.stringify(omDay("2026-11-10")), { status: 200 }));
    setWeatherFetch(calls as unknown as typeof fetch);
    expect((await home(u)).json.weather).toMatchObject({ summary: { code: "cloudy" } });
    expect(calls).not.toHaveBeenCalled();
    await db.update(weatherDepartments).set({ fetchedAt: new Date(NOW.getTime() - 5 * HOUR) });
    expect((await home(u)).json.weather).toMatchObject({ summary: { code: "cloudy" } });
    await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(1));
    await settle();
  });
});

describe("tour 2 : les cartes de « Prochaine sortie » décident de la météo", () => {
  async function ticketed(orga: TestUser, structureId: string, u: TestUser, startsAt: Date, status?: "used") {
    const e = await stored(structureId, { startsAt, publicAccess: "free_reservation" });
    expect((await call(orga, "PUT", `/events/${e.id}/ticketing`, { enabled: true, capacity: 5 })).status).toBe(200);
    expect((await call(u, "POST", `/events/${e.id}/tickets/reserve`, { quantity: 1 })).status).toBe(201);
    if (status) await db.update(tickets).set({ status, usedAt: NOW }).where(eq(tickets.eventId, e.id));
    return e;
  }

  it("un billet contrôlé d'un événement qui n'est pas fini garde sa météo ; l'événement fini, plus", async () => {
    const { s, u, orga } = await world();
    const open = await ticketed(orga, s.id, u, at(2), "used");
    expect(Object.keys((await home(u)).json.outingsWeather)).toEqual([open.id]);
    await db
      .update(events)
      .set({ startsAt: at(-1), endsAt: at(-0.5) })
      .where(eq(events.id, open.id));
    expect((await home(u)).json.outingsWeather).toEqual({});
  });

  it("la place retenue à J+6 garde sa météo (et son bandeau) derrière six billets plus proches ; le sixième billet, non", async () => {
    const { s, u, veh, orga } = await world();
    const accepted = await stored(s.id, { startsAt: at(6), outlook: "uncertain" });
    await apply(u, veh.id, accepted.id, "accepted");
    const near: { id: string }[] = [];
    for (const days of [0.5, 1, 2, 3, 4, 5]) near.push(await ticketed(orga, s.id, u, at(days)));
    const r = await home(u);
    const keys = Object.keys(r.json.outingsWeather);
    expect(keys).toHaveLength(6);
    expect(r.json.outingsWeather[accepted.id]?.uncertain).toBe(true);
    // Six cartes : la place retenue + les cinq billets les plus proches ; le sixième billet n'a pas de carte.
    expect(keys).not.toContain(near[5]?.id);
    expect(keys).toContain(near[4]?.id);
  });
});
