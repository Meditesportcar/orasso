import { describe, expect, it } from "vitest";
import { applicationStatuses } from "../application";
import { transitionActors } from "../enums";
import { applicationTransitions, canTransition } from "./applicationTransitions";
import { isLocked, lockAt } from "./lock";
import { categoryAllowedForYear, gradeFor } from "./misc";
import { normalizePlate } from "./plateNumber";
import { deliverAfter } from "./quietHours";
import { canApply, registrationOpensAt } from "./registrationWindow";
import { fromWallTime, HOUR, MINUTE } from "./time";
import { computeOfferDeadline } from "./waitlistDeadline";

/** Instant à une heure de Paris. */
const paris = (month: number, day: number, hour: number, minute = 0, year = 2026) =>
  fromWallTime({ year, month, day, hour, minute });

// Événement le samedi 20 juin 2026, 18:00 (Paris), verrouillé à 16:00.
const event = { startsAt: paris(6, 20, 18), lockOffsetMinutes: 120 };

describe("computeOfferDeadline (liste d'attente, § 2.2)", () => {
  it("J−5 : 24 h pour répondre", () => {
    expect(computeOfferDeadline(event, paris(6, 15, 12))).toEqual(paris(6, 16, 12));
  });
  it("la veille à 10:00 : échéance 13:00", () => {
    expect(computeOfferDeadline(event, paris(6, 19, 10))).toEqual(paris(6, 19, 13));
  });
  it("jour J à 09:00 pour un début à 18:00 : échéance 11:00", () => {
    expect(computeOfferDeadline(event, paris(6, 20, 9))).toEqual(paris(6, 20, 11));
  });
  it("plafonnée au verrouillage", () => {
    expect(computeOfferDeadline(event, paris(6, 20, 15))).toEqual(paris(6, 20, 16));
  });
  it("aucune offre s'il reste moins de 30 min", () => {
    expect(computeOfferDeadline(event, paris(6, 20, 15, 45))).toBeNull();
    expect(computeOfferDeadline(event, paris(6, 20, 17))).toBeNull();
  });
  it("offre à 23:00 J−3 : le délai part de 08:00 (J−2), échéance J−1 08:00", () => {
    expect(computeOfferDeadline(event, paris(6, 17, 23))).toEqual(paris(6, 19, 8));
  });
  it("offre à 23:00 J−2 : le délai part de 08:00 la veille, donc 3 h", () => {
    expect(computeOfferDeadline(event, paris(6, 18, 23))).toEqual(paris(6, 19, 11));
  });
  it("offre à 02:00 la veille : départ 08:00, échéance 11:00", () => {
    expect(computeOfferDeadline(event, paris(6, 19, 2))).toEqual(paris(6, 19, 11));
  });
  it("la nuit du jour J, pas de décalage à 08:00", () => {
    expect(computeOfferDeadline(event, paris(6, 20, 1))).toEqual(paris(6, 20, 3));
  });
  it("la veille au soir d'un événement matinal : pas d'offre qui expirerait avant d'être notifiée", () => {
    // Début le jour J à 08:00, verrouillage 06:00 ; désistement la veille à 22:30 → notification à 08:00 seulement.
    const morning = { startsAt: paris(6, 20, 8), lockOffsetMinutes: 120 };
    expect(computeOfferDeadline(morning, paris(6, 19, 22, 30))).toBeNull();
  });
  it("tient compte du passage à l'heure d'hiver", () => {
    const autumn = { startsAt: paris(10, 30, 19), lockOffsetMinutes: 120 };
    // Offre le samedi 24 octobre 12:00 (été) → 24 h plus tard, 25 octobre 11:00 (hiver).
    const deadline = computeOfferDeadline(autumn, paris(10, 24, 12));
    expect(deadline?.getTime()).toBe(paris(10, 24, 12).getTime() + 24 * HOUR);
    expect(deadline).toEqual(paris(10, 25, 11));
  });
});

describe("verrouillage (§ 2.3)", () => {
  it("bascule exactement à début − délai", () => {
    expect(lockAt(event)).toEqual(paris(6, 20, 16));
    expect(isLocked(event, new Date(paris(6, 20, 16).getTime() - 1))).toBe(false);
    expect(isLocked(event, paris(6, 20, 16))).toBe(true);
  });
  it("délai réglable, y compris 0", () => {
    const e = { ...event, lockOffsetMinutes: 0 };
    expect(isLocked(e, paris(6, 20, 17, 59))).toBe(false);
    expect(isLocked(e, paris(6, 20, 18))).toBe(true);
  });
});

describe("avant-première (§ 2.4)", () => {
  const open = paris(6, 1, 12);
  const e = { ...event, status: "published" as const, registrationsOpenAt: open, previewHours: 24 };
  const at = (hours: number) => new Date(open.getTime() + hours * HOUR);

  it("abonné : refusé à H−25, accepté à H−23", () => {
    expect(canApply(e, true, at(-25))).toEqual({ ok: false, reason: "not_open" });
    expect(canApply(e, true, at(-23))).toEqual({ ok: true });
  });
  it("non abonné : refusé à H−23, accepté à H+0", () => {
    expect(canApply(e, false, at(-23))).toEqual({ ok: false, reason: "not_open" });
    expect(canApply(e, false, at(0))).toEqual({ ok: true });
  });
  it("sans avant-première", () => {
    expect(registrationOpensAt({ ...e, previewHours: 0 }, true)).toEqual(open);
  });
  it("refusé si brouillon ou verrouillé", () => {
    expect(canApply({ ...e, status: "draft" }, false, at(1))).toEqual({ ok: false, reason: "not_published" });
    expect(canApply(e, false, paris(6, 20, 16, 30))).toEqual({ ok: false, reason: "locked" });
  });
});

describe("transitions de candidature (§ 2.1)", () => {
  it("chaque transition déclarée est autorisée pour ses acteurs", () => {
    for (const [from, to, actors] of applicationTransitions) {
      for (const actor of actors) expect(canTransition(from, to, actor)).toBe(true);
    }
  });

  it("toute autre combinaison est interdite", () => {
    let forbidden = 0;
    for (const from of [null, ...applicationStatuses]) {
      for (const to of applicationStatuses) {
        for (const actor of transitionActors) {
          const declared = applicationTransitions.some(([f, t, a]) => f === from && t === to && a.includes(actor));
          if (!declared) {
            expect(canTransition(from, to, actor)).toBe(false);
            forbidden++;
          }
        }
      }
    }
    expect(forbidden).toBeGreaterThan(300);
  });

  it("exemples interdits", () => {
    expect(canTransition("pending", "accepted", "user")).toBe(false);
    expect(canTransition("accepted", "pending", "organizer")).toBe(false);
    expect(canTransition("pending", "offered", "system")).toBe(false);
    expect(canTransition("expired", "accepted", "user")).toBe(false);
    expect(canTransition("withdrawn", "accepted", "user")).toBe(false);
    expect(canTransition("refused", "withdrawn", "user")).toBe(false);
    expect(canTransition("cancelled", "accepted", "organizer")).toBe(false);
  });
});

describe("heures calmes", () => {
  it("la nuit hors jour J, envoi à 08:00", () => {
    expect(deliverAfter(paris(6, 15, 23), event.startsAt)).toEqual(paris(6, 16, 8));
    expect(deliverAfter(paris(6, 16, 3), event.startsAt)).toEqual(paris(6, 16, 8));
  });
  it("le jour J et en journée, tout de suite", () => {
    expect(deliverAfter(paris(6, 20, 23), event.startsAt)).toEqual(paris(6, 20, 23));
    expect(deliverAfter(paris(6, 15, 14), null)).toEqual(paris(6, 15, 14));
  });
});

describe("divers", () => {
  it("grades", () => {
    expect([0, 99, 100, 340, 400, 799, 800].map((p) => gradeFor(p))).toEqual([
      "rodage",
      "rodage",
      "route",
      "sport",
      "circuit",
      "circuit",
      "legende",
    ]);
  });
  it("plaque normalisée", () => {
    expect(normalizePlate(" ab-123 cd ")).toBe("AB123CD");
    expect(normalizePlate("AB 123 CD")).toBe(normalizePlate("ab-123-cd"));
  });
  it("âge minimal de catégorie", () => {
    const now = paris(10, 15, 12);
    expect(categoryAllowedForYear(20, 2006, now)).toBe(true);
    expect(categoryAllowedForYear(20, 2015, now)).toBe(false);
    expect(categoryAllowedForYear(null, null, now)).toBe(true);
    expect(categoryAllowedForYear(30, null, now)).toBe(false);
  });
  it("constantes de temps", () => {
    expect(HOUR).toBe(60 * MINUTE);
  });
});
