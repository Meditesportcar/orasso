import { describe, expect, it } from "vitest";

import { placementAdvertiserProblem } from "../schemas/home";
import { displayDomain, feedPlacementMatch } from "./sponsored";

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
    expect(feedPlacementMatch({ ...base, dailyCap: 2, departments: [] }, { ...ctx, impressionsToday: 2 }).eligible).toBe(false);
    expect(feedPlacementMatch({ ...base, dailyCap: 2, departments: [] }, { ...ctx, impressionsToday: 1 }).eligible).toBe(true);
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
