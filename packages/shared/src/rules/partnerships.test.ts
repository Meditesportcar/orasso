import { describe, expect, it } from "vitest";

import { partnershipLabels } from "../labels/partnerships.fr";
import {
  canPropose,
  isIsoDay,
  PARTNERSHIP_MESSAGE_MAX,
  PARTNERSHIP_SUBSCRIPTION_FROM_DEFAULT,
  partnershipVisibleTo,
  subscriptionFromInstant,
} from "./partnerships";
import { fromWallTime } from "./time";

const verified = { verifiedAt: new Date(0) };
const settings = { subscriptionFrom: PARTNERSHIP_SUBSCRIPTION_FROM_DEFAULT };

describe("canPropose", () => {
  it("un pro non vérifié ne propose pas, quelle que soit la date", () => {
    const early = fromWallTime({ year: 2026, month: 11, day: 9, hour: 12, minute: 0 });
    expect(canPropose({ verifiedAt: null }, settings, early)).toBe("not_verified");
    expect(
      canPropose({ verifiedAt: null }, settings, fromWallTime({ year: 2028, month: 1, day: 1, hour: 0, minute: 0 })),
    ).toBe("not_verified");
  });

  it("tout pro vérifié propose jusqu'au 20/06/2027 inclus (heure de Paris), puis l'abonnement est requis", () => {
    expect(
      canPropose(verified, settings, fromWallTime({ year: 2026, month: 11, day: 9, hour: 12, minute: 0 })),
    ).toBeNull();
    expect(
      canPropose(verified, settings, fromWallTime({ year: 2027, month: 6, day: 20, hour: 23, minute: 59 })),
    ).toBeNull();
    expect(canPropose(verified, settings, fromWallTime({ year: 2027, month: 6, day: 21, hour: 0, minute: 0 }))).toBe(
      "subscription_required",
    );
  });

  it("le réglage déplace la date, hiver comme été", () => {
    const from = { subscriptionFrom: "2027-01-15" };
    expect(subscriptionFromInstant("2027-01-15").toISOString()).toBe("2027-01-14T23:00:00.000Z");
    expect(canPropose(verified, from, new Date("2027-01-14T22:59:00Z"))).toBeNull();
    expect(canPropose(verified, from, new Date("2027-01-14T23:00:00Z"))).toBe("subscription_required");
  });

  it("isIsoDay : un vrai jour du calendrier", () => {
    expect(isIsoDay("2027-06-21")).toBe(true);
    expect(isIsoDay("2027-02-29")).toBe(false);
    expect(isIsoDay("21/06/2027")).toBe(false);
  });
});

describe("partnershipVisibleTo", () => {
  const base = { userId: "u1", proOwnerId: "p1" } as const;
  const active = { ...base, status: "active", userVisibility: "public" } as const;

  it("sans compte connecté : rien", () => {
    expect(partnershipVisibleTo({ userId: null }, active, { followAccepted: true })).toBe("none");
  });

  it("actif et compte public : tout pour tout membre connecté", () => {
    expect(partnershipVisibleTo({ userId: "x" }, active, { followAccepted: false })).toBe("full");
  });

  it("actif et compte privé : tout pour soi et ses abonnés acceptés, la ligne réduite pour les autres (le pro compris)", () => {
    const priv = { ...active, userVisibility: "private" } as const;
    expect(partnershipVisibleTo({ userId: "u1" }, priv, { followAccepted: false })).toBe("full");
    expect(partnershipVisibleTo({ userId: "x" }, priv, { followAccepted: true })).toBe("full");
    expect(partnershipVisibleTo({ userId: "x" }, priv, { followAccepted: false })).toBe("limited");
    expect(partnershipVisibleTo({ userId: "p1" }, priv, { followAccepted: false })).toBe("limited");
  });

  it("proposition, refus, fin : la personne et le titulaire de la fiche, personne d'autre", () => {
    for (const status of ["pending", "declined", "ended"] as const) {
      const p = { ...base, status, userVisibility: "public" } as const;
      expect(partnershipVisibleTo({ userId: "u1" }, p, { followAccepted: false })).toBe("full");
      expect(partnershipVisibleTo({ userId: "p1" }, p, { followAccepted: false })).toBe("full");
      expect(partnershipVisibleTo({ userId: "x" }, p, { followAccepted: true })).toBe("none");
    }
  });
});

describe("libellés", () => {
  it("aucun mot d'argent ; le texte est limité à 200 caractères", () => {
    expect(PARTNERSHIP_MESSAGE_MAX).toBe(200);
    expect(JSON.stringify(partnershipLabels.errors)).not.toMatch(/€|prix|rémun/i);
    expect(partnershipLabels.noteMoney).toBe("Orasso ne touche à aucun paiement entre vous.");
    expect(partnershipLabels.partnersCount(1)).toBe("1 passionné");
    expect(partnershipLabels.partnersCount(3)).toBe("3 passionnés");
  });
});
