import { describe, expect, it } from "vitest";

import type { OutingWeather } from "../weather";
import { daysUntilDay, outingWeatherLine, weekdayOfDay } from "./outingWeather";

const w = (over: Partial<OutingWeather> = {}): OutingWeather => ({
  day: "2026-11-14",
  summary: {
    date: "2026-11-14",
    tempMin: 9,
    tempMax: 16.6,
    precipitationProbability: 5,
    precipitationMm: 0,
    windMaxKmh: 24.6,
    code: "clear",
  },
  provider: "open-meteo",
  attribution: "Météo : Open-Meteo",
  uncertain: false,
  ...over,
});
const NBSP = " ";

describe("ligne météo d'une carte de sortie (R8e1)", () => {
  it("compte les jours à la date de Paris", () => {
    expect(daysUntilDay("2026-11-14", new Date("2026-11-10T09:00:00Z"))).toBe(4);
    // 23 h 30 à Paris le 13 = 22 h 30 UTC : encore le 13.
    expect(daysUntilDay("2026-11-14", new Date("2026-11-13T22:30:00Z"))).toBe(1);
    expect(daysUntilDay("2026-11-14", new Date("2026-11-14T23:30:00Z"))).toBe(-1);
    expect(daysUntilDay("2026-11-14", new Date("2026-11-14T10:00:00Z"))).toBe(0);
  });

  it("jour de la semaine, majuscule ou non", () => {
    expect(weekdayOfDay("2026-11-14")).toBe("Samedi");
    expect(weekdayOfDay("2026-11-14", false)).toBe("samedi");
  });

  it("événement maintenu : jour, température et vent arrondis, ciel et fournisseur dessous", () => {
    const l = outingWeatherLine(w(), new Date("2026-11-10T09:00:00Z"));
    expect(l.lead).toBe("Samedi : ");
    expect(l.temp).toBe("17°");
    expect(l.tail).toBe(`, vent 25${NBSP}km/h`);
    expect(l.sub).toBe("Ciel dégagé · Open-Meteo");
    expect(l.aria).toBe(`Météo de samedi : ciel dégagé, 17 degrés, vent 25${NBSP}km/h`);
    expect(l.banner).toBeNull();
  });

  it("événement incertain : prévision peu sûre à N jours et bandeau", () => {
    const four = outingWeatherLine(w({ uncertain: true }), new Date("2026-11-10T09:00:00Z"));
    expect(four.sub).toBe(`Prévision peu sûre à 4 jours`);
    expect(four.banner).toBe("Météo incertaine : on la revérifie la veille et le matin.");
    expect(outingWeatherLine(w({ uncertain: true }), new Date("2026-11-13T09:00:00Z")).sub).toBe(
      "Prévision peu sûre à 1 jour",
    );
    // Le jour même (ou en cours) : on garde le libellé du temps ; le bandeau reste.
    const same = outingWeatherLine(w({ uncertain: true }), new Date("2026-11-14T09:00:00Z"));
    expect(same.sub).toBe("Ciel dégagé · Open-Meteo");
    expect(same.banner).not.toBeNull();
  });
});
