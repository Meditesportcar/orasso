import { describe, expect, it } from "vitest";
import { eventCountdown, eventCountdownParts, eventDayCount, eventPhase } from "./eventProgress";
import { fromWallTime } from "./time";

const at = (month: number, day: number, hour = 10, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

describe("repère de temps d'un événement : en cours, jour N sur M", () => {
  // Quatre jours, 9 h – 23 h, du 8 au 11 novembre (le Rassemblement du Lydia du seed).
  const span = { startsAt: at(11, 8, 9), endsAt: at(11, 11, 23) };

  it("la veille, le jour même avant l'ouverture", () => {
    expect(eventCountdown(span, at(11, 6, 12))).toBe("J-2");
    expect(eventCountdown(span, at(11, 7, 23))).toBe("Demain");
    expect(eventCountdown(span, at(11, 8, 7))).toBe("Aujourd'hui");
  });
  it("premier jour, jour du milieu, dernier jour : « En cours · jour N sur M »", () => {
    expect(eventCountdown(span, at(11, 8, 9))).toBe("En cours · jour 1 sur 4");
    expect(eventCountdown(span, at(11, 9, 0, 17))).toBe("En cours · jour 2 sur 4");
    expect(eventCountdown(span, at(11, 10, 15))).toBe("En cours · jour 3 sur 4");
    expect(eventCountdown(span, at(11, 11, 22, 59))).toBe("En cours · jour 4 sur 4");
  });
  it("fini : « J+1 » compté depuis la fin, jamais pour un événement en cours", () => {
    expect(eventCountdown(span, at(11, 11, 23))).toBe("Aujourd'hui");
    expect(eventCountdown(span, at(11, 12, 8))).toBe("J+1");
    expect(eventCountdown(span, at(11, 14, 8))).toBe("J+3");
    expect(eventCountdown(span, at(11, 9, 10))).not.toMatch(/J\+/);
  });
  it("un événement d'un seul jour : « En cours »", () => {
    const one = { startsAt: at(11, 8, 9), endsAt: at(11, 8, 18) };
    expect(eventCountdown(one, at(11, 8, 12))).toBe("En cours");
    expect(eventCountdown(one, at(11, 8, 19))).toBe("Aujourd'hui");
    expect(eventCountdown(one, at(11, 9, 12))).toBe("J+1");
  });
  it("un événement qui finit après minuit compte un seul jour, et reste en cours après minuit", () => {
    const night = { startsAt: at(11, 8, 20), endsAt: at(11, 9, 2) };
    expect(eventDayCount(night)).toBe(1);
    expect(eventCountdown(night, at(11, 8, 23))).toBe("En cours");
    expect(eventCountdown(night, at(11, 9, 1))).toBe("En cours");
    expect(eventPhase(night, at(11, 9, 1))).toEqual({ phase: "ongoing", day: 1, of: 1 });
    // Deux soirs de suite, chacun finissant à 2 h : deux jours.
    const two = { startsAt: at(11, 8, 20), endsAt: at(11, 10, 2) };
    expect(eventDayCount(two)).toBe(2);
    expect(eventCountdown(two, at(11, 10, 1))).toBe("En cours · jour 2 sur 2");
  });
  it("fuseau Europe/Paris : le jour change à minuit de Paris, pas à celui de UTC", () => {
    // 23 h 30 à Paris le 8 = 22 h 30 UTC ; 0 h 30 à Paris le 9 = 23 h 30 UTC le 8.
    expect(eventCountdown(span, new Date("2026-11-08T23:30:00Z"))).toBe("En cours · jour 2 sur 4");
    expect(eventCountdown(span, new Date("2026-11-08T22:30:00Z"))).toBe("En cours · jour 1 sur 4");
  });
  it("heure d'été / d'hiver : le changement d'heure du 25 octobre ne décale pas les jours", () => {
    const s = { startsAt: at(10, 24, 9), endsAt: at(10, 26, 20) };
    expect(eventDayCount(s)).toBe(3);
    expect(eventCountdown(s, at(10, 26, 10))).toBe("En cours · jour 3 sur 3");
  });
});

describe("repère découpé pour les pavés étroits", () => {
  const span = { startsAt: at(11, 8, 9), endsAt: at(11, 11, 23) };
  it("en cours sur plusieurs jours : « En cours » et « Jour 2 sur 4 »", () => {
    const p = eventCountdownParts(span, at(11, 9, 10));
    expect(p).toEqual({
      label: "En cours · jour 2 sur 4",
      lead: "En cours",
      detail: "Jour 2 sur 4",
      tight: { big: "2/4", small: "jour" },
    });
  });
  it("avant et après : le libellé seul", () => {
    expect(eventCountdownParts(span, at(11, 6)).tight).toEqual({ big: "J-2", small: null });
    expect(eventCountdownParts(span, at(11, 8, 7)).tight).toEqual({ big: "Auj.", small: null });
    expect(eventCountdownParts({ startsAt: at(11, 8, 9), endsAt: at(11, 8, 18) }, at(11, 8, 12))).toMatchObject({
      lead: "En cours",
      detail: null,
    });
  });
});
