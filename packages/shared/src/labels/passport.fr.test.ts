import { describe, expect, it } from "vitest";
import { audiencePrizeTexts, passportScreenTexts, recapTexts, wholeEventEntered } from "./passport.fr";

describe("libellés de présence sans genre", () => {
  it("décrit le pointage, l'arrivée et le récap sans genrer la personne", () => {
    expect(audiencePrizeTexts.checkedInAt(new Date("2026-10-17T17:02:00Z"), "Europe/Paris")).toBe("Pointage à 19 h 02");
    expect(recapTexts.arrived(new Date("2026-10-18T08:00:00Z"), "Europe/Paris")).toBe(
      "Arrivée dimanche à 10 h, automatiquement",
    );
    expect(passportScreenTexts.recapsNone).toBe(
      "Ton récap arrive le lendemain de chaque événement où tu as un pointage.",
    );
  });
});

describe("vote : jusqu'à quand", () => {
  const closes = new Date("2026-11-11T22:00:00Z");
  it("aujourd'hui : l'heure seule ; un autre jour : la date et l'heure (lot R7-0)", () => {
    expect(audiencePrizeTexts.openUntil(closes, new Date("2026-11-11T09:00:00Z"), "Europe/Paris")).toBe(
      "vote ouvert jusqu'à 23 h",
    );
    expect(audiencePrizeTexts.openUntil(closes, new Date("2026-11-09T09:00:00Z"), "Europe/Paris")).toBe(
      "vote ouvert jusqu'au mercredi 11 novembre, 23 h",
    );
  });
});

describe("vote : une fin à minuit pile (lot R7-0, tour 2)", () => {
  // Minuit pile à Paris, jeudi 12 novembre = mercredi 11 à 23 h UTC.
  const midnight = new Date("2026-11-11T23:00:00Z");
  it("le même jour : « jusqu'à minuit » ; un autre jour : le jour qui finit, pas le suivant", () => {
    expect(audiencePrizeTexts.openUntil(midnight, new Date("2026-11-11T09:00:00Z"), "Europe/Paris")).toBe(
      "vote ouvert jusqu'à minuit",
    );
    expect(audiencePrizeTexts.openUntil(midnight, new Date("2026-11-09T09:00:00Z"), "Europe/Paris")).toBe(
      "vote ouvert jusqu'au mercredi 11 novembre, minuit",
    );
  });
  it("une fin à 0 h 30 reste une heure ordinaire", () => {
    expect(
      audiencePrizeTexts.openUntil(new Date("2026-11-11T23:30:00Z"), new Date("2026-11-09T09:00:00Z"), "Europe/Paris"),
    ).toBe("vote ouvert jusqu'au jeudi 12 novembre, 0 h 30");
  });
});

describe("accès sur plusieurs jours : l'entrée vaut pour tout l'événement (lot R7-0)", () => {
  it("dit quand on est entré et jusqu'à quand l'accès vaut", () => {
    expect(wholeEventEntered(new Date("2026-11-07T08:12:00Z"), new Date("2026-11-11T20:00:00Z"), "Europe/Paris")).toBe(
      "Entrée samedi à 9 h 12 · accès jusqu'au mercredi 11 novembre",
    );
  });
});
