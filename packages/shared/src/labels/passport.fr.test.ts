import { describe, expect, it } from "vitest";
import { audiencePrizeTexts, passportScreenTexts, recapTexts } from "./passport.fr";

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
