import { describe, expect, it } from "vitest";
import {
  applicationStatuses,
  applicationStatusLabels,
  applicationStatusSchema,
  gradeLabels,
  grades,
  staffRoleLabels,
  staffRoles,
  structureRoleLabels,
  structureRoles,
} from "./index";

describe("libellés partagés", () => {
  it("chaque statut de candidature a son libellé des docs", () => {
    expect(Object.keys(applicationStatusLabels)).toEqual([...applicationStatuses]);
    expect(applicationStatusLabels.accepted).toBe("Retenue");
    expect(applicationStatusLabels.waitlist).toBe("Liste d'attente");
  });

  it("refuse un statut inconnu", () => {
    expect(applicationStatusSchema.safeParse("meet").success).toBe(false);
  });

  it("les grades vont de Rodage à Légende", () => {
    expect(grades.map((g) => gradeLabels[g])).toEqual(["Rodage", "Route", "Sport", "Circuit", "Légende"]);
  });

  it("chaque rôle a un libellé", () => {
    for (const r of structureRoles) expect(structureRoleLabels[r]).toBeTruthy();
    for (const r of staffRoles) expect(staffRoleLabels[r]).toBeTruthy();
  });
});
