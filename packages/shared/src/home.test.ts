import { describe, expect, it } from "vitest";

import { nearestDepartment } from "./geo";
import {
  defaultHomeWidgets,
  HOME_FIXED_WIDGET,
  homeWidgetIds,
  moveHomeWidget,
  normalizeHomeWidgets,
  toggleHomeWidget,
  visibleHomeWidgets,
} from "./home";
import { pickWeighted, placementMatch, seededUnit } from "./rules/sponsored";
import { homeQuerySchema, homeWidgetsSchema, sponsoredPlacementCreateSchema } from "./schemas/home";

describe("réglage des widgets de l'accueil", () => {
  it("vaut l'ordre par défaut sans réglage ou avec un ancien format", () => {
    expect(normalizeHomeWidgets(null)).toEqual(defaultHomeWidgets);
    expect(normalizeHomeWidgets([{ id: "meteo", visible: true }])).toEqual(defaultHomeWidgets);
    expect(normalizeHomeWidgets("n'importe quoi")).toEqual(defaultHomeWidgets);
  });

  it("retire les inconnus et les doublons, complète les manquants, garde « Prochain accès » en tête", () => {
    const c = normalizeHomeWidgets({
      order: ["fuel", "x", "fuel", "weather", "next_access"],
      hidden: ["fuel", "nope"],
    });
    expect(c.order[0]).toBe(HOME_FIXED_WIDGET);
    expect(c.order.slice(1, 3)).toEqual(["fuel", "weather"]);
    expect([...c.order].sort()).toEqual([...homeWidgetIds].sort());
    expect(c.hidden).toEqual(["fuel"]);
  });

  it("ne masque jamais « Prochain accès » et ne le déplace pas", () => {
    const c = normalizeHomeWidgets({ order: [], hidden: ["next_access", "wash"] });
    expect(c.hidden).toEqual(["wash"]);
    expect(toggleHomeWidget(c, "next_access")).toBe(c);
    expect(moveHomeWidget(c, "next_access", 1)).toBe(c);
    expect(moveHomeWidget(c, "pending", -1)).toBe(c);
  });

  it("monte, descend et masque", () => {
    let c = defaultHomeWidgets;
    c = moveHomeWidget(c, "weather", -1);
    expect(c.order.indexOf("weather")).toBeLessThan(c.order.indexOf("nearby"));
    c = moveHomeWidget(c, "fuel", 1);
    expect(c.order.at(-1)).toBe("fuel");
    c = toggleHomeWidget(c, "wash");
    expect(visibleHomeWidgets(c)).not.toContain("wash");
    c = toggleHomeWidget(c, "wash");
    expect(visibleHomeWidgets(c)).toContain("wash");
  });

  it("valide strictement ce qui s'enregistre", () => {
    expect(homeWidgetsSchema.safeParse({ order: ["weather"], hidden: [] }).success).toBe(true);
    expect(homeWidgetsSchema.safeParse({ order: ["inconnu"], hidden: [] }).success).toBe(false);
    expect(homeWidgetsSchema.safeParse({ order: [], hidden: [], extra: 1 }).success).toBe(false);
    expect(homeWidgetsSchema.safeParse([{ id: "meteo" }]).success).toBe(false);
    expect(homeWidgetsSchema.safeParse({ order: Array(30).fill("weather"), hidden: [] }).success).toBe(false);
  });
});

describe("paramètres de GET /me/home", () => {
  it("borne le rayon et exige lat et lng ensemble", () => {
    expect(homeQuerySchema.safeParse({ radiusKm: "150" }).success).toBe(true);
    expect(homeQuerySchema.safeParse({ radiusKm: "5" }).success).toBe(false);
    expect(homeQuerySchema.safeParse({ radiusKm: "301" }).success).toBe(false);
    expect(homeQuerySchema.safeParse({ lat: "42.7" }).success).toBe(false);
    expect(homeQuerySchema.safeParse({ lat: "42.7", lng: "2.9" }).success).toBe(true);
  });

  it("refuse un lien d'emplacement qui n'est pas http(s)", () => {
    const base = {
      proProfileId: "11111111-1111-4111-8111-111111111111",
      title: "Offre",
      body: "Texte",
      startsOn: "2026-10-01",
      endsOn: "2026-11-01",
    };
    expect(sponsoredPlacementCreateSchema.safeParse({ ...base, linkUrl: "https://exemple.fr/offre" }).success).toBe(
      true,
    );
    expect(sponsoredPlacementCreateSchema.safeParse({ ...base, linkUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(
      sponsoredPlacementCreateSchema.safeParse({ ...base, linkUrl: "https://exemple.fr", endsOn: "2026-09-01" })
        .success,
    ).toBe(false);
  });
});

describe("département le plus proche", () => {
  it("retrouve le département d'un point", () => {
    expect(nearestDepartment({ lat: 42.7, lng: 2.9 })).toBe("66");
    expect(nearestDepartment({ lat: 48.85, lng: 2.35 })).toBe("75");
  });
});

describe("emplacement sponsorisé", () => {
  const base = {
    id: "a",
    status: "active" as const,
    startsOn: "2026-10-01",
    endsOn: "2026-10-31",
    departments: [] as string[],
    categoryIds: [] as string[],
    dailyCap: null as number | null,
  };
  const ctx = { today: "2026-10-17", sector: ["66"], interests: ["jdm"], impressionsToday: 0 };

  it("respecte statut, période et plafond du jour", () => {
    expect(placementMatch(base, ctx)).toEqual({ eligible: true, weight: 1 });
    expect(placementMatch({ ...base, status: "paused" }, ctx).eligible).toBe(false);
    expect(placementMatch({ ...base, status: "draft" }, ctx).eligible).toBe(false);
    expect(placementMatch(base, { ...ctx, today: "2026-09-30" }).eligible).toBe(false);
    expect(placementMatch(base, { ...ctx, today: "2026-11-01" }).eligible).toBe(false);
    expect(placementMatch(base, { ...ctx, today: "2026-10-31" }).eligible).toBe(true);
    expect(placementMatch({ ...base, dailyCap: 3 }, { ...ctx, impressionsToday: 3 }).eligible).toBe(false);
    expect(placementMatch({ ...base, dailyCap: 3 }, { ...ctx, impressionsToday: 2 }).eligible).toBe(true);
  });

  it("cible par département et par centre d'intérêt, et pèse plus quand le ciblage touche", () => {
    expect(placementMatch({ ...base, departments: ["66"] }, ctx)).toEqual({ eligible: true, weight: 2 });
    expect(placementMatch({ ...base, departments: ["31"] }, ctx).eligible).toBe(false);
    expect(placementMatch({ ...base, departments: ["66"], categoryIds: ["jdm"] }, ctx)).toEqual({
      eligible: true,
      weight: 3,
    });
    expect(placementMatch({ ...base, categoryIds: ["moto"] }, ctx).eligible).toBe(false);
    expect(placementMatch({ ...base, departments: ["66"] }, { ...ctx, sector: [] }).eligible).toBe(false);
  });

  it("tire de façon déterministe avec une graine, proportionnellement au poids", () => {
    expect(seededUnit("x")).toBe(seededUnit("x"));
    expect(seededUnit("x")).not.toBe(seededUnit("y"));
    const list = [
      { id: "a", weight: 1 },
      { id: "b", weight: 3 },
    ];
    expect(pickWeighted(list, "graine")?.id).toBe(pickWeighted([...list].reverse(), "graine")?.id);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) counts[pickWeighted(list, `s${i}`)?.id as "a" | "b"]++;
    expect(counts.b / counts.a).toBeGreaterThan(2);
    expect(counts.b / counts.a).toBeLessThan(4.5);
    expect(pickWeighted([], "s")).toBeNull();
    expect(pickWeighted([{ id: "z", weight: 0 }], "s")).toBeNull();
  });
});
