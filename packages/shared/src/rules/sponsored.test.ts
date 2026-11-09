import { describe, expect, it } from "vitest";

import {
  placementAdvertiserProblem,
  sponsoredPlacementCreateSchema,
  sponsoredPlacementUpdateSchema,
} from "../schemas/home";
import { displayDomain, distinctDepartments, feedPlacementMatch, feedSponsoredReason } from "./sponsored";

const base = {
  id: "p",
  status: "active" as const,
  startsOn: "2026-11-01",
  endsOn: "2026-11-30",
  categoryIds: [],
  dailyCap: null,
};
const ctx = { today: "2026-11-09", sector: ["66"], impressionsToday: 0 };

describe("feedPlacementMatch (Fil : le département seulement)", () => {
  it("ouvert à tous : éligible, poids 1", () => {
    expect(feedPlacementMatch({ ...base, departments: [] }, ctx)).toEqual({ eligible: true, weight: 1 });
  });
  it("ciblé : éligible seulement si un département de la personne y est, poids 1 + départements touchés", () => {
    expect(feedPlacementMatch({ ...base, departments: ["66"] }, ctx)).toEqual({ eligible: true, weight: 2 });
    expect(feedPlacementMatch({ ...base, departments: ["11"] }, ctx).eligible).toBe(false);
    expect(feedPlacementMatch({ ...base, departments: ["66", "11"] }, { ...ctx, sector: ["66", "11"] }).weight).toBe(3);
    // Personne sans département : jamais un emplacement ciblé.
    expect(feedPlacementMatch({ ...base, departments: ["66"] }, { ...ctx, sector: [] }).eligible).toBe(false);
  });
  it("les centres d'intérêt de l'emplacement ne comptent pas", () => {
    expect(feedPlacementMatch({ ...base, departments: [], categoryIds: ["x"] }, ctx)).toEqual({
      eligible: true,
      weight: 1,
    });
  });
  it("statut, période et plafond du jour", () => {
    expect(feedPlacementMatch({ ...base, status: "paused", departments: [] }, ctx).eligible).toBe(false);
    expect(feedPlacementMatch({ ...base, departments: [] }, { ...ctx, today: "2026-10-31" }).eligible).toBe(false);
    expect(feedPlacementMatch({ ...base, departments: [] }, { ...ctx, today: "2026-12-01" }).eligible).toBe(false);
    expect(
      feedPlacementMatch({ ...base, dailyCap: 2, departments: [] }, { ...ctx, impressionsToday: 2 }).eligible,
    ).toBe(false);
    expect(
      feedPlacementMatch({ ...base, dailyCap: 2, departments: [] }, { ...ctx, impressionsToday: 1 }).eligible,
    ).toBe(true);
  });
});

describe("displayDomain", () => {
  it("le nom d'hôte du lien, sans www, en minuscules", () => {
    expect(displayDomain("https://www.Exemple.FR/offre?x=1")).toBe("exemple.fr");
    expect(displayDomain("http://devis.exemple.fr")).toBe("devis.exemple.fr");
    expect(displayDomain("pas un lien")).toBeNull();
  });
});

describe("placementAdvertiserProblem", () => {
  const ok = { proProfileId: null, advertiserName: "Assurance", surfaces: ["feed"] as const, categoryIds: [] };
  it("un pro a une fiche ; un annonceur externe un nom, le Fil seulement, aucun centre d'intérêt, pas de fiche", () => {
    expect(placementAdvertiserProblem("pro", { ...ok, proProfileId: "x", surfaces: ["home", "feed"] })).toBeNull();
    expect(placementAdvertiserProblem("pro", ok)).not.toBeNull();
    expect(placementAdvertiserProblem("external", ok)).toBeNull();
    expect(placementAdvertiserProblem("external", { ...ok, advertiserName: null })).not.toBeNull();
    expect(placementAdvertiserProblem("external", { ...ok, proProfileId: "x" })).not.toBeNull();
    expect(placementAdvertiserProblem("external", { ...ok, surfaces: ["home"] })).not.toBeNull();
    expect(placementAdvertiserProblem("external", { ...ok, categoryIds: ["c"] })).not.toBeNull();
  });
});

describe("départements répétés", () => {
  it("le poids se calcule sur les départements distincts", () => {
    expect(feedPlacementMatch({ ...base, departments: ["66", "66", "66"] }, ctx)).toEqual({
      eligible: true,
      weight: 2,
    });
  });
  it("le schéma d'un emplacement les dédoublonne avant stockage (création et modification)", () => {
    const create = sponsoredPlacementCreateSchema.parse({
      advertiserKind: "external",
      advertiserName: "Assurance",
      surfaces: ["feed"],
      title: "T",
      body: "B",
      linkUrl: "https://exemple.fr",
      departments: ["66", "11", "66", "11", "66"],
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
    });
    expect(create.departments).toEqual(["66", "11"]);
    expect(sponsoredPlacementUpdateSchema.parse({ departments: ["34", "34"] }).departments).toEqual(["34"]);
    expect(distinctDepartments(["66", "11", "66"])).toEqual(["66", "11"]);
  });
});

describe("raison d'une carte du Fil", () => {
  it("le département n'est dit que pour un emplacement ciblé ; ouvert à tous : « Sponsorisé »", () => {
    expect(feedSponsoredReason(true)).toBe("Sponsorisé · choisi d'après ton département");
    expect(feedSponsoredReason(false)).toBe("Sponsorisé");
  });
});
