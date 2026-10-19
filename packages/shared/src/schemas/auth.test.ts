import { describe, expect, it } from "vitest";
import { mainProfiles } from "../enums";
import { arriveeLabels, namePrivacy } from "../labels/arrivee.fr";
import { signUpRequiredSchema, signUpSchema } from "./auth";
import { profileUpdateSchema } from "./profile";

describe("inscription ordinaire (lot 41)", () => {
  const valid = {
    email: "julien@orasso.test",
    password: "motdepasse-test-123",
    name: "Kenji_66",
    mainProfile: "exhibitor",
    departments: ["66", "11"],
    firstName: "Julien",
    lastName: "Martí",
    termsAccepted: true,
  };

  it("accepte une inscription complète et rogne le nom et le prénom", () => {
    const parsed = signUpSchema.parse({ ...valid, firstName: "  Julien ", lastName: " Martí " });
    expect(parsed.firstName).toBe("Julien");
    expect(parsed.lastName).toBe("Martí");
    expect(parsed.departments).toEqual(["66", "11"]);
  });

  it("refuse sans prénom, sans nom, sans profil ni département", () => {
    for (const patch of [
      { firstName: "" },
      { firstName: "   " },
      { lastName: "" },
      { firstName: "x".repeat(61) },
      { mainProfile: undefined },
      { mainProfile: "autre" },
      { departments: [] },
      { departments: ["99"] },
      { termsAccepted: false },
    ]) {
      expect(signUpSchema.safeParse({ ...valid, ...patch }).success, JSON.stringify(patch)).toBe(false);
    }
  });

  it("le contrôle de l'API ne porte que sur les champs ajoutés à Better Auth", () => {
    const partial = { ...valid, email: undefined, password: undefined, name: undefined };
    expect(signUpRequiredSchema.safeParse(partial).success).toBe(true);
    expect(signUpRequiredSchema.safeParse({ ...partial, lastName: "" }).success).toBe(false);
  });

  it("PATCH /me/profile accepte le profil choisi", () => {
    expect(profileUpdateSchema.parse({ mainProfile: "media" })).toEqual({ mainProfile: "media" });
    expect(profileUpdateSchema.safeParse({ mainProfile: "dieu" }).success).toBe(false);
  });

  it("refuse plus de 20 départements, en français", () => {
    const many = [
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
      "21",
      "22",
    ];
    const r = signUpSchema.safeParse({ ...valid, departments: many });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(arriveeLabels.errors.tooMany);
    expect(profileUpdateSchema.safeParse({ departments: many }).success).toBe(false);
  });

  it("le texte sur le nom est conforme à docs/01 : visible des organisateurs, jamais « seulement en cas de souci »", () => {
    for (const p of ["exhibitor", "visitor", "pro", "organizer", "provider", "media"] as const) {
      expect(namePrivacy[p], p).toMatch(/équipes organisatrices/);
      expect(namePrivacy[p], p).toMatch(/pour la sécurité.$/);
      expect(namePrivacy[p], p).not.toMatch(/seulement en cas de souci/);
    }
    expect(mainProfiles).toHaveLength(6);
  });
});
