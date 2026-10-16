// Météo (lot 28) : fournisseurs avec `fetch` simulé (réponses réelles enregistrées dans test/fixtures), agrégation
// MET Norway, tâche `weather.refresh`, suggestion « Incertain » (une fois par 24 h, maintenu, ≤ 72 h), rappel de la
// veille avec et sans météo, routes, indisponibilité du fournisseur. Aucun appel réseau.
import { readFileSync } from "node:fs";
import { addDays, fromWallTime, wallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  useClock,
} from "../../../test/helpers";
import { db } from "../../db/client";
import {
  applications,
  events,
  eventWeather,
  notifications,
  profiles,
  structureMembers,
  weatherDepartments,
} from "../../db/schema";
import {
  aggregateMetNorway,
  fetchForecast,
  metSymbolToCode,
  parseOpenMeteo,
  setWeatherFetch,
  wmoToCode,
} from "../../lib/weather";
import { eventJobs } from "../events/jobs";
import { weatherService } from "./service";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../test/fixtures/${name}`, import.meta.url), "utf8"));

const NOW = new Date("2026-10-16T09:00:00Z");
const HOUR = 3_600_000;

type OmDay = { date: string; code?: number; prob?: number; mm?: number; wind?: number; tmin?: number; tmax?: number };

/** Réponse Open-Meteo synthétique (même forme que la réponse réelle) : 24 heures par jour. */
function omBody(days: OmDay[]) {
  const hourly = {
    time: [] as string[],
    weather_code: [] as number[],
    temperature_2m: [] as number[],
    precipitation_probability: [] as number[],
    precipitation: [] as number[],
    wind_speed_10m: [] as number[],
  };
  for (const d of days) {
    for (let h = 0; h < 24; h++) {
      hourly.time.push(`${d.date}T${String(h).padStart(2, "0")}:00`);
      hourly.weather_code.push(d.code ?? 0);
      hourly.temperature_2m.push(d.tmax ?? 21);
      hourly.precipitation_probability.push(d.prob ?? 0);
      hourly.precipitation.push((d.mm ?? 0) / 24);
      hourly.wind_speed_10m.push(d.wind ?? 10);
    }
  }
  return {
    daily: {
      time: days.map((d) => d.date),
      weather_code: days.map((d) => d.code ?? 0),
      temperature_2m_max: days.map((d) => d.tmax ?? 21),
      temperature_2m_min: days.map((d) => d.tmin ?? 14),
      precipitation_probability_max: days.map((d) => d.prob ?? 0),
      precipitation_sum: days.map((d) => d.mm ?? 0),
      wind_speed_10m_max: days.map((d) => d.wind ?? 10),
    },
    hourly,
  };
}

const dates = [
  "2026-10-16",
  "2026-10-17",
  "2026-10-18",
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
];
const sunny = () => omBody(dates.map((date) => ({ date })));
const rainy = () => omBody(dates.map((date) => ({ date, code: 80, prob: 80, mm: 9, tmin: 14, tmax: 21 })));

function fakeFetch(body: () => unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    status === 200 ? Response.json(body()) : new Response("erreur", { status }),
  );
}

const sentHeaders = (init?: RequestInit) => (init?.headers ?? {}) as Record<string, string>;

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await db.delete(weatherDepartments);
  await resetDb();
  clock = useClock(NOW);
});
afterEach(() => setWeatherFetch(null));

async function setup(over: Partial<typeof events.$inferInsert> = {}) {
  const orga = await signUp("Orga_Meteo", { twoFactor: true });
  const s = await createStructure(orga.id);
  const startsAt = over.startsAt ?? new Date(NOW.getTime() + 2 * 24 * HOUR);
  const e = await createEvent(s.id, { lat: 42.7, lng: 3.03, city: "Canet", startsAt, ...over });
  return { orga, s, e };
}

describe("fournisseurs", () => {
  it("Open-Meteo : réponse réelle enregistrée (Canet), codes WMO ramenés à la liste courte", () => {
    const f = parseOpenMeteo(fixture("open-meteo-canet.json"));
    expect(f.daily).toHaveLength(7);
    expect(f.daily[0]).toMatchObject({ date: "2026-10-16", tempMax: 22.8, tempMin: 16.8, code: "cloudy" });
    expect(f.daily[1]).toMatchObject({ date: "2026-10-17", code: "drizzle", precipitationProbability: 5 });
    expect(f.daily[3]).toMatchObject({ date: "2026-10-19", precipitationMm: 8, precipitationProbability: 56 });
    expect(f.hourly).toHaveLength(168);
    // 2026-10-16T00:00 heure de Paris (UTC+2).
    expect(f.hourly[0]?.time).toBe("2026-10-15T22:00:00.000Z");
    expect(wmoToCode(0)).toBe("clear");
    expect(wmoToCode(2)).toBe("partly_cloudy");
    expect(wmoToCode(45)).toBe("fog");
    expect(wmoToCode(63)).toBe("rain");
    expect(wmoToCode(65)).toBe("heavy_rain");
    expect(wmoToCode(73)).toBe("snow");
    expect(wmoToCode(95)).toBe("thunderstorm");
  });

  it("Open-Meteo : requête sans clé, en heure de Paris, User-Agent identifiant", async () => {
    const f = fakeFetch(sunny);
    setWeatherFetch(f as unknown as typeof fetch);
    const r = await fetchForecast(42.7, 3.03);
    expect(r?.provider).toBe("open-meteo");
    const url = new URL(String(f.mock.calls[0]?.[0]));
    expect(url.hostname).toBe("api.open-meteo.com");
    expect(url.searchParams.get("timezone")).toBe("Europe/Paris");
    expect(url.searchParams.get("daily")).toContain("precipitation_probability_max");
    expect(sentHeaders(f.mock.calls[0]?.[1])["user-agent"]).toMatch(/^Orasso\//);
  });

  it("MET Norway : agrégation journalière de la réponse réelle (heure de Paris, m/s → km/h)", () => {
    const f = aggregateMetNorway(fixture("met-norway-canet.json"));
    const first = f.daily[0];
    expect(first?.date).toBe("2026-10-16");
    expect(first?.precipitationProbability).toBeNull();
    expect(first?.tempMax).toBeGreaterThanOrEqual(20);
    expect(f.daily.map((d) => d.date)).toContain("2026-10-20");
    // Premier point : 3,5 m/s = 12,6 km/h, ciel dégagé.
    expect(f.hourly[0]).toMatchObject({ time: "2026-10-16T13:00:00.000Z", temp: 20.6, windKmh: 12.6, code: "clear" });
    // Les jours lointains (tranches de 6 h) gardent une pluie cumulée finie.
    for (const d of f.daily) expect(Number.isFinite(d.precipitationMm)).toBe(true);
    expect(metSymbolToCode("lightrainshowers_day")).toBe("rain");
    expect(metSymbolToCode("lightrain")).toBe("drizzle");
    expect(metSymbolToCode("heavyrain")).toBe("heavy_rain");
    expect(metSymbolToCode("rainandthunder")).toBe("thunderstorm");
    expect(metSymbolToCode("sleet")).toBe("snow");
    expect(metSymbolToCode("partlycloudy_night")).toBe("partly_cloudy");
    expect(metSymbolToCode("fog")).toBe("fog");
  });

  it("MET Norway : User-Agent obligatoire, Expires respecté (un seul appel), If-Modified-Since renvoyé ensuite", async () => {
    const { env } = await import("../../env");
    const previous = env.WEATHER_PROVIDER;
    (env as { WEATHER_PROVIDER: string }).WEATHER_PROVIDER = "met-norway";
    try {
      let expires = Date.now() + 60_000;
      const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const sentCondition = sentHeaders(init)["if-modified-since"];
        if (sentCondition)
          return new Response(null, { status: 304, headers: { expires: new Date(expires).toUTCString() } });
        return new Response(JSON.stringify(fixture("met-norway-canet.json")), {
          status: 200,
          headers: { expires: new Date(expires).toUTCString(), "last-modified": "Fri, 16 Oct 2026 13:03:31 GMT" },
        });
      });
      setWeatherFetch(f as unknown as typeof fetch);
      const a = await fetchForecast(42.7, 3.03);
      expect(a?.provider).toBe("met-norway");
      const url = new URL(String(f.mock.calls[0]?.[0]));
      expect(url.hostname).toBe("api.met.no");
      expect(url.searchParams.get("lat")).toBe("42.7000");
      expect(sentHeaders(f.mock.calls[0]?.[1])["user-agent"]).toMatch(/Orasso/);
      // Avant l'expiration : pas de nouvel appel.
      await fetchForecast(42.7, 3.03);
      expect(f).toHaveBeenCalledTimes(1);
      // Après l'expiration : appel conditionnel, 304 → même prévision.
      expires = Date.now() - 1000;
      const again = await fetchForecast(42.7, 3.03);
      expect(again?.forecast.daily.length).toBe(a?.forecast.daily.length);
    } finally {
      (env as { WEATHER_PROVIDER: string }).WEATHER_PROVIDER = previous;
    }
  });

  it("sans fetch simulé, la météo est désactivée en test : null, aucun appel réseau", async () => {
    expect(await fetchForecast(42.7, 3.03)).toBeNull();
  });
});

describe("tâche weather.refresh et suggestion « Incertain »", () => {
  it("80 % de pluie à 2 jours : suggestion aux organisateurs, un seul envoi par 24 h, puis de nouveau après 24 h", async () => {
    const { orga, s, e } = await setup();
    const coorga = await signUp("Coorga_Meteo", { twoFactor: true });
    await db.insert(structureMembers).values({
      structureId: s.id,
      userId: coorga.id,
      role: "co_organizer",
      status: "active",
    });
    const f = fakeFetch(rainy);
    setWeatherFetch(f as unknown as typeof fetch);

    expect(await weatherService.refresh()).toEqual({ refreshed: 1, suggested: 1 });
    const sent = await db.query.notifications.findMany({
      where: eq(notifications.type, "event_weather_suggest_uncertain"),
    });
    expect(sent.map((n) => n.userId).sort()).toEqual([orga.id, coorga.id].sort());
    expect(sent[0]).toMatchObject({ family: "staff", eventId: e.id });
    expect(sent[0]?.data).toMatchObject({
      eventId: e.id,
      action: "set_outlook_uncertain",
      link: `/orga/${s.slug}/e/${e.id}`,
    });
    expect(sent[0]?.body).toContain("averses probables (80 %)");

    // Trois heures plus tard : la tâche repasse, aucune nouvelle suggestion.
    clock.advance(3 * HOUR);
    expect(await weatherService.refresh()).toEqual({ refreshed: 1, suggested: 0 });
    expect(
      await db.query.notifications.findMany({ where: eq(notifications.type, "event_weather_suggest_uncertain") }),
    ).toHaveLength(2);

    // Plus de 24 h après (toujours à moins de 72 h du début) : de nouveau.
    clock.advance(22 * HOUR);
    expect(await weatherService.refresh()).toEqual({ refreshed: 1, suggested: 1 });
    expect(
      await db.query.notifications.findMany({ where: eq(notifications.type, "event_weather_suggest_uncertain") }),
    ).toHaveLength(4);
  });

  it("deux passages simultanés n'envoient qu'une fois", async () => {
    await setup();
    setWeatherFetch(fakeFetch(rainy) as unknown as typeof fetch);
    const [a, b] = await Promise.all([weatherService.refresh(), weatherService.refresh()]);
    expect(a.suggested + b.suggested).toBe(1);
    expect(
      await db.query.notifications.findMany({ where: eq(notifications.type, "event_weather_suggest_uncertain") }),
    ).toHaveLength(1);
  });

  it("pas de suggestion si l'événement est déjà Incertain, à plus de 72 h, ou si la météo est bonne", async () => {
    setWeatherFetch(fakeFetch(rainy) as unknown as typeof fetch);
    const { e: uncertain } = await setup({ outlook: "uncertain" });
    expect(await weatherService.refresh(uncertain.id)).toEqual({ refreshed: 1, suggested: 0 });
    await resetDb();
    clock = useClock(NOW);
    const { e: far } = await setup({ startsAt: new Date(NOW.getTime() + 5 * 24 * HOUR) });
    expect(await weatherService.refresh(far.id)).toEqual({ refreshed: 1, suggested: 0 });
    // La météo est tout de même stockée (affichée à 7 jours).
    expect((await db.query.eventWeather.findFirst({ where: eq(eventWeather.eventId, far.id) }))?.badWeather).toBe(true);
    await resetDb();
    clock = useClock(NOW);
    setWeatherFetch(fakeFetch(sunny) as unknown as typeof fetch);
    const { e: nice } = await setup();
    expect(await weatherService.refresh(nice.id)).toEqual({ refreshed: 1, suggested: 0 });
    expect((await db.query.eventWeather.findFirst({ where: eq(eventWeather.eventId, nice.id) }))?.badWeather).toBe(
      false,
    );
  });

  it("événements concernés : publiés, localisés, à 7 jours au plus ; un seul appel pour un même lieu", async () => {
    const { s } = await setup();
    await createEvent(s.id, { lat: 42.7, lng: 3.03, startsAt: new Date(NOW.getTime() + 3 * 24 * HOUR) });
    await createEvent(s.id, { lat: 42.7, lng: 3.03, startsAt: new Date(NOW.getTime() + 20 * 24 * HOUR) });
    await createEvent(s.id, { lat: null, lng: null, startsAt: new Date(NOW.getTime() + 1 * 24 * HOUR) });
    await createEvent(s.id, {
      lat: 42.7,
      lng: 3.03,
      status: "draft",
      startsAt: new Date(NOW.getTime() + 1 * 24 * HOUR),
    });
    const f = fakeFetch(sunny);
    setWeatherFetch(f as unknown as typeof fetch);
    expect((await weatherService.refresh()).refreshed).toBe(2);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("fournisseur indisponible : rien ne casse, l'ancienne prévision est gardée", async () => {
    const { e } = await setup();
    setWeatherFetch(fakeFetch(sunny) as unknown as typeof fetch);
    await weatherService.refresh();
    const before = await db.query.eventWeather.findFirst({ where: eq(eventWeather.eventId, e.id) });
    clock.advance(3 * HOUR);
    setWeatherFetch(fakeFetch(() => ({}), 503) as unknown as typeof fetch);
    expect(await weatherService.refresh()).toEqual({ refreshed: 0, suggested: 0 });
    setWeatherFetch(
      vi.fn(async () => {
        throw new Error("réseau coupé");
      }) as unknown as typeof fetch,
    );
    expect(await weatherService.refresh()).toEqual({ refreshed: 0, suggested: 0 });
    const after = await db.query.eventWeather.findFirst({ where: eq(eventWeather.eventId, e.id) });
    expect(after?.fetchedAt).toEqual(before?.fetchedAt);
  });
});

describe("passage en Incertain depuis la notification", () => {
  it("la notification porte l'action ; PATCH /events/:id/outlook prévient les inscrits", async () => {
    const { orga, e } = await setup();
    const ref = await seedReference();
    const fan = await signUp("Fan_Meteo");
    const v = await createVehicle(fan.id, ref);
    await db.insert(applications).values({
      eventId: e.id,
      userId: fan.id,
      vehicleId: v.id,
      status: "accepted",
      rulesAcceptedAt: NOW,
      followStructure: false,
    });
    setWeatherFetch(fakeFetch(rainy) as unknown as typeof fetch);
    await weatherService.refresh();
    const list = await call(orga, "GET", "/me/notifications");
    const suggestion = list.json.items.find((n: { type: string }) => n.type === "event_weather_suggest_uncertain");
    expect(suggestion.data.action).toBe("set_outlook_uncertain");
    const res = await call(orga, "PATCH", `/events/${suggestion.data.eventId}/outlook`, { outlook: "uncertain" });
    expect(res.status).toBe(200);
    expect(res.json.outlook).toBe("uncertain");
    const informed = await db.query.notifications.findMany({ where: eq(notifications.type, "event_outlook_changed") });
    expect(informed.map((n) => n.userId)).toEqual([fan.id]);
    // Incertain : plus de nouvelle suggestion.
    clock.advance(30 * HOUR);
    expect((await weatherService.refresh()).suggested).toBe(0);
  });
});

describe("rappel de la veille", () => {
  async function eveReminder(withWeather: boolean) {
    const startsAt = new Date(NOW.getTime() + 2 * 24 * HOUR);
    const { e } = await setup({ startsAt });
    const ref = await seedReference();
    const fan = await signUp("Fan_Veille");
    const v = await createVehicle(fan.id, ref);
    await db.insert(applications).values({
      eventId: e.id,
      userId: fan.id,
      vehicleId: v.id,
      status: "accepted",
      rulesAcceptedAt: NOW,
      followStructure: false,
    });
    if (withWeather) {
      setWeatherFetch(fakeFetch(rainy) as unknown as typeof fetch);
      await weatherService.refresh();
    }
    // Veille à 18:00 (Paris), comme `reminderEveAt` de la tâche.
    const at = fromWallTime({ ...addDays(wallTime(e.startsAt, e.timezone), -1), hour: 18, minute: 0 }, e.timezone);
    clock.set(at);
    // La tâche de rafraîchissement (toutes les 3 h) a tourné entre-temps.
    if (withWeather) await weatherService.refresh();
    expect(await eventJobs.reminderEve({ eventId: e.id, at: at.toISOString() })).toBe(true);
    return db.query.notifications.findFirst({ where: eq(notifications.type, "event_reminder_eve") });
  }

  it("avec la météo : « Météo : 21 °C, averses probables (80 %) (Open-Meteo) »", async () => {
    const n = await eveReminder(true);
    expect(n?.body).toContain("Météo : 21 °C, averses probables (80 %) (Open-Meteo)");
  });

  it("sans météo (fournisseur absent) : le rappel part sans ligne météo", async () => {
    const n = await eveReminder(false);
    expect(n).toBeTruthy();
    expect(n?.body).not.toContain("Météo");
  });

  it("prévision trop ancienne (rafraîchissement en panne depuis plus de 12 h) : pas de météo", async () => {
    const startsAt = new Date(NOW.getTime() + 2 * 24 * HOUR);
    const { e } = await setup({ startsAt });
    setWeatherFetch(fakeFetch(rainy) as unknown as typeof fetch);
    await weatherService.refresh();
    clock.advance(13 * HOUR);
    expect(await weatherService.reminderLine(e)).toBeNull();
  });
});

describe("routes", () => {
  it("GET /events/by-slug/:slug/weather : météo avec attribution et cache d'une heure ; null au-delà de 7 jours", async () => {
    const { e } = await setup();
    setWeatherFetch(fakeFetch(rainy) as unknown as typeof fetch);
    await weatherService.refresh();
    const res = await call(null, "GET", `/events/by-slug/${e.slug}/weather`);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      provider: "open-meteo",
      attribution: "Météo : Open-Meteo",
      summary: { code: "rain", precipitationProbability: 80 },
    });
    expect(res.json.days.length).toBeGreaterThan(0);
    const raw = await (await import("../../app")).app.request(`/api/events/by-slug/${e.slug}/weather`);
    expect(raw.headers.get("cache-control")).toBe("public, max-age=3600");

    // Plus de 7 jours avant : null (même avec une ligne en base).
    clock.set(new Date(NOW.getTime() - 6 * 24 * HOUR));
    const far = await call(null, "GET", `/events/by-slug/${e.slug}/weather`);
    expect(far.status).toBe(200);
    expect(far.json).toBeNull();
  });

  it("sans prévision ou fournisseur en panne : null (pas d'erreur) ; brouillon : 404", async () => {
    const { s, e } = await setup();
    expect((await call(null, "GET", `/events/by-slug/${e.slug}/weather`)).json).toBeNull();
    const draft = await createEvent(s.id, { status: "draft" });
    expect((await call(null, "GET", `/events/by-slug/${draft.slug}/weather`)).status).toBe(404);
  });

  it("adresse modifiée (position changée) : la prévision n'est plus valable, la suivante la remplace", async () => {
    const { e } = await setup();
    setWeatherFetch(fakeFetch(rainy) as unknown as typeof fetch);
    await weatherService.refresh();
    await db.update(events).set({ lat: 43.6, lng: 1.44 }).where(eq(events.id, e.id));
    expect((await call(null, "GET", `/events/by-slug/${e.slug}/weather`)).json).toBeNull();
    expect(
      await weatherService.reminderLine((await db.query.events.findFirst({ where: eq(events.id, e.id) }))!),
    ).toBeNull();
    clock.advance(3 * HOUR);
    await weatherService.refresh();
    expect((await call(null, "GET", `/events/by-slug/${e.slug}/weather`)).json).toMatchObject({
      provider: "open-meteo",
    });
  });

  it("GET /me/weather : événement accepté dans les 7 jours, sinon le département (cache de 3 h), sinon null", async () => {
    const { e } = await setup();
    const ref = await seedReference();
    const fan = await signUp("Fan_Accueil");
    expect((await call(fan, "GET", "/me/weather")).json).toBeNull();
    expect((await call(null, "GET", "/me/weather")).status).toBe(401);

    const f = fakeFetch(sunny);
    setWeatherFetch(f as unknown as typeof fetch);
    await db
      .update(profiles)
      .set({ departments: ["66"] })
      .where(eq(profiles.userId, fan.id));
    const place = await call(fan, "GET", "/me/weather");
    expect(place.json).toMatchObject({
      kind: "place",
      department: "66",
      attribution: "Météo : Open-Meteo",
      summary: { date: "2026-10-16" },
    });
    await call(fan, "GET", "/me/weather");
    expect(f).toHaveBeenCalledTimes(1);

    const v = await createVehicle(fan.id, ref);
    await db.insert(applications).values({
      eventId: e.id,
      userId: fan.id,
      vehicleId: v.id,
      status: "accepted",
      rulesAcceptedAt: NOW,
      followStructure: false,
    });
    await weatherService.refresh();
    const mine = await call(fan, "GET", "/me/weather");
    expect(mine.json).toMatchObject({ kind: "event", event: { slug: e.slug }, attribution: "Météo : Open-Meteo" });
  });
});
