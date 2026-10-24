// Lot R3d : « ce qui manque » pour créer un compte, la première chose seulement, dans l'ordre de l'écran.
import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password";
import {
  departmentsMissing,
  emailLooksValid,
  identityMissing,
  loginMissing,
  passwordMissing,
  profileMissing,
  pseudoMissing,
  type SignupDraft,
} from "./signupMissing";

const full: SignupDraft = {
  pseudo: "Julien_66",
  firstName: "Julien",
  lastName: "Martí",
  email: "julien@exemple.fr",
  password: "a".repeat(PASSWORD_MIN_LENGTH),
  terms: true,
};

describe("ce qui manque à l'inscription", () => {
  it("un formulaire complet ne bloque pas", () => {
    expect(identityMissing(full, "free", ["66"])).toBeNull();
    expect(identityMissing(full, "idle", ["66"])).toBeNull();
  });

  it("un mot de passe de 9 caractères dit combien il en manque (le cas du 24/10)", () => {
    const m = identityMissing({ ...full, password: "123456789" }, "free", ["66"]);
    expect(m).toEqual({ field: "password", text: "Mot de passe : 10 caractères au moins (il en manque 1)." });
    expect(passwordMissing("")).toBe("Mot de passe : 10 caractères au moins (il en manque 10).");
    expect(passwordMissing("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(passwordMissing("a".repeat(PASSWORD_MAX_LENGTH + 1))).toBe("Mot de passe : 128 caractères au plus.");
  });

  it("des départements perdus disent de revenir à Ton coin, une fois le formulaire rempli", () => {
    expect(identityMissing(full, "free", [])).toEqual({
      field: "departments",
      text: "Choisis au moins un département.",
    });
    // Sans liste de départements (site : ils sont sur la même page), seul le formulaire compte.
    expect(identityMissing(full, "free")).toBeNull();
  });

  it("la première chose qui manque, dans l'ordre de l'écran", () => {
    const empty: SignupDraft = { pseudo: "", firstName: "", lastName: "", email: "", password: "", terms: false };
    expect(identityMissing(empty, "idle", [])?.field).toBe("pseudo");
    expect(identityMissing({ ...full, firstName: " " }, "free", [])?.field).toBe("firstName");
    expect(identityMissing({ ...full, lastName: "" }, "free", [])?.field).toBe("lastName");
    expect(identityMissing({ ...full, email: "" }, "free", [])?.text).toBe("Indique ton e-mail.");
    expect(identityMissing({ ...full, email: "julien@" }, "free", [])?.text).toBe(
      "E-mail : l'adresse n'est pas complète.",
    );
    expect(identityMissing({ ...full, terms: false }, "free", ["66"])?.text).toBe(
      "Coche les conditions d'utilisation.",
    );
  });

  it("le pseudo : vide, mal formé, pris, en vérification ; une vérification en panne ne bloque pas", () => {
    expect(pseudoMissing("")).toBe("Choisis un pseudo.");
    expect(pseudoMissing("ab")).toMatch(/^Pseudo : 3 à 24 caractères/);
    expect(pseudoMissing("Julien_66", "taken")).toBe("Ce pseudo est déjà pris : choisis-en un autre.");
    expect(pseudoMissing("Julien_66", "checking")).toBe("Vérification du pseudo…");
    expect(pseudoMissing("Julien_66", "idle")).toBeNull();
  });

  it("tour 2 : l'e-mail se lit en une passe, borné à 254 caractères (20 000 caractères : refusé tout de suite)", () => {
    const long = `${"a".repeat(20_000)}@exemple.fr`;
    const hostile = `a@${"a.".repeat(10_000)}`;
    const start = performance.now();
    expect(emailLooksValid(long)).toBe(false);
    expect(emailLooksValid(hostile)).toBe(false);
    expect(emailLooksValid("a".repeat(20_000))).toBe(false);
    expect(performance.now() - start).toBeLessThan(50);
    expect(emailLooksValid(`${"a".repeat(242)}@exemple.fr`)).toBe(true);
    expect(emailLooksValid(`${"a".repeat(244)}@exemple.fr`)).toBe(false);
    expect(emailLooksValid("@exemple.fr")).toBe(false);
    expect(emailLooksValid("julien@.fr")).toBe(false);
    expect(emailLooksValid("julien@exemple.")).toBe(false);
    expect(emailLooksValid("ju lien@exemple.fr")).toBe(false);
  });

  it("tour 2 : la connexion dit aussi ce qui manque", () => {
    expect(loginMissing("", "")?.text).toBe("Indique ton e-mail.");
    expect(loginMissing("kenji", "")?.text).toBe("E-mail : l'adresse n'est pas complète.");
    expect(loginMissing("kenji@orasso.local", "")?.text).toBe("Indique ton mot de passe.");
    // Un mot de passe existant n'a pas à respecter la longueur d'une création (ancien compte).
    expect(loginMissing("kenji@orasso.local", "123456789")).toBeNull();
    expect(loginMissing("kenji@orasso.local", "1234567890")).toBeNull();
  });

  it("l'e-mail, le profil et Ton coin", () => {
    expect(emailLooksValid(" julien@exemple.fr ")).toBe(true);
    expect(emailLooksValid("julien@exemple")).toBe(false);
    expect(profileMissing(null)?.text).toBe("Choisis ton profil pour continuer.");
    expect(profileMissing("organizer")).toBeNull();
    expect(departmentsMissing([])?.field).toBe("departments");
    expect(departmentsMissing(["66"])).toBeNull();
  });
});
