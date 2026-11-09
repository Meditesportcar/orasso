import { presenceLabels as L } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { refusalMeansPresent, refusalMessage } from "./presenceRefusal";

class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

describe("refus de la présence par GPS", () => {
  it("le libellé du code ; « C'est complet » quand l'API le dit", () => {
    expect(refusalMessage(new ApiRequestError(409, "ticket_required", L.errors.ticket_required))).toMatchObject({
      message: L.errors.ticket_required,
      refusal: true,
    });
    expect(refusalMessage(new ApiRequestError(409, "ticket_required", L.ticketRequiredFull))).toMatchObject({
      message: L.ticketRequiredFull,
      code: "ticket_required",
      refusal: true,
    });
  });
  it("closed : un refus qui laisse réessayer (le texte le dit)", () => {
    const r = refusalMessage(new ApiRequestError(409, "closed", L.errors.closed));
    expect(r.message).toContain("réessayer");
  });
  it("une erreur inconnue n'est pas un refus", () => {
    expect(refusalMessage(new Error("boom"))).toMatchObject({ message: L.genericFailure, refusal: false });
  });
  it("réponse perdue puis nouvel essai : « déjà présent » relit la fiche", () => {
    const r = refusalMessage(new ApiRequestError(409, "already_present", L.errors.already_present));
    expect(refusalMeansPresent(r.code)).toBe(true);
    expect(refusalMeansPresent("out_of_zone")).toBe(false);
  });
});
