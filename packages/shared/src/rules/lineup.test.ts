import { describe, expect, it } from "vitest";

import { lineupLabels } from "../labels/lineup.fr";
import { lineupCarMemberFields, lineupCarVisitorFields, lineupPhase, maskedPhoto, publicCountsHidden } from "./lineup";
import { privateVehicleFields } from "./visibility";

describe("Le plateau (lot R4b)", () => {
  const ends = new Date("2026-10-24T21:30:00Z");

  it("montre les retenues jusqu'à la fin de l'événement, les présentes ensuite", () => {
    expect(lineupPhase(ends, new Date(ends.getTime() - 1))).toBe("accepted");
    expect(lineupPhase(ends.toISOString(), ends)).toBe("present");
    expect(lineupPhase(ends, new Date(ends.getTime() + 86_400_000))).toBe("present");
  });

  it("ne donne au visiteur ni pseudo ni identifiant", () => {
    const visitor: readonly string[] = lineupCarVisitorFields;
    for (const f of ["pseudo", "vehicleId", "userId", "ownerId", "private", "me"]) expect(visitor).not.toContain(f);
  });

  it("ne donne jamais d'heure, de zone, de plaque ni de département", () => {
    const fields: readonly string[] = [...lineupCarMemberFields, ...privateVehicleFields];
    for (const f of ["plate", "checkedInAt", "arrival", "zone", "slot", "departments", "userId", "year"]) {
      expect(fields).not.toContain(f);
    }
  });

  it("dit les nombres au singulier et au pluriel", () => {
    expect(lineupLabels.carsCount(1, "accepted")).toBe("1 voiture retenue");
    expect(lineupLabels.carsCount(38, "present")).toBe("38 voitures présentes");
    expect(lineupLabels.seeAll).toBe("Voir le plateau");
    expect(lineupLabels.more(34)).toBe("Voir les 34 autres");
    expect(lineupLabels.discount({ percent: 8, from: null }, "route")).toBe("−8 % avec ton grade Route");
    expect(lineupLabels.discount({ percent: 10, from: "sport" }, "route")).toBe("−10 % dès Sport");
  });

  it("photo : seulement une photo floutée, ou d'un véhicule sans plaque (tour 2)", () => {
    const a = { id: "a", plateBlurred: false, noPlateConfirmed: false };
    const b = { id: "b", plateBlurred: true, noPlateConfirmed: false };
    const c = { id: "c", plateBlurred: false, noPlateConfirmed: true };
    expect(maskedPhoto([a, b], false)).toBe(b);
    expect(maskedPhoto([a], false)).toBeNull();
    // Tour 3 : « aucune plaque visible » confirmé à l'envoi suffit ; une photo sans décision, jamais.
    expect(maskedPhoto([a, c, b], false)).toBe(c);
    expect(maskedPhoto([a, b], true)).toBe(a);
    expect(maskedPhoto([], true)).toBeNull();
  });

  it("après la fin, plus de retenus ni de places publics", () => {
    expect(publicCountsHidden(ends, new Date(ends.getTime() - 1))).toBe(false);
    expect(publicCountsHidden(ends, ends)).toBe(true);
  });
});
