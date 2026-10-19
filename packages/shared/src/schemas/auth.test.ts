import { describe, expect, it } from "vitest";
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
});
