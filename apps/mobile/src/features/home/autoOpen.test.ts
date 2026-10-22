import { describe, expect, it } from "vitest";

import { autoOpenKey, isDayJ } from "./autoOpen";

// Week-end de trois jours, du vendredi 23 au dimanche 25 octobre 2026 (heure de Paris, UTC+2).
const weekend = { startsAt: "2026-10-23T07:00:00Z", endsAt: "2026-10-25T16:00:00Z" };

describe("ouverture d'office du QR le jour J", () => {
  it("toute la plage d'un événement sans jour choisi, en date de Paris", () => {
    expect(isDayJ(weekend, null, new Date("2026-10-22T21:59:00Z"))).toBe(false); // jeudi 23 h 59 à Paris
    expect(isDayJ(weekend, null, new Date("2026-10-22T22:00:00Z"))).toBe(true); // vendredi 0 h à Paris
    expect(isDayJ(weekend, null, new Date("2026-10-24T12:00:00Z"))).toBe(true);
    expect(isDayJ(weekend, null, new Date("2026-10-25T23:30:00Z"))).toBe(false); // lundi 0 h 30 (heure d'hiver)
  });

  it("le seul jour choisi d'un événement de plusieurs jours", () => {
    const sunday = { date: "2026-10-25" };
    expect(isDayJ(weekend, sunday, new Date("2026-10-23T10:00:00Z"))).toBe(false);
    expect(isDayJ(weekend, sunday, new Date("2026-10-25T10:00:00Z"))).toBe(true);
  });

  it("une clé par jour de Paris : pas de seconde ouverture à minuit UTC", () => {
    // 0 h 30 et 2 h 30 à Paris le 25 : le même jour (la date UTC, elle, changeait) ; 23 h 30 le 24 : un autre jour.
    expect(autoOpenKey("p", new Date("2026-10-24T22:30:00Z"))).toBe(autoOpenKey("p", new Date("2026-10-25T00:30:00Z")));
    expect(autoOpenKey("p", new Date("2026-10-24T21:30:00Z"))).not.toBe(
      autoOpenKey("p", new Date("2026-10-24T22:30:00Z")),
    );
  });
});
