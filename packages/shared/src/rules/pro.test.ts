import { describe, expect, it } from "vitest";

import { proCreateSchema, proDiscountsSchema } from "../schemas/pro";
import { ticketCheckSchema, ticketingUpdateSchema } from "../schemas/ticketing";
import {
  discountForGrade,
  discountsOutOfOrder,
  monthBounds,
  PRO_POSTS_PER_MONTH,
  postsRemaining,
  proSubscription,
  shownDiscount,
} from "./pro";
import {
  PAYMENTS_OPEN_AT,
  platformFeeCents,
  presentationForced,
  type TicketingInput,
  ticketingBlock,
} from "./ticketing";

describe("professionnels", () => {
  it("abonnement en présentation : gratuit jusqu'au 21 juin 2027, aucun prix", () => {
    const before = proSubscription(new Date("2026-10-16T10:00:00Z"));
    expect(before.state).toBe("free_until");
    expect(before.label).toBe("Gratuit jusqu'au 21 juin 2027");
    expect(JSON.stringify(before)).not.toMatch(/€|eur|price|prix/i);
    expect(proSubscription(new Date("2027-06-21T00:00:00+02:00")).state).toBe("soon");
  });

  it("remises par grade : lecture et cohérence", () => {
    expect(discountForGrade({ sport: 10 }, "sport")).toBe(10);
    expect(discountForGrade({ sport: 10 }, "rodage")).toBe(0);
    expect(discountsOutOfOrder({ rodage: 5, route: 10, legende: 20 })).toBeNull();
    expect(discountsOutOfOrder({ route: 10, sport: 5 })).toBe("sport");
    expect(discountsOutOfOrder({})).toBeNull();
  });

  it("limite de publications par mois et bornes du mois à Paris", () => {
    expect(postsRemaining(0)).toBe(PRO_POSTS_PER_MONTH);
    expect(postsRemaining(PRO_POSTS_PER_MONTH + 3)).toBe(0);
    const { start, end } = monthBounds(new Date("2026-10-16T10:00:00Z"));
    expect(start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(monthBounds(new Date("2026-12-31T23:30:00Z")).start.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("schémas : activité obligatoire, remise de 1 à 50 %, téléphone", () => {
    const base = { name: "Garage du Port", activities: ["garage"] };
    expect(proCreateSchema.safeParse(base).success).toBe(true);
    expect(proCreateSchema.safeParse({ ...base, activities: [] }).success).toBe(false);
    expect(proCreateSchema.safeParse({ ...base, activities: ["inconnue"] }).success).toBe(false);
    expect(proCreateSchema.safeParse({ ...base, phone: "04 68 00 00 00" }).success).toBe(true);
    expect(proCreateSchema.safeParse({ ...base, phone: "abc" }).success).toBe(false);
    expect(proDiscountsSchema.safeParse({ discounts: { sport: 10, route: null } }).success).toBe(true);
    expect(proDiscountsSchema.safeParse({ discounts: { sport: 60 } }).success).toBe(false);
    expect(proDiscountsSchema.safeParse({ discounts: { sport: 0 } }).success).toBe(false);
  });
});

describe("billetterie", () => {
  const at = new Date("2026-10-16T10:00:00Z");
  const base: TicketingInput = {
    publicAccess: "free_reservation",
    status: "published",
    endsAt: new Date("2026-10-30T18:00:00Z"),
    generalSwitch: true,
    eventSwitch: true,
    remaining: 10,
    paymentsReady: false,
  };

  it("billet gratuit : deux interrupteurs, puis complet, terminé", () => {
    expect(ticketingBlock(base, at)).toBeNull();
    expect(ticketingBlock({ ...base, generalSwitch: false }, at)).toBe("general_off");
    expect(ticketingBlock({ ...base, eventSwitch: false }, at)).toBe("event_off");
    expect(ticketingBlock({ ...base, remaining: 0 }, at)).toBe("sold_out");
    expect(ticketingBlock({ ...base, remaining: null }, at)).toBeNull();
    expect(ticketingBlock({ ...base, status: "draft" }, at)).toBe("not_published");
    expect(ticketingBlock(base, new Date("2026-10-30T18:00:00Z"))).toBe("finished");
    expect(ticketingBlock({ ...base, publicAccess: "free" }, at)).toBe("not_ticketed");
    expect(ticketingBlock({ ...base, publicAccess: "paid_external" }, at)).toBe("not_ticketed");
  });

  it("billet payant : « bientôt » tant que Stripe n'est pas prêt, sans dépendre de l'interrupteur des gratuits", () => {
    const paid: TicketingInput = { ...base, publicAccess: "paid_orasso", generalSwitch: false };
    expect(ticketingBlock(paid, at)).toBe("payments_soon");
    expect(ticketingBlock({ ...paid, paymentsReady: true }, at)).toBeNull();
    expect(ticketingBlock({ ...paid, paymentsReady: true, eventSwitch: false }, at)).toBe("event_off");
  });

  it("commission : arrondie au centime ; mode présentation imposé avant le 21 juin 2027", () => {
    expect(platformFeeCents(1000)).toBe(50);
    expect(platformFeeCents(1234)).toBe(62);
    expect(platformFeeCents(1000, 0)).toBe(0);
    expect(presentationForced(at)).toBe(true);
    expect(presentationForced(PAYMENTS_OPEN_AT)).toBe(false);
  });

  it("schémas : billet payant de 1 à 500 €, 4 billets par commande au plus", () => {
    expect(ticketingUpdateSchema.safeParse({ enabled: true, capacity: 100, priceCents: 500 }).success).toBe(true);
    expect(ticketingUpdateSchema.safeParse({ enabled: true, capacity: 100, priceCents: 50 }).success).toBe(false);
    expect(ticketingUpdateSchema.safeParse({ enabled: true, capacity: 0 }).success).toBe(false);
    expect(ticketCheckSchema.safeParse({ payload: "" }).success).toBe(false);
  });
});

describe("shownDiscount (lot M5, « Pour ta … » du Garage)", () => {
  it("la remise du grade, sinon celle du premier grade au-dessus, sinon rien", () => {
    expect(shownDiscount({ route: 8, sport: 10 }, "route")).toEqual({ percent: 8, from: null });
    expect(shownDiscount({ sport: 10, legende: 15 }, "route")).toEqual({ percent: 10, from: "sport" });
    expect(shownDiscount({ rodage: 5 }, "sport")).toBeNull();
    expect(shownDiscount({}, "rodage")).toBeNull();
  });
});
