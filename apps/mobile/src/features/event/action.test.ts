import { describe, expect, it } from "vitest";

import { type EventActionInput, eventAction } from "./action";

const base: EventActionInput = {
  kind: "fan",
  ownStructure: false,
  hasApplication: false,
  canApply: true,
  full: false,
  block: null,
  hasTicketOffer: false,
  providerCanApply: false,
  cancelled: false,
};

describe("action principale de la fiche selon le profil (lot 44)", () => {
  it("exposant : candidater, puis voir sa candidature", () => {
    expect(eventAction(base)).toEqual({ action: "apply", gate: null });
    expect(eventAction({ ...base, hasApplication: true })).toEqual({ action: "myApplication", gate: null });
    expect(eventAction({ ...base, kind: "guest" }).action).toBe("applyGuest");
  });

  it("visiteur : réserver si billetterie, sinon suivre ; pro : suivre ; prestataire ; média ; organisateur", () => {
    expect(eventAction({ ...base, kind: "visitor", hasTicketOffer: true }).action).toBe("book");
    expect(eventAction({ ...base, kind: "visitor" }).action).toBe("followOrganizer");
    expect(eventAction({ ...base, kind: "pro" }).action).toBe("followOrganizer");
    expect(eventAction({ ...base, kind: "provider", providerCanApply: true }).action).toBe("providerApply");
    expect(eventAction({ ...base, kind: "provider" }).action).toBeNull();
    expect(eventAction({ ...base, kind: "organizer", ownStructure: true }).action).toBe("triage");
    expect(eventAction({ ...base, kind: "organizer" }).action).toBe("apply");
  });

  it("fermé : complet (liste d'attente), clos (raison), pas encore ouvert ; annulé : rien", () => {
    expect(eventAction({ ...base, full: true })).toEqual({ action: null, gate: "full" });
    expect(
      eventAction({
        ...base,
        canApply: false,
        block: { code: "locked", at: "2026-10-24T15:00:00Z", offsetMinutes: 120 },
      }),
    ).toEqual({ action: null, gate: "locked" });
    expect(
      eventAction({ ...base, canApply: false, block: { code: "not_open", opensAt: "2026-10-21T16:00:00Z" } }).gate,
    ).toBe("soon");
    expect(eventAction({ ...base, cancelled: true })).toEqual({ action: null, gate: null });
    // Terminé : la raison, aucune action, quel que soit le profil (sauf le tri de l'organisateur).
    const ended = { ...base, canApply: false, block: { code: "ended" as const } };
    expect(eventAction(ended)).toEqual({ action: null, gate: "ended" });
    expect(eventAction({ ...ended, kind: "visitor" }).gate).toBe("ended");
    expect(eventAction({ ...ended, kind: "organizer", ownStructure: true }).action).toBe("triage");
  });

  it("média : demander l'accréditation si elle est ouverte, sinon rien ; la sienne, quel que soit son état (lot 55)", () => {
    const media = { ...base, kind: "media" as const };
    expect(eventAction(media).action).toBeNull();
    expect(eventAction({ ...media, accreditation: { open: false, mine: null } }).action).toBeNull();
    expect(eventAction({ ...media, accreditation: { open: true, mine: null } }).action).toBe("requestAccreditation");
    expect(eventAction({ ...media, accreditation: { open: true, mine: "cancelled" } }).action).toBe(
      "requestAccreditation",
    );
    for (const mine of ["pending", "accepted", "refused"] as const) {
      expect(eventAction({ ...media, accreditation: { open: false, mine } }).action).toBe("myAccreditation");
    }
    // Terminé ou annulé : aucune action.
    const ended = { ...media, accreditation: { open: true, mine: null }, block: { code: "ended" as const } };
    expect(eventAction(ended)).toEqual({ action: null, gate: "ended" });
    expect(eventAction({ ...media, accreditation: { open: true, mine: null }, cancelled: true }).action).toBeNull();
  });

  it("prestataire qui a déjà candidaté : « Voir ma candidature »", () => {
    expect(eventAction({ ...base, kind: "provider", providerApplied: true, providerCanApply: true }).action).toBe(
      "myProviderApplication",
    );
  });
});
