import { afterEach, describe, expect, it } from "vitest";

import { displayNow, localDateYearToShow, rangeYears, setDisplayClock, withYear, yearToShow } from "./dateYear";
import { formatDayDate } from "./eventDays";
import { dayLabel } from "./explore";
import { posterDate } from "./poster";
import { fromWallTime } from "./time";

// Instants construits depuis l'heure de Paris, relatifs à une année de référence tirée de l'heure courante : aucun
// test ne dépend de la date du jour.
const Y = new Date().getUTCFullYear();
const paris = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  fromWallTime({ year, month, day, hour, minute });
const NOW = paris(Y, 6, 15);

describe("année des dates affichées (lot R3b)", () => {
  afterEach(() => setDisplayClock(() => new Date()));

  it("année en cours : pas d'année", () => {
    expect(yearToShow(paris(Y, 10, 17), NOW)).toBeNull();
    expect(withYear("17 oct.", paris(Y, 10, 17), NOW)).toBe("17 oct.");
  });

  it("année suivante (et précédente) : l'année", () => {
    expect(yearToShow(paris(Y + 1, 10, 17), NOW)).toBe(Y + 1);
    expect(withYear("17 oct.", paris(Y + 1, 10, 17), NOW)).toBe(`17 oct. ${Y + 1}`);
    expect(yearToShow(paris(Y - 1, 10, 17), NOW)).toBe(Y - 1);
  });

  it("1er janvier : l'année se lit à l'heure de Paris, pas en UTC", () => {
    // 1er janvier 00 h 30 à Paris = 31 décembre 23 h 30 UTC.
    const newYear = paris(Y + 1, 1, 1, 0, 30);
    expect(newYear.getUTCFullYear()).toBe(Y);
    expect(yearToShow(newYear, NOW)).toBe(Y + 1);
    // Le 1er janvier lui-même, l'année nouvelle est l'année en cours.
    expect(yearToShow(newYear, paris(Y + 1, 1, 1, 0, 5))).toBeNull();
    // Le 31 décembre à 23 h 50, le lendemain est déjà l'an prochain.
    expect(yearToShow(newYear, paris(Y, 12, 31, 23, 50))).toBe(Y + 1);
  });

  it("à cheval sur deux années : les deux années", () => {
    expect(rangeYears(paris(Y, 12, 31, 20), paris(Y + 1, 1, 2, 2), NOW)).toEqual({ start: Y, end: Y + 1 });
    expect(rangeYears(paris(Y, 10, 17), paris(Y, 10, 18), NOW)).toEqual({ start: null, end: null });
    expect(rangeYears(paris(Y + 1, 10, 17), paris(Y + 1, 10, 18), NOW)).toEqual({ start: Y + 1, end: Y + 1 });
  });

  it("l'horloge posée par l'application (horloge simulée) décide par défaut", () => {
    const at = paris(Y + 1, 3, 2);
    setDisplayClock(() => NOW);
    expect(displayNow()).toBe(NOW);
    expect(yearToShow(at)).toBe(Y + 1);
    setDisplayClock(() => paris(Y + 1, 1, 10));
    expect(yearToShow(at)).toBeNull();
  });

  it("dates locales des jours d'un événement", () => {
    expect(localDateYearToShow(`${Y}-03-14`, NOW)).toBeNull();
    expect(localDateYearToShow(`${Y + 1}-03-14`, NOW)).toBe(Y + 1);
    expect(formatDayDate(`${Y + 1}-03-14`, { now: NOW })).toContain(String(Y + 1));
    expect(formatDayDate(`${Y}-03-14`, { now: NOW })).not.toContain(String(Y));
  });

  it("frise et épingles de la carte, souche de l'affiche", () => {
    expect(dayLabel(paris(Y + 1, 10, 17), NOW)).toMatch(new RegExp(` ${Y + 1}$`));
    expect(dayLabel(paris(Y, 10, 17), NOW)).not.toContain(String(Y));
    expect(posterDate(paris(Y + 1, 10, 17), undefined, NOW).year).toBe(String(Y + 1));
    expect(posterDate(paris(Y, 10, 17), undefined, NOW).year).toBe("");
  });
});
