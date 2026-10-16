import { describe, expect, it } from "vitest";

import {
  canAccredit,
  customVendorTypes,
  eventAcceptsVendorType,
  instagramHandle,
  instagramUrl,
  normalizeVendorText,
  ON_SITE_PAYMENT_LABEL,
  PRO_PAID_FROM,
  proVisibility,
  providerProfileIssue,
  providerProfileSchema,
  providerTypeLabel,
  publicAccessText,
  vendorCodeOf,
  vendorTypeLabels,
  vendorTypeSuggestions,
} from "./index";

describe("types de prestataires", () => {
  it("reconnaît un type par code, libellé ou alias, sans accent ni casse", () => {
    expect(vendorCodeOf("Food truck")).toBe("food_truck");
    expect(vendorCodeOf("food_truck")).toBe("food_truck");
    expect(vendorCodeOf("  FOOD-TRUCK ")).toBe("food_truck");
    expect(vendorCodeOf("Vente de pièces")).toBe("merch");
    expect(vendorCodeOf("tatouage")).toBe("tattoo");
    expect(vendorCodeOf("Glacier")).toBeNull();
    expect(normalizeVendorText("Vente de pièces")).toBe("vente de pieces");
  });

  it("l'événement accepte le type s'il figure dans ses types attendus", () => {
    const types = ["Food truck", "Photographe", "Glacier"];
    expect(eventAcceptsVendorType(types, "food_truck")).toBe(true);
    expect(eventAcceptsVendorType(types, "photographer")).toBe(true);
    expect(eventAcceptsVendorType(types, "barber")).toBe(false);
    expect(eventAcceptsVendorType([], "food_truck")).toBe(false);
    expect(customVendorTypes(types)).toEqual(["Glacier"]);
  });

  it("un type libre est accepté par « Autres » ou par le même texte libre", () => {
    expect(eventAcceptsVendorType(["Food truck"], "other", "Glacier")).toBe(false);
    expect(eventAcceptsVendorType(["Glacier"], "other", "glacier")).toBe(true);
    expect(eventAcceptsVendorType(["Autres"], "other", "Glacier")).toBe(true);
    expect(eventAcceptsVendorType(["Food truck"], "stand")).toBe(false);
    expect(eventAcceptsVendorType(["Stand de professionnel"], "stand")).toBe(true);
  });

  it("libellés : le type libre garde son texte, les suggestions de l'assistant viennent des codes", () => {
    expect(providerTypeLabel("food_truck")).toBe("Food truck");
    expect(providerTypeLabel("other", " Glacier ")).toBe("Glacier");
    expect(providerTypeLabel("other", null)).toBe(vendorTypeLabels.other);
    expect(vendorTypeSuggestions).toContain("Photographe");
    expect(vendorTypeSuggestions).toContain("Stand de professionnel");
  });
});

describe("profil prestataire", () => {
  const base = {
    name: "La Caravane",
    type: "food_truck" as const,
    photosCount: 1,
    instagram: null,
    portfolioUrl: null,
  };

  it("complet avec une photo ; un photographe peut remplacer la photo par un lien", () => {
    expect(providerProfileIssue(base)).toBeNull();
    expect(providerProfileIssue({ ...base, photosCount: 0 })).toMatch(/photo/);
    expect(providerProfileIssue({ ...base, type: "photographer", photosCount: 0 })).toMatch(/Instagram/);
    expect(providerProfileIssue({ ...base, type: "photographer", photosCount: 0, instagram: "@paul" })).toBeNull();
    expect(
      providerProfileIssue({ ...base, type: "photographer", photosCount: 0, portfolioUrl: "https://p.fr" }),
    ).toBeNull();
    // Le lien ne remplace pas la photo pour un food truck.
    expect(providerProfileIssue({ ...base, photosCount: 0, instagram: "@x" })).toMatch(/photo/);
    expect(providerProfileIssue({ ...base, name: "  " })).toMatch(/nom/);
    expect(providerProfileIssue({ ...base, type: null })).toMatch(/type/);
  });

  it("l'accréditation ne concerne que les photographes retenus", () => {
    expect(canAccredit({ type: "photographer" }, "accepted")).toBe(true);
    expect(canAccredit({ type: "photographer" }, "pending")).toBe(false);
    expect(canAccredit({ type: "food_truck" }, "accepted")).toBe(false);
  });

  it("Instagram : @pseudo ou adresse", () => {
    expect(instagramUrl("@lea.photo")).toBe("https://www.instagram.com/lea.photo");
    expect(instagramUrl("https://instagram.com/lea")).toBe("https://instagram.com/lea");
    expect(instagramUrl("  ")).toBeNull();
    expect(instagramHandle("@lea.photo")).toBe("@lea.photo");
  });

  it("le schéma exige nom et type et précise le type libre", () => {
    const ok = providerProfileSchema.safeParse({ type: "food_truck", name: "La Caravane" });
    expect(ok.success).toBe(true);
    expect(providerProfileSchema.safeParse({ type: "other", name: "Glaces" }).success).toBe(false);
    expect(providerProfileSchema.safeParse({ type: "other", customType: "Glacier", name: "Glaces" }).success).toBe(
      true,
    );
    expect(providerProfileSchema.safeParse({ type: "barber", name: "B", website: "javascript:alert(1)" }).success).toBe(
      false,
    );
  });
});

describe("visibilité d'une fiche pro", () => {
  it("avant le 21/06/2027 tout est visible", () => {
    const v = proVisibility(null, null, new Date(PRO_PAID_FROM.getTime() - 1));
    expect(v.full).toBe(true);
    expect(v.banner).toBeNull();
    expect(Object.values(v.hidden).every((h) => !h)).toBe(true);
  });

  it("après la date, sans abonnement : fiche de base, tout le reste masqué, bandeau", () => {
    const v = proVisibility(null, null, PRO_PAID_FROM);
    expect(v.full).toBe(false);
    expect(v.hidden).toEqual({ discounts: true, posts: true, stats: true, favoriteGarage: true, promotion: true });
    expect(v.banner).toContain("21 juin 2027");
  });

  it("après la date, un abonnement actif garde la fiche complète", () => {
    const v = proVisibility(null, { active: true }, new Date("2028-01-01T00:00:00Z"));
    expect(v.full).toBe(true);
    expect(proVisibility(null, { active: false }, new Date("2028-01-01T00:00:00Z")).full).toBe(false);
  });
});

describe("paiement sur place", () => {
  it("un événement payant sans adresse de billetterie s'affiche « paiement sur place »", () => {
    expect(publicAccessText("paid_external", null)).toBe(ON_SITE_PAYMENT_LABEL);
    expect(publicAccessText("paid_external", "")).toBe(ON_SITE_PAYMENT_LABEL);
    expect(publicAccessText("paid_external", "https://billet.fr")).toBe("Payante · billetterie externe");
    expect(publicAccessText("free", null)).toBe("Entrée libre");
  });
});
