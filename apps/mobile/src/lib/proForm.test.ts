// Lot 35c : fiche pro dans l'appli (formulaire → corps de l'API, remises, partenaires).
import type { ProOwner } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  discountsBody,
  discountTexts,
  formOfPro,
  type ProFicheForm,
  partnerChoices,
  proBody,
  siretCheckIssue,
  siretDigits,
  toggleActivity,
} from "./proForm";

const pro = {
  name: "Garage du Port",
  activities: ["garage"],
  description: null,
  addressLine: "2 quai du Port",
  postalCode: "66140",
  city: "Canet",
  interventionDepartments: ["66", "11"],
  phone: "04 68 00 00 00",
  email: null,
  website: "https://garage.example",
  socials: { instagram: "https://instagram.com/garage" },
  hours: { mon: "9h-18h" },
  discounts: { rodage: 5, route: 10 },
} as unknown as ProOwner;

describe("fiche pro : formulaire", () => {
  it("reprend la fiche de l'API, champs vides pour ce qui manque", () => {
    const form = formOfPro(pro);
    expect(form).toMatchObject({
      name: "Garage du Port",
      activities: ["garage"],
      description: "",
      zone: "66, 11",
      website: "https://garage.example",
      socials: { instagram: "https://instagram.com/garage", facebook: "", tiktok: "", youtube: "" },
      hours: { mon: "9h-18h", tue: "" },
    });
  });

  it("corps de l'API : vides → null, adresses web en https, zone en codes de département", () => {
    const form: ProFicheForm = {
      ...formOfPro(pro),
      description: "  ",
      website: "garage.example",
      socials: { instagram: "instagram.com/garage", facebook: "", tiktok: "", youtube: "" },
      zone: "66; 11, 66",
    };
    const res = proBody(form);
    expect(res).toHaveProperty("body");
    if (!("body" in res)) return;
    expect(res.body).toMatchObject({
      name: "Garage du Port",
      description: null,
      website: "https://garage.example",
      socials: { instagram: "https://instagram.com/garage" },
      interventionDepartments: ["66", "11"],
      hours: { mon: "9h-18h", tue: null },
    });
    expect(res.body.socials).not.toHaveProperty("facebook");
  });

  it("refuse un nom trop court, aucune activité, une zone invalide", () => {
    const form = formOfPro(pro);
    expect(proBody({ ...form, name: "G" })).toHaveProperty("error");
    expect(proBody({ ...form, activities: [] })).toEqual({ error: "Choisis au moins une activité." });
    expect(proBody({ ...form, zone: "66, pas-un-code" })).toHaveProperty("error");
  });

  it("ajoute et retire une activité", () => {
    expect(toggleActivity(["garage"], "detailing")).toEqual(["garage", "detailing"]);
    expect(toggleActivity(["garage", "detailing"], "garage")).toEqual(["detailing"]);
  });
});

describe("fiche pro : remises par grade", () => {
  it("les remises de la fiche sont proposées telles quelles", () => {
    expect(discountTexts(pro.discounts)).toEqual({ rodage: "5", route: "10", sport: "", circuit: "", legende: "" });
  });

  it("vide ou 0 : pas de remise ; sinon un entier de 1 à 50", () => {
    const res = discountsBody({ rodage: "5", route: "", sport: "0", circuit: "15 %", legende: "50" });
    expect(res).toEqual({
      body: { discounts: { rodage: 5, route: null, sport: null, circuit: 15, legende: 50 } },
    });
    for (const bad of ["51", "-1", "2,5", "beaucoup"]) {
      const out = discountsBody({ rodage: bad, route: "", sport: "", circuit: "", legende: "" });
      expect(out).toHaveProperty("error");
    }
  });
});

describe("SIRET et partenaires", () => {
  it("le SIRET perd ses espaces", () => {
    expect(siretDigits("356 000 000 00048")).toBe("35600000000048");
  });

  it("on ne repropose pas un organisateur déjà lié", () => {
    const structures = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
    expect(partnerChoices(structures, ["b"])).toEqual([{ slug: "a" }, { slug: "c" }]);
  });
});

describe("SIRET contrôlé par « Enregistrer » (lot C7, tour 2)", () => {
  // `ApiRequestError` (lib/http) : une erreur au message de l'API ; 0 = réseau.
  const fail = (status: number, message: string) => () => Promise.reject(Object.assign(new Error(message), { status }));
  const NETWORK_MESSAGE = "Pas de connexion : réessaie quand le réseau revient.";
  it("validé : aucune réserve", async () => {
    expect(
      await siretCheckIssue(async () => ({ verifiedAt: "2026-10-24T10:00:00.000Z", registryCheck: null })),
    ).toBeNull();
  });
  it("introuvable au registre : la raison du registre", async () => {
    const issue = await siretCheckIssue(async () => ({ verifiedAt: null, registryCheck: { status: "not_found" } }));
    expect(issue).toBeTruthy();
  });
  it("400, 409 et panne réseau : le message de l'API tel quel", async () => {
    expect(await siretCheckIssue(fail(400, "Un SIRET a 14 chiffres."))).toBe("Un SIRET a 14 chiffres.");
    expect(await siretCheckIssue(fail(409, "Ce SIRET est déjà utilisé par une autre fiche pro."))).toBe(
      "Ce SIRET est déjà utilisé par une autre fiche pro.",
    );
    expect(await siretCheckIssue(fail(0, NETWORK_MESSAGE))).toBe(NETWORK_MESSAGE);
  });
});
