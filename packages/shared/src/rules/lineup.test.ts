import { describe, expect, it } from "vitest";

import { lineupLabels } from "../labels/lineup.fr";
import { lineupCarMemberFields, lineupCarVisitorFields, lineupPhase } from "./lineup";
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
    expect(lineupLabels.seeAll(42, "accepted")).toBe("Voir le plateau · 42 voitures");
    expect(lineupLabels.seeAll(38, "present")).toBe("Voir le plateau · 38 présentes");
    expect(lineupLabels.more(34)).toBe("Voir les 34 autres");
    expect(lineupLabels.discount({ percent: 8, from: null }, "route")).toBe("−8 % avec ton grade Route");
    expect(lineupLabels.discount({ percent: 10, from: "sport" }, "route")).toBe("−10 % dès Sport");
  });
});
