// Lot 35c : billetterie de l'organisateur dans l'appli (formulaire → corps de l'API, mêmes règles que le site).
import type { EventTicketing, Membership } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { euros, formOf, isStructureOwner, isTicketed, priceText, stripeStep, ticketingBody } from "./ticketing";

const base: EventTicketing = {
  enabled: false,
  publicAccess: "free_reservation",
  name: "Entrée",
  capacity: null,
  priceCents: null,
  sold: 0,
  used: 0,
  generalSwitch: true,
  block: "event_off",
  blockLabel: "La billetterie n'est pas ouverte pour cet événement",
  stripe: { configured: false, mode: "off", connected: false, accountHint: null },
  presentationMode: true,
};

describe("prix", () => {
  it("s'écrit en euros avec une virgule, sans zéros inutiles", () => {
    expect(priceText(null)).toBe("");
    expect(priceText(1250)).toBe("12,50");
    expect(priceText(1200)).toBe("12");
    expect(priceText(100)).toBe("1");
    expect(euros(1250)).toBe("12,50 €");
  });
});

describe("corps de `PUT /events/:id/ticketing`", () => {
  it("billet gratuit : nom par défaut, places vides = sans limite, aucun prix", () => {
    const res = ticketingBody({ enabled: true, name: "  ", capacity: "", price: "9" }, false);
    expect(res).toEqual({ body: { enabled: true, capacity: null, priceCents: null, name: "Entrée" } });
  });

  it("billet gratuit avec places", () => {
    const res = ticketingBody({ enabled: true, name: "Entrée visiteur", capacity: "120", price: "" }, false);
    expect(res).toEqual({ body: { enabled: true, capacity: 120, priceCents: null, name: "Entrée visiteur" } });
  });

  it("billet payant : virgule ou point, de 1 à 500 €", () => {
    expect(ticketingBody({ enabled: true, name: "Entrée", capacity: "", price: "12,50" }, true)).toMatchObject({
      body: { priceCents: 1250 },
    });
    expect(ticketingBody({ enabled: true, name: "Entrée", capacity: "", price: "7.9" }, true)).toMatchObject({
      body: { priceCents: 790 },
    });
    expect(ticketingBody({ enabled: true, name: "Entrée", capacity: "", price: "500 €" }, true)).toMatchObject({
      body: { priceCents: 50_000 },
    });
    for (const price of ["0,50", "501", "abc"]) {
      expect(ticketingBody({ enabled: true, name: "Entrée", capacity: "", price }, true)).toHaveProperty("error");
    }
  });

  it("billet payant ouvert sans prix : refusé ; fermé sans prix : accepté", () => {
    expect(ticketingBody({ enabled: true, name: "Entrée", capacity: "", price: "" }, true)).toEqual({
      error: "Indique le prix du billet.",
    });
    expect(ticketingBody({ enabled: false, name: "Entrée", capacity: "", price: "" }, true)).toMatchObject({
      body: { enabled: false, priceCents: null },
    });
  });

  it("places invalides et nom trop court : message, pas de corps", () => {
    for (const capacity of ["0", "-3", "2,5", "beaucoup"]) {
      expect(ticketingBody({ enabled: true, name: "Entrée", capacity, price: "" }, false)).toHaveProperty("error");
    }
    expect(ticketingBody({ enabled: true, name: "E", capacity: "", price: "" }, false)).toHaveProperty("error");
  });

  it("le formulaire d'ouverture reprend les réglages de l'API", () => {
    const form = formOf({ ...base, enabled: true, capacity: 80, priceCents: 1500, name: "Pass" });
    expect(form).toEqual({ enabled: true, name: "Pass", capacity: "80", price: "15" });
    expect(ticketingBody(form, true)).toMatchObject({ body: { capacity: 80, priceCents: 1500, name: "Pass" } });
  });
});

describe("accès et Stripe", () => {
  it("seules la réservation gratuite et la billetterie Orasso ouvrent la billetterie", () => {
    expect(isTicketed("free_reservation")).toBe(true);
    expect(isTicketed("paid_orasso")).toBe(true);
    for (const access of ["free", "paid_external", "closed"]) expect(isTicketed(access)).toBe(false);
  });

  it("le propriétaire actif de la structure seulement connecte le compte Stripe", () => {
    const member = (structureId: string, role: "owner" | "co_organizer" | "staff", status = "active") =>
      ({ structureId, role, status }) as Membership;
    expect(isStructureOwner([member("s1", "owner")], "s1")).toBe(true);
    expect(isStructureOwner([member("s1", "co_organizer")], "s1")).toBe(false);
    expect(isStructureOwner([member("s1", "staff")], "s1")).toBe(false);
    expect(isStructureOwner([member("s2", "owner")], "s1")).toBe(false);
    expect(isStructureOwner([member("s1", "owner", "removed")], "s1")).toBe(false);
    expect(isStructureOwner(undefined, "s1")).toBe(false);
  });

  it("étape du compte Stripe : bientôt, à connecter, connecté", () => {
    expect(stripeStep(base.stripe)).toBe("soon");
    expect(stripeStep({ configured: true, mode: "test", connected: false, accountHint: null })).toBe("connect");
    expect(stripeStep({ configured: true, mode: "test", connected: true, accountHint: "acct_…1234" })).toBe(
      "connected",
    );
  });
});
