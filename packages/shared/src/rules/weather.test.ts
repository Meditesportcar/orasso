import { describe, expect, it } from "vitest";

import type { DailyForecast, HourlyForecast, StoredForecast } from "../weather";
import {
  describeWeather,
  eventDates,
  forecastForEvent,
  isBadWeather,
  shouldSuggestUncertain,
  weatherVisible,
  worstWeatherCode,
} from "./weather";

const day = (over: Partial<DailyForecast> = {}): DailyForecast => ({
  date: "2026-10-18",
  tempMin: 14,
  tempMax: 21,
  precipitationProbability: 10,
  precipitationMm: 0,
  windMaxKmh: 15,
  code: "clear",
  ...over,
});

const hour = (iso: string, over: Partial<HourlyForecast> = {}): HourlyForecast => ({
  time: iso,
  temp: 18,
  precipitationProbability: 10,
  precipitationMm: 0,
  windKmh: 10,
  code: "clear",
  ...over,
});

describe("isBadWeather (S33)", () => {
  it("pluie ≥ 60 %, ≥ 5 mm ou vent ≥ 60 km/h aux seuils exacts", () => {
    expect(isBadWeather(day())).toBe(false);
    expect(isBadWeather(day({ precipitationProbability: 59 }))).toBe(false);
    expect(isBadWeather(day({ precipitationProbability: 60 }))).toBe(true);
    expect(isBadWeather(day({ precipitationMm: 4.9 }))).toBe(false);
    expect(isBadWeather(day({ precipitationMm: 5 }))).toBe(true);
    expect(isBadWeather(day({ windMaxKmh: 59.9 }))).toBe(false);
    expect(isBadWeather(day({ windMaxKmh: 60 }))).toBe(true);
  });

  it("probabilité inconnue (MET Norway) : seuls la pluie en mm et le vent comptent", () => {
    expect(isBadWeather(day({ precipitationProbability: null }))).toBe(false);
    expect(isBadWeather(day({ precipitationProbability: null, precipitationMm: 8 }))).toBe(true);
  });
});

describe("describeWeather", () => {
  it("températures, averses probables avec leur pourcentage", () => {
    expect(describeWeather(day({ code: "rain", precipitationProbability: 70 }))).toBe(
      "14–21 °C, averses probables (70 %)",
    );
  });
  it("sans pourcentage : pluie en mm ; ciel dégagé ; vent ; températures égales", () => {
    expect(describeWeather(day({ code: "rain", precipitationProbability: null, precipitationMm: 3.2 }))).toBe(
      "14–21 °C, averses (3,2 mm)",
    );
    expect(describeWeather(day())).toBe("14–21 °C, ciel dégagé");
    expect(describeWeather(day({ windMaxKmh: 52 }))).toBe("14–21 °C, ciel dégagé, vent jusqu'à 52 km/h");
    expect(describeWeather(day({ tempMin: 20.4, tempMax: 19.6, code: "cloudy" }))).toBe("20 °C, ciel couvert");
  });
});

describe("forecastForEvent", () => {
  const forecast: StoredForecast = {
    days: [
      day({ date: "2026-10-17", code: "clear" }),
      day({ date: "2026-10-18", code: "rain", precipitationProbability: 80, precipitationMm: 6 }),
      day({ date: "2026-10-19", code: "cloudy" }),
    ],
    hours: [
      hour("2026-10-17T18:00:00.000Z", { temp: 17 }),
      hour("2026-10-17T19:00:00.000Z", { temp: 15, code: "rain", precipitationProbability: 75, precipitationMm: 2 }),
      hour("2026-10-17T20:00:00.000Z", { temp: 14, windKmh: 30 }),
      hour("2026-10-17T22:00:00.000Z", { temp: 9 }),
    ],
  };

  it("utilise les heures de l'événement quand on les a (nocturne 20 h – 23 h en heure de Paris)", () => {
    const summary = forecastForEvent(forecast, {
      startsAt: new Date("2026-10-17T18:00:00Z"),
      endsAt: new Date("2026-10-17T21:00:00Z"),
    });
    expect(summary).toMatchObject({
      date: "2026-10-17",
      tempMin: 14,
      tempMax: 17,
      precipitationProbability: 75,
      precipitationMm: 2,
      windMaxKmh: 30,
      code: "rain",
    });
  });

  it("à défaut d'heures : les jours couverts, pire condition, pluie cumulée", () => {
    const summary = forecastForEvent(
      { days: forecast.days, hours: [] },
      { startsAt: new Date("2026-10-18T07:00:00Z"), endsAt: new Date("2026-10-19T15:00:00Z") },
    );
    expect(summary).toMatchObject({
      date: "2026-10-18",
      precipitationMm: 6,
      precipitationProbability: 80,
      code: "rain",
    });
  });

  it("événement hors de la prévision : null", () => {
    expect(
      forecastForEvent(forecast, {
        startsAt: new Date("2026-11-20T07:00:00Z"),
        endsAt: new Date("2026-11-20T15:00:00Z"),
      }),
    ).toBeNull();
  });

  it("jours calendaires d'un événement qui passe minuit (heure de Paris)", () => {
    expect(
      eventDates({ startsAt: new Date("2026-10-17T20:00:00Z"), endsAt: new Date("2026-10-18T00:30:00Z") }),
    ).toEqual(["2026-10-17", "2026-10-18"]);
  });
});

describe("worstWeatherCode", () => {
  it("garde la pire condition", () => {
    expect(worstWeatherCode(["clear", "rain", "cloudy"])).toBe("rain");
    expect(worstWeatherCode(["rain", "thunderstorm"])).toBe("thunderstorm");
    expect(worstWeatherCode([])).toBe("clear");
  });
});

describe("shouldSuggestUncertain", () => {
  const base = {
    summary: day({ precipitationProbability: 80, code: "rain" as const }),
    outlook: "maintained" as const,
    startsAt: new Date("2026-10-18T08:00:00Z"),
    lastSuggestedAt: null,
    now: new Date("2026-10-16T08:00:00Z"),
  };
  it("mauvaise météo, maintenu, à 48 h : oui", () => {
    expect(shouldSuggestUncertain(base)).toBe(true);
  });
  it("seulement à 72 h ou moins du début", () => {
    expect(shouldSuggestUncertain({ ...base, startsAt: new Date("2026-10-19T08:00:00Z") })).toBe(true);
    expect(shouldSuggestUncertain({ ...base, startsAt: new Date("2026-10-19T08:01:00Z") })).toBe(false);
  });
  it("jamais une fois l'événement commencé", () => {
    expect(shouldSuggestUncertain({ ...base, startsAt: new Date("2026-10-16T07:00:00Z") })).toBe(false);
  });
  it("une fois par 24 h", () => {
    expect(shouldSuggestUncertain({ ...base, lastSuggestedAt: new Date("2026-10-15T08:01:00Z") })).toBe(false);
    expect(shouldSuggestUncertain({ ...base, lastSuggestedAt: new Date("2026-10-15T08:00:00Z") })).toBe(true);
  });
  it("jamais si déjà Incertain, météo correcte ou prévision absente", () => {
    expect(shouldSuggestUncertain({ ...base, outlook: "uncertain" })).toBe(false);
    expect(shouldSuggestUncertain({ ...base, summary: day() })).toBe(false);
    expect(shouldSuggestUncertain({ ...base, summary: null })).toBe(false);
  });
});

describe("weatherVisible", () => {
  const event = { startsAt: new Date("2026-10-23T08:00:00Z"), endsAt: new Date("2026-10-23T16:00:00Z") };
  it("dans les 7 jours avant le début, jusqu'à la fin", () => {
    expect(weatherVisible(event, new Date("2026-10-16T08:00:00Z"))).toBe(true);
    expect(weatherVisible(event, new Date("2026-10-16T07:59:00Z"))).toBe(false);
    expect(weatherVisible(event, new Date("2026-10-23T12:00:00Z"))).toBe(true);
    expect(weatherVisible(event, new Date("2026-10-23T16:00:00Z"))).toBe(false);
  });
});
