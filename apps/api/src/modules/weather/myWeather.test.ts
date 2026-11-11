// Lot R8m : « Ma météo » (lieux choisis, préfecture par défaut T10, « Utiliser ma position », recherche d'une commune).
// Le point sensible : la position d'une personne n'est jamais stockée ni journalisée (seule la case de 0,1° existe, sans
// compte). Aucun appel réseau : le fournisseur et le géocodeur sont des bouchons qui enregistrent ce qu'ils reçoivent.
import { weatherCell } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { call, resetDb, signUp, useClock } from "../../../test/helpers";
import { db } from "../../db/client";
import { profiles, profileWeatherPlaces, user, weatherDepartments, weatherPlacesCache } from "../../db/schema";
import { env } from "../../env";
import { setGeocodeFetch } from "../../lib/geocode";
import { resetRateLimits } from "../../lib/rateLimit";
import { setWeatherFetch } from "../../lib/weather";
import { resetPlaceCellState, weatherService } from "./service";

const NOW = new Date("2026-10-16T09:00:00Z");
const HOUR = 3_600_000;
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

/** Réponse Open-Meteo synthétique : 24 heures par jour, avec ressenti, rafales et direction du vent. */
function omBody(temp = 21) {
  const hourly = {
    time: [] as string[],
    weather_code: [] as number[],
    temperature_2m: [] as number[],
    precipitation_probability: [] as number[],
    precipitation: [] as number[],
    wind_speed_10m: [] as number[],
    apparent_temperature: [] as number[],
    wind_gusts_10m: [] as number[],
    wind_direction_10m: [] as number[],
  };
  for (const date of dates) {
    for (let h = 0; h < 24; h++) {
      hourly.time.push(`${date}T${String(h).padStart(2, "0")}:00`);
      hourly.weather_code.push(0);
      hourly.temperature_2m.push(temp);
      hourly.precipitation_probability.push(5);
      hourly.precipitation.push(0);
      hourly.wind_speed_10m.push(18);
      hourly.apparent_temperature.push(temp - 2);
      hourly.wind_gusts_10m.push(30);
      hourly.wind_direction_10m.push(315);
    }
  }
  return {
    daily: {
      time: dates,
      weather_code: dates.map(() => 0),
      temperature_2m_max: dates.map(() => temp),
      temperature_2m_min: dates.map(() => 10),
      precipitation_probability_max: dates.map(() => 5),
      precipitation_sum: dates.map(() => 0),
      wind_speed_10m_max: dates.map(() => 22),
    },
    hourly,
  };
}

/** Bouchon du fournisseur : garde les adresses demandées. */
function providerStub(body: () => unknown = () => omBody(), status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    status === 200 ? Response.json(body()) : new Response("erreur", { status }),
  );
}
const urlsOf = (f: ReturnType<typeof providerStub>) => f.mock.calls.map((c) => String(c[0]));

/** Bouchon du géocodeur : `/reverse` (commune de la case) et `/search` (communes à choisir). */
function geocoderStub(city: string | null = "Perpignan") {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("/reverse")) {
      return Response.json({ features: city ? [{ properties: { city } }] : [] });
    }
    return Response.json({
      features: [
        {
          geometry: { coordinates: [3.025655, 42.549618] },
          properties: { city: "Argelès-sur-Mer", depcode: "66", context: "66, Pyrénées-Orientales, Occitanie" },
        },
        {
          geometry: { coordinates: [-0.094273, 43.005398] },
          properties: { city: "Argelès-Gazost", context: "65, Hautes-Pyrénées, Occitanie" },
        },
        // Hors de France du référentiel : écartée.
        { geometry: { coordinates: [-0.12, 51.5] }, properties: { city: "Londres", depcode: "99" } },
        // Sans coordonnées : écartée.
        { properties: { city: "Sans coordonnées" } },
      ],
    });
  });
}

const previousMeteoUrl = env.METEO_URL;
let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  env.METEO_URL = undefined;
  await resetDb();
  await db.delete(weatherDepartments);
  await db.delete(weatherPlacesCache);
  clock = useClock(NOW);
  resetRateLimits();
  resetPlaceCellState();
});
afterEach(() => {
  env.METEO_URL = previousMeteoUrl;
  setWeatherFetch(null);
  setGeocodeFetch(null);
  vi.restoreAllMocks();
});

async function fan(pseudo: string, departments: string[] = ["66"]) {
  const u = await signUp(pseudo);
  await db.update(profiles).set({ departments }).where(eq(profiles.userId, u.id));
  return u;
}

const perpignan = { label: "Perpignan", lat: 42.7, lng: 2.9 };
const argeles = { label: "Argelès-sur-Mer", lat: 42.55, lng: 3.02 };

describe("GET /me/weather/places", () => {
  it("session requise", async () => {
    expect((await call(null, "GET", "/me/weather/places")).status).toBe(401);
  });

  it("par défaut (T10) : la préfecture du premier département, avec l'heure en cours et six heures", async () => {
    const f = providerStub();
    setWeatherFetch(f as unknown as typeof fetch);
    const u = await fan("Fan_Defaut", ["66", "11"]);
    const res = await call(u, "GET", "/me/weather/places");
    expect(res.status).toBe(200);
    expect(res.json.max).toBe(2);
    expect(res.json.places).toHaveLength(1);
    const [place] = res.json.places;
    expect(place).toMatchObject({ slot: 0, label: "Perpignan", source: "default" });
    expect(place.weather.provider).toBe("open-meteo");
    expect(place.weather.attribution).toBe("Météo : Open-Meteo");
    expect(place.weather.today.date).toBe("2026-10-16");
    // 09:00 UTC : l'heure en cours, puis 10:00 … 15:00 UTC.
    expect(place.weather.now.time).toBe("2026-10-16T09:00:00.000Z");
    expect(place.weather.hours.map((h: { time: string }) => h.time)).toEqual(
      [1, 2, 3, 4, 5, 6].map((i) => new Date(NOW.getTime() + i * HOUR).toISOString()),
    );
    expect(place.weather.now).toMatchObject({ feelsLike: 19, gustKmh: 30, windDirection: 315 });
    // Au fournisseur : la case de 0,1° de Perpignan (42.7 ; 2.9), rien d'autre.
    expect(urlsOf(f)).toHaveLength(1);
    expect(urlsOf(f)[0]).toContain("latitude=42.7000");
    expect(urlsOf(f)[0]).toContain("longitude=2.9000");
  });

  it("lieux choisis : ils remplacent la ville par défaut, dans l'ordre", async () => {
    setWeatherFetch(providerStub() as unknown as typeof fetch);
    const u = await fan("Fan_Choisis");
    await call(u, "PUT", "/me/weather/places", { places: [perpignan, argeles] });
    const res = await call(u, "GET", "/me/weather/places");
    expect(
      res.json.places.map((p: { label: string; source: string; slot: number }) => [p.slot, p.label, p.source]),
    ).toEqual([
      [0, "Perpignan", "saved"],
      [1, "Argelès-sur-Mer", "saved"],
    ]);
  });

  it("sans département ni lieu choisi : aucun lieu (l'invitation « Choisis ta ville »)", async () => {
    const f = providerStub();
    setWeatherFetch(f as unknown as typeof fetch);
    const u = await fan("Fan_SansDep", []);
    const res = await call(u, "GET", "/me/weather/places");
    expect(res.json).toEqual({ places: [], max: 2 });
    expect(f).not.toHaveBeenCalled();
  });

  it("fournisseur en panne : le lieu reste, sa météo est null, jamais un 500", async () => {
    setWeatherFetch(providerStub(() => ({}), 500) as unknown as typeof fetch);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const u = await fan("Fan_Panne");
    const res = await call(u, "GET", "/me/weather/places");
    expect(res.status).toBe(200);
    expect(res.json.places).toHaveLength(1);
    expect(res.json.places[0].weather).toBeNull();
    expect(res.json.places[0].label).toBe("Perpignan");
  });

  it("fournisseur en panne : pas de nouvel appel avant 10 minutes", async () => {
    const f = providerStub(() => ({}), 500);
    setWeatherFetch(f as unknown as typeof fetch);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const u = await fan("Fan_Panne2");
    await call(u, "GET", "/me/weather/places");
    await call(u, "GET", "/me/weather/places");
    expect(f).toHaveBeenCalledTimes(1);
    clock.advance(11 * 60_000);
    await call(u, "GET", "/me/weather/places");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("liste blanche des champs", async () => {
    setWeatherFetch(providerStub() as unknown as typeof fetch);
    const u = await fan("Fan_Blanche");
    const res = await call(u, "GET", "/me/weather/places");
    expect(Object.keys(res.json).sort()).toEqual(["max", "places"]);
    expect(Object.keys(res.json.places[0]).sort()).toEqual(["label", "slot", "source", "weather"]);
    expect(Object.keys(res.json.places[0].weather).sort()).toEqual([
      "attribution",
      "fetchedAt",
      "hours",
      "now",
      "provider",
      "today",
    ]);
    expect(JSON.stringify(res.json)).not.toMatch(/"(lat|lng|userId|cell)"/);
  });
});

describe("PUT /me/weather/places", () => {
  it("remplace tout, arrondit à 0,01°, et n'touche pas ceux d'un autre compte", async () => {
    const a = await fan("Fan_A");
    const b = await fan("Fan_B");
    await call(b, "PUT", "/me/weather/places", { places: [argeles] });
    const put = await call(a, "PUT", "/me/weather/places", {
      places: [{ label: "Perpignan", lat: 42.70499, lng: 2.89601 }, argeles],
    });
    expect(put.status).toBe(200);
    const rows = await db.select().from(profileWeatherPlaces).where(eq(profileWeatherPlaces.userId, a.id));
    expect(rows.map((r) => [r.slot, r.label, r.lat, r.lng]).sort()).toEqual([
      [0, "Perpignan", 42.7, 2.9],
      [1, "Argelès-sur-Mer", 42.55, 3.02],
    ]);
    // Remplace tout : un seul lieu, puis aucun.
    await call(a, "PUT", "/me/weather/places", { places: [argeles] });
    expect(await db.select().from(profileWeatherPlaces).where(eq(profileWeatherPlaces.userId, a.id))).toHaveLength(1);
    await call(a, "PUT", "/me/weather/places", { places: [] });
    expect(await db.select().from(profileWeatherPlaces).where(eq(profileWeatherPlaces.userId, a.id))).toHaveLength(0);
    // Le lieu de l'autre compte est intact.
    const others = await db.select().from(profileWeatherPlaces).where(eq(profileWeatherPlaces.userId, b.id));
    expect(others.map((r) => r.label)).toEqual(["Argelès-sur-Mer"]);
  });

  it("trois lieux, hors de France, libellé vide ou trop long, champ en trop : 400", async () => {
    const u = await fan("Fan_Refus");
    const bad = [
      { places: [perpignan, argeles, perpignan] },
      { places: [{ label: "Londres", lat: 51.5, lng: -0.12 }] },
      { places: [{ label: "   ", lat: 42.7, lng: 2.9 }] },
      { places: [{ label: "x".repeat(81), lat: 42.7, lng: 2.9 }] },
      { places: [{ ...perpignan, email: "x" }] },
      { places: [{ label: "Perpignan", lat: "42.7", lng: 2.9 }] },
      {},
    ];
    for (const body of bad) {
      const res = await call(u, "PUT", "/me/weather/places", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await db.select().from(profileWeatherPlaces).where(eq(profileWeatherPlaces.userId, u.id))).toHaveLength(0);
  });

  it("session requise ; deux enregistrements simultanés du même compte : jamais d'erreur", async () => {
    expect((await call(null, "PUT", "/me/weather/places", { places: [] })).status).toBe(401);
    const u = await fan("Fan_Course");
    const all = await Promise.all([
      call(u, "PUT", "/me/weather/places", { places: [perpignan, argeles] }),
      call(u, "PUT", "/me/weather/places", { places: [argeles] }),
      call(u, "PUT", "/me/weather/places", { places: [perpignan] }),
    ]);
    for (const r of all) expect(r.status).toBe(200);
    const rows = await db.select().from(profileWeatherPlaces).where(eq(profileWeatherPlaces.userId, u.id));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeLessThanOrEqual(2);
  });

  it("le compte supprimé emporte ses lieux (clé étrangère et suppression du compte)", async () => {
    const u = await fan("Fan_Suppr");
    await call(u, "PUT", "/me/weather/places", { places: [perpignan] });
    const res = await call(u, "DELETE", "/me", { password: "motdepasse-test-123" });
    expect(res.status).toBe(200);
    expect(await db.select().from(profileWeatherPlaces).where(eq(profileWeatherPlaces.userId, u.id))).toHaveLength(0);

    const v = await fan("Fan_Cascade");
    await call(v, "PUT", "/me/weather/places", { places: [perpignan] });
    await db.delete(user).where(eq(user.id, v.id));
    expect(await db.select().from(profileWeatherPlaces).where(eq(profileWeatherPlaces.userId, v.id))).toHaveLength(0);
  });
});

describe("POST /weather/at : la position n'est ni stockée ni journalisée", () => {
  // Une position volontairement précise : ni elle ni aucune de ses parties ne doivent se retrouver quelque part.
  const exact = { lat: 42.704937, lng: 2.895412 };
  const needles = ["42.704937", "2.895412", "42.7049", "2.8954"];

  it("la case de 0,1° est tout ce qui part et tout ce qui reste ; aucune ligne d'aucune table ne porte la position", async () => {
    const provider = providerStub();
    const geocoder = geocoderStub("Perpignan");
    setWeatherFetch(provider as unknown as typeof fetch);
    setGeocodeFetch(geocoder as unknown as typeof fetch);
    const logs: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(
          args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" "),
        );
      });
    }
    const u = await fan("Fan_Position");
    const placesBefore = await db.select().from(profileWeatherPlaces);

    const res = await call(u, "POST", "/weather/at", exact);
    expect(res.status).toBe(200);
    expect(res.json.label).toBe("Perpignan");
    expect(res.json.weather.now.time).toBe("2026-10-16T09:00:00.000Z");
    expect(Object.keys(res.json).sort()).toEqual(["label", "weather"]);

    // Le fournisseur et le géocodeur n'ont reçu que la case (42.7 ; 2.9).
    const sent = [...urlsOf(provider), ...geocoder.mock.calls.map((c) => String(c[0]))].join("\n");
    expect(sent).toContain("42.7");
    for (const needle of needles) expect(sent, needle).not.toContain(needle);
    expect(urlsOf(provider)[0]).toContain("latitude=42.7000");
    expect(urlsOf(provider)[0]).toContain("longitude=2.9000");

    // Aucune ligne d'aucune table (schéma public) ne contient la position reçue.
    const tables = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect(tables.rows.length).toBeGreaterThan(50);
    for (const { table_name } of tables.rows) {
      for (const needle of needles) {
        const found = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from ${sql.identifier(table_name)} t where t::text like ${`%${needle}%`}`,
        );
        expect(found.rows[0]?.n, `${table_name} / ${needle}`).toBe(0);
      }
    }
    // Seule la case existe, sans compte ; rien n'a été écrit pour le compte.
    const cache = await db.select().from(weatherPlacesCache);
    expect(cache.map((c) => c.cell)).toEqual(["42.7,2.9"]);
    expect(Object.keys(cache[0] ?? {}).sort()).toEqual(["cell", "fetchedAt", "forecast", "provider"]);
    expect(await db.select().from(profileWeatherPlaces)).toEqual(placesBefore);
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, u.id));
    expect(profile?.departments).toEqual(["66"]);

    // Ni la réponse ni les journaux de la requête ne portent la position.
    for (const needle of needles) {
      expect(JSON.stringify(res.json), needle).not.toContain(needle);
      expect(logs.join("\n"), needle).not.toContain(needle);
    }
  });

  it("une erreur de validation ne répète pas la position", async () => {
    const u = await fan("Fan_Valid");
    const res = await call(u, "POST", "/weather/at", { lat: 51.504937, lng: -0.1195 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).not.toContain("51.504937");
    expect(JSON.stringify(res.json)).not.toContain("0.1195");
  });

  it("session requise ; hors de France, champ manquant ou en trop : 400 ; la position n'est pas dans l'adresse", async () => {
    expect((await call(null, "POST", "/weather/at", exact)).status).toBe(401);
    const u = await fan("Fan_Borne");
    expect((await call(u, "POST", "/weather/at", { lat: 51.5, lng: -0.12 })).status).toBe(400);
    expect((await call(u, "POST", "/weather/at", { lat: 42.7 })).status).toBe(400);
    expect((await call(u, "POST", "/weather/at", { ...exact, userId: "x" })).status).toBe(400);
    // L'ancien tracé du plan (GET avec la position dans l'adresse) n'existe pas.
    expect((await call(u, "GET", "/weather/at?lat=42.7&lng=2.9")).status).toBe(404);
  });

  it("commune introuvable ou géocodeur muet : « Ma position » ; fournisseur en panne : météo null", async () => {
    setGeocodeFetch(geocoderStub(null) as unknown as typeof fetch);
    setWeatherFetch(providerStub(() => ({}), 500) as unknown as typeof fetch);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const u = await fan("Fan_Muet");
    const res = await call(u, "POST", "/weather/at", exact);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ label: "Ma position", weather: null });
  });
});

describe("cache des cases de 0,1°", () => {
  const exact = { lat: 42.7049, lng: 2.8954 };

  it("deux demandes dans la même case : un seul appel ; après 3 h : un nouvel appel", async () => {
    const f = providerStub();
    setWeatherFetch(f as unknown as typeof fetch);
    setGeocodeFetch(geocoderStub() as unknown as typeof fetch);
    const u = await fan("Fan_Cache");
    await call(u, "POST", "/weather/at", exact);
    // Une position voisine, même case.
    await call(u, "POST", "/weather/at", { lat: 42.7449, lng: 2.8501 });
    // La préfecture par défaut de Perpignan tombe dans la même case.
    await call(u, "GET", "/me/weather/places");
    expect(f).toHaveBeenCalledTimes(1);
    clock.advance(3 * HOUR - 1);
    await call(u, "GET", "/me/weather/places");
    expect(f).toHaveBeenCalledTimes(1);
    clock.advance(2);
    await call(u, "GET", "/me/weather/places");
    expect(f).toHaveBeenCalledTimes(2);
    // Une autre case : un autre appel.
    await call(u, "POST", "/weather/at", { lat: 43.6, lng: 1.44 });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("des demandes simultanées pour la même case : un seul appel", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = vi.fn(async () => {
      await gate;
      return Response.json(omBody());
    });
    setWeatherFetch(f as unknown as typeof fetch);
    setGeocodeFetch(geocoderStub() as unknown as typeof fetch);
    const users = await Promise.all([fan("Fan_S1"), fan("Fan_S2"), fan("Fan_S3")]);
    const pending = [
      ...users.map((u) => call(u, "GET", "/me/weather/places")),
      ...users.map((u) => call(u, "POST", "/weather/at", exact)),
    ];
    // Laisse toutes les demandes arriver au fournisseur avant de le libérer.
    await new Promise((r) => setTimeout(r, 400));
    release();
    const all = await Promise.all(pending);
    for (const r of all) expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("GET /geo/cities", () => {
  it("session requise ; un caractère ou plus de 80 : 400", async () => {
    expect((await call(null, "GET", "/geo/cities?q=Arg")).status).toBe(401);
    const u = await fan("Fan_Villes");
    expect((await call(u, "GET", "/geo/cities?q=A")).status).toBe(400);
    expect((await call(u, "GET", "/geo/cities?q=%20A%20")).status).toBe(400);
    expect((await call(u, "GET", "/geo/cities")).status).toBe(400);
    expect((await call(u, "GET", `/geo/cities?q=${"x".repeat(81)}`)).status).toBe(400);
  });

  it("huit communes au plus, « Nom (département) », arrondies à 0,01°, hors de France écartées", async () => {
    const geocoder = geocoderStub();
    setGeocodeFetch(geocoder as unknown as typeof fetch);
    const u = await fan("Fan_Villes2");
    const res = await call(u, "GET", "/geo/cities?q=Argel%C3%A8s");
    expect(res.status).toBe(200);
    expect(res.json.cities).toEqual([
      { label: "Argelès-sur-Mer (66)", lat: 42.55, lng: 3.03 },
      { label: "Argelès-Gazost (65)", lat: 43.01, lng: -0.09 },
    ]);
    expect(String(geocoder.mock.calls[0]?.[0])).toContain("type=municipality");
    expect(String(geocoder.mock.calls[0]?.[0])).toContain("limit=8");
  });

  it("géocodeur muet : aucune proposition, jamais d'erreur", async () => {
    setGeocodeFetch((async () => new Response("x", { status: 500 })) as unknown as typeof fetch);
    const u = await fan("Fan_Villes3");
    const res = await call(u, "GET", "/geo/cities?q=Perp");
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ cities: [] });
  });

  it("limite de débit", async () => {
    setGeocodeFetch(geocoderStub() as unknown as typeof fetch);
    const u = await fan("Fan_Limite");
    let last = 200;
    for (let i = 0; i < 125 && last !== 429; i++) {
      last = (await call(u, "GET", "/geo/cities?q=Arg")).status;
    }
    expect(last).toBe(429);
  });
});

describe("GET /me/home : myWeather", () => {
  it("les lieux, lus du cache ; le champ weather et GET /me/weather gardent leur forme", async () => {
    const f = providerStub();
    setWeatherFetch(f as unknown as typeof fetch);
    const u = await fan("Fan_Home");
    // Le cache d'abord (la route des lieux et celle du département) : l'Accueil ne lit que le stock.
    await call(u, "GET", "/me/weather/places");
    await call(u, "GET", "/me/weather");
    expect(f).toHaveBeenCalledTimes(2);
    const home = await call(u, "GET", "/me/home?persona=visitor");
    expect(home.status).toBe(200);
    expect(home.json.myWeather.max).toBe(2);
    expect(home.json.myWeather.places[0]).toMatchObject({ label: "Perpignan", source: "default" });
    expect(home.json.myWeather.places[0].weather.now.temp).toBe(21);
    // L'ancien champ garde sa forme (APK en ligne).
    expect(home.json.weather).toMatchObject({ kind: "place", department: "66", attribution: "Météo : Open-Meteo" });
    expect(Object.keys(home.json.weather).sort()).toEqual(["attribution", "department", "kind", "provider", "summary"]);
    const mine = await call(u, "GET", "/me/weather");
    expect(mine.json).toMatchObject({ kind: "place", department: "66" });
    expect(Object.keys(mine.json).sort()).toEqual(["attribution", "department", "kind", "provider", "summary"]);
  });

  it("l'Accueil n'attend pas le fournisseur : case absente, météo null, le rafraîchissement part tout seul", async () => {
    const f = providerStub();
    setWeatherFetch(f as unknown as typeof fetch);
    const u = await fan("Fan_HomeStock");
    const home = await call(u, "GET", "/me/home?persona=visitor");
    expect(home.json.myWeather.places[0]).toMatchObject({ label: "Perpignan", weather: null });
    await vi.waitFor(() => expect(f.mock.calls.length).toBeGreaterThanOrEqual(1));
    await vi.waitFor(async () => expect(await db.select().from(weatherPlacesCache)).toHaveLength(1));
  });

  it("bloc masqué : myWeather null et rien n'est calculé", async () => {
    const f = providerStub();
    setWeatherFetch(f as unknown as typeof fetch);
    const spy = vi.spyOn(weatherService, "places");
    const u = await fan("Fan_HomeMasque");
    await db
      .update(profiles)
      .set({ homeWidgets: { order: [], hidden: ["weather"] } })
      .where(eq(profiles.userId, u.id));
    const home = await call(u, "GET", "/me/home?persona=visitor");
    expect(home.status).toBe(200);
    expect(home.json.myWeather).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it("fournisseur en panne : l'Accueil répond, sans erreur", async () => {
    setWeatherFetch(providerStub(() => ({}), 500) as unknown as typeof fetch);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const u = await fan("Fan_HomePanne");
    const home = await call(u, "GET", "/me/home?persona=visitor");
    expect(home.status).toBe(200);
    expect(home.json.myWeather.places[0].weather).toBeNull();
  });
});

describe("tâche weather.refresh : les cases des lieux", () => {
  it("une case = un appel pour tous les comptes ; purge des cases oubliées depuis 7 jours", async () => {
    const f = providerStub();
    setWeatherFetch(f as unknown as typeof fetch);
    const a = await fan("Fan_T1"); // Perpignan par défaut
    await fan("Fan_T2"); // idem
    const c = await fan("Fan_T3", ["31"]); // Toulouse par défaut
    await fan("Fan_T4", []); // rien
    await call(c, "PUT", "/me/weather/places", { places: [argeles] }); // remplace Toulouse par Argelès
    await db.insert(weatherPlacesCache).values({
      cell: "10.0,10.0",
      provider: "open-meteo",
      fetchedAt: new Date(NOW.getTime() - 8 * 24 * HOUR),
      forecast: { days: [], hours: [] },
    });
    // Enregistrer un lieu en montre déjà la météo : Argelès est en cache, Toulouse n'est plus voulue.
    expect(f).toHaveBeenCalledTimes(1);
    const result = await weatherService.refreshPlaces();
    // Reste Perpignan (2 comptes, 1 case) : 1 appel, pas 2.
    expect(result.cells).toBe(1);
    expect(f).toHaveBeenCalledTimes(2);
    const cells = (await db.select().from(weatherPlacesCache)).map((r) => r.cell).sort();
    expect(cells).toEqual([weatherCell(argeles).key, weatherCell(perpignan).key].sort());
    // Un second passage tout de suite : rien à refaire (cases fraîches).
    expect((await weatherService.refreshPlaces()).cells).toBe(0);
    expect(f).toHaveBeenCalledTimes(2);
    // La lecture suivante ne rappelle pas le fournisseur.
    await call(a, "GET", "/me/weather/places");
    expect(f).toHaveBeenCalledTimes(2);
    // 3 h plus tard : les deux cases sont rafraîchies.
    clock.advance(3 * HOUR);
    expect((await weatherService.refreshPlaces()).cells).toBe(2);
  });

  it("weather.refresh complet : un fournisseur en panne ne casse pas la météo des événements", async () => {
    setWeatherFetch(providerStub(() => ({}), 500) as unknown as typeof fetch);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await fan("Fan_R1");
    await expect(weatherService.refresh()).resolves.toEqual({ refreshed: 0, suggested: 0 });
  });
});

describe("fournisseur : ressenti, rafales, direction", () => {
  it("la requête horaire les demande ; absents de la réponse, ils restent absents", async () => {
    const f = providerStub();
    setWeatherFetch(f as unknown as typeof fetch);
    const u = await fan("Fan_Req");
    await call(u, "GET", "/me/weather/places");
    const hourly = new URL(urlsOf(f)[0] ?? "").searchParams.get("hourly") ?? "";
    for (const k of ["apparent_temperature", "wind_gusts_10m", "wind_direction_10m"]) expect(hourly).toContain(k);

    // Réponse sans ces trois séries (autre fournisseur, ou ancienne forme) : les champs n'existent pas.
    const body = omBody();
    // biome-ignore lint/suspicious/noExplicitAny: retrait de séries d'une réponse synthétique
    const h = body.hourly as any;
    delete h.apparent_temperature;
    delete h.wind_gusts_10m;
    delete h.wind_direction_10m;
    await db.delete(weatherPlacesCache);
    setWeatherFetch(providerStub(() => body) as unknown as typeof fetch);
    const res = await call(u, "GET", "/me/weather/places");
    expect(Object.keys(res.json.places[0].weather.now).sort()).toEqual([
      "code",
      "precipitationMm",
      "precipitationProbability",
      "temp",
      "time",
      "windKmh",
    ]);
  });
});
