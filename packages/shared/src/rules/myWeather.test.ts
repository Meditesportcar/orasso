import { describe, expect, it } from "vitest";

import type { DailyForecast, HourlyForecast } from "../weather";
import {
  citySearchQuery,
  currentHour,
  inFrance,
  myWeatherPlaces,
  nextHours,
  placeForecast,
  placesAfterAdd,
  placesAfterChange,
  placesAfterRemove,
  roundPlace,
  trimForecast,
  WEATHER_PLACES_MAX,
  weatherAtInput,
  weatherCards,
  weatherCell,
  weatherPlacesInput,
  windCompass,
} from "./myWeather";

const HOUR = 3_600_000;
const NOW = new Date("2026-11-11T13:20:00Z");
const hour = (offset: number, temp = 14): HourlyForecast => ({
  time: new Date(Math.floor(NOW.getTime() / HOUR) * HOUR + offset * HOUR).toISOString(),
  temp,
  precipitationProbability: 5,
  precipitationMm: 0,
  windKmh: 18,
  code: "clear",
});
const day = (date: string): DailyForecast => ({
  date,
  tempMin: 8,
  tempMax: 16,
  precipitationProbability: 5,
  precipitationMm: 0,
  windMaxKmh: 22,
  code: "clear",
});

describe("weatherCell", () => {
  it("arrondit à 0,1° et donne une clé stable", () => {
    expect(weatherCell({ lat: 42.7049, lng: 2.8954 })).toEqual({ lat: 42.7, lng: 2.9, key: "42.7,2.9" });
    expect(weatherCell({ lat: 42.7449, lng: 2.8501 }).key).toBe("42.7,2.9");
  });
  it("jamais de -0", () => {
    expect(weatherCell({ lat: -0.04, lng: -0.01 }).key).toBe("0.0,0.0");
  });
  it("la position exacte ne ressort pas de la case", () => {
    const a = weatherCell({ lat: 42.70123, lng: 2.90456 });
    expect(JSON.stringify(a)).not.toContain("42.70123");
    expect(JSON.stringify(a)).not.toContain("2.90456");
  });
});

describe("roundPlace, inFrance", () => {
  it("arrondit un lieu choisi à 0,01°", () => {
    expect(roundPlace({ lat: 42.5703, lng: 3.0346 })).toEqual({ lat: 42.57, lng: 3.03 });
  });
  it("France, Corse, outre-mer : oui ; ailleurs : non", () => {
    expect(inFrance({ lat: 42.7, lng: 2.9 })).toBe(true);
    expect(inFrance({ lat: 41.92, lng: 8.74 })).toBe(true);
    expect(inFrance({ lat: -20.88, lng: 55.45 })).toBe(true);
    expect(inFrance({ lat: 4.94, lng: -52.33 })).toBe(true);
    expect(inFrance({ lat: 51.5, lng: -0.12 })).toBe(false);
    expect(inFrance({ lat: 40.4, lng: -3.7 })).toBe(false);
    expect(inFrance({ lat: 0, lng: 0 })).toBe(false);
  });
});

describe("myWeatherPlaces", () => {
  const saved = [
    { slot: 1, label: "Argelès-sur-Mer", lat: 42.55, lng: 3.02 },
    { slot: 0, label: "Perpignan", lat: 42.7, lng: 2.9 },
  ];
  it("les lieux choisis, dans l'ordre des emplacements", () => {
    const places = myWeatherPlaces({ saved, departments: ["66"] });
    expect(places.map((p) => p.label)).toEqual(["Perpignan", "Argelès-sur-Mer"]);
    expect(places.every((p) => p.source === "saved")).toBe(true);
  });
  it("jamais plus de deux", () => {
    const three = [...saved, { slot: 2, label: "X", lat: 43, lng: 2 }];
    expect(myWeatherPlaces({ saved: three, departments: [] })).toHaveLength(WEATHER_PLACES_MAX);
  });
  it("sans lieu choisi : la préfecture du premier département (T10)", () => {
    expect(myWeatherPlaces({ saved: [], departments: ["66", "11"] })).toEqual([
      { slot: 0, label: "Perpignan", lat: 42.7, lng: 2.9, source: "default" },
    ]);
  });
  it("sans lieu ni département : aucun", () => {
    expect(myWeatherPlaces({ saved: [], departments: [] })).toEqual([]);
    expect(myWeatherPlaces({ saved: [], departments: ["99"] })).toEqual([]);
  });
});

describe("heures", () => {
  const hours = Array.from({ length: 12 }, (_, i) => hour(i - 2, 10 + i));
  it("l'heure en cours est celle qui contient now", () => {
    expect(currentHour(hours, NOW)?.temp).toBe(12);
    expect(currentHour(hours.slice(4), NOW)).toBeNull();
  });
  it("six heures après l'heure en cours", () => {
    const next = nextHours(hours, NOW, 6);
    expect(next).toHaveLength(6);
    expect(next[0]?.time).toBe(hour(1).time);
    expect(next[5]?.time).toBe(hour(6).time);
  });
  it("s'arrête au premier trou", () => {
    const holey = hours.filter((_, i) => i !== 5);
    expect(nextHours(holey, NOW, 6)).toHaveLength(2);
  });
  it("placeForecast : aujourd'hui (Paris) + heure en cours + six heures ; sinon null", () => {
    const stored = { days: [day("2026-11-11")], hours };
    const p = placeForecast(stored, NOW);
    expect(p?.today.date).toBe("2026-11-11");
    expect(p?.hours).toHaveLength(6);
    expect(placeForecast({ days: [day("2026-11-10")], hours }, NOW)).toBeNull();
    expect(placeForecast({ days: [day("2026-11-11")], hours: [] }, NOW)).toBeNull();
  });
  it("trimForecast garde 48 heures à partir de l'heure d'avant", () => {
    const many = Array.from({ length: 100 }, (_, i) => hour(i - 5));
    const t = trimForecast([day("2026-11-11")], many, NOW);
    expect(t.hours).toHaveLength(48);
    expect(t.hours[0]?.time).toBe(hour(-1).time);
  });
});

describe("entrées", () => {
  const p = { label: "Perpignan", lat: 42.7, lng: 2.9 };
  it("PUT : 0 à 2 lieux, trois lieux refusés", () => {
    expect(weatherPlacesInput.safeParse({ places: [] }).success).toBe(true);
    expect(weatherPlacesInput.safeParse({ places: [p, p] }).success).toBe(true);
    expect(weatherPlacesInput.safeParse({ places: [p, p, p] }).success).toBe(false);
  });
  it("PUT : hors de France, libellé vide ou trop long, champ en trop : refusés", () => {
    expect(weatherPlacesInput.safeParse({ places: [{ label: "Londres", lat: 51.5, lng: -0.12 }] }).success).toBe(false);
    expect(weatherPlacesInput.safeParse({ places: [{ ...p, label: " " }] }).success).toBe(false);
    expect(weatherPlacesInput.safeParse({ places: [{ ...p, label: "x".repeat(81) }] }).success).toBe(false);
    expect(weatherPlacesInput.safeParse({ places: [{ ...p, extra: 1 }] }).success).toBe(false);
    expect(weatherPlacesInput.safeParse({ places: [{ ...p, lat: Number.NaN }] }).success).toBe(false);
  });
  it("POST /weather/at : une position en France", () => {
    expect(weatherAtInput.safeParse({ lat: 42.7049, lng: 2.8954 }).success).toBe(true);
    expect(weatherAtInput.safeParse({ lat: 91, lng: 2.8954 }).success).toBe(false);
    expect(weatherAtInput.safeParse({ lat: 51.5, lng: -0.12 }).success).toBe(false);
  });
  it("recherche de ville : 2 caractères au moins, 80 au plus", () => {
    expect(citySearchQuery.safeParse({ q: "a" }).success).toBe(false);
    expect(citySearchQuery.safeParse({ q: " a " }).success).toBe(false);
    expect(citySearchQuery.safeParse({ q: "Ar" }).success).toBe(true);
    expect(citySearchQuery.safeParse({ q: "x".repeat(81) }).success).toBe(false);
  });
});

describe("windCompass", () => {
  it("points cardinaux", () => {
    expect(windCompass(0)).toBe("N");
    expect(windCompass(315)).toBe("NO");
    expect(windCompass(180)).toBe("S");
    expect(windCompass(359)).toBe("N");
    expect(windCompass(-45)).toBe("NO");
  });
});

describe("cartes et modifications des lieux", () => {
  const w = (label: string) =>
    ({
      today: day("2026-11-11"),
      now: hour(0),
      hours: [],
      provider: "open-meteo",
      attribution: label,
      fetchedAt: "x",
    }) as never;
  const city = { slot: 0, label: "Perpignan", lat: 42.7, lng: 2.9, source: "default" as const, weather: w("p") };
  const s0 = { slot: 0, label: "Perpignan", lat: 42.7, lng: 2.9, source: "saved" as const, weather: w("a") };
  const s1 = { slot: 1, label: "Argelès-sur-Mer", lat: 42.55, lng: 3.03, source: "saved" as const, weather: w("b") };
  const here = { label: "Canet-en-Roussillon", weather: w("c") };

  it("sans position : une carte par lieu, « ta ville » pour la ville par défaut", () => {
    expect(weatherCards([city], null).map((c) => [c.kind, c.slot, c.label])).toEqual([["city", null, "Perpignan"]]);
    expect(weatherCards([s0, s1], null).map((c) => [c.kind, c.slot])).toEqual([
      ["saved", 0],
      ["saved", 1],
    ]);
    expect(weatherCards([], null)).toEqual([]);
  });
  it("la position prend la place du premier lieu, le second reste", () => {
    expect(weatherCards([city], here).map((c) => [c.kind, c.label])).toEqual([["position", "Canet-en-Roussillon"]]);
    expect(weatherCards([s0, s1], here).map((c) => [c.kind, c.label])).toEqual([
      ["position", "Canet-en-Roussillon"],
      ["saved", "Argelès-sur-Mer"],
    ]);
    expect(weatherCards([], here)).toHaveLength(1);
  });
  const lyon = { label: "Lyon", lat: 45.76, lng: 4.84 };
  it("Changer de lieu : la ville remplace la carte ; la ville par défaut devient le premier emplacement", () => {
    expect(placesAfterChange([city], { slot: null }, lyon)).toEqual([lyon]);
    expect(placesAfterChange([s0, s1], { slot: 1 }, lyon)).toEqual([{ label: "Perpignan", lat: 42.7, lng: 2.9 }, lyon]);
    expect(placesAfterChange([s0, s1], { slot: null }, lyon)).toEqual([
      lyon,
      { label: "Argelès-sur-Mer", lat: 42.55, lng: 3.03 },
    ]);
  });
  it("Second lieu : après la ville par défaut (enregistrée avec lui), après un lieu choisi, rien au-delà de deux", () => {
    expect(placesAfterAdd([city], lyon)).toEqual([{ label: "Perpignan", lat: 42.7, lng: 2.9 }, lyon]);
    expect(placesAfterAdd([s0], lyon)).toEqual([{ label: "Perpignan", lat: 42.7, lng: 2.9 }, lyon]);
    expect(placesAfterAdd([], lyon)).toEqual([lyon]);
    expect(placesAfterAdd([s0, s1], lyon)).toHaveLength(2);
  });
  it("sans département : position, puis Second lieu : la ville s'affiche à côté, la position n'est pas enregistrée", () => {
    const afterAdd = placesAfterAdd([], lyon);
    expect(afterAdd).toEqual([lyon]);
    const saved = [{ slot: 0, ...lyon, source: "saved" as const, weather: w("l") }];
    expect(weatherCards(saved, here).map((c) => [c.kind, c.label])).toEqual([
      ["position", "Canet-en-Roussillon"],
      ["saved", "Lyon"],
    ]);
    // Changer de lieu sur la carte de la position : la ville la remplace, Lyon reste le second.
    const toulouse = { label: "Toulouse", lat: 43.6, lng: 1.44 };
    expect(placesAfterChange(saved, { slot: null, kind: "position" }, toulouse)).toEqual([toulouse, lyon]);
    // Deux lieux choisis : la position prend la place du premier, le second reste.
    expect(weatherCards([s0, s1], here).map((c) => c.label)).toEqual(["Canet-en-Roussillon", "Argelès-sur-Mer"]);
  });
  it("Retirer ce lieu : les autres restent", () => {
    expect(placesAfterRemove([s0, s1], 0)).toEqual([{ label: "Argelès-sur-Mer", lat: 42.55, lng: 3.03 }]);
    expect(placesAfterRemove([s0], 0)).toEqual([]);
  });
});
