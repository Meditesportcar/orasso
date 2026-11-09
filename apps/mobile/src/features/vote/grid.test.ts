import type { VoteCandidate } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { gridOrder } from "./grid";

const cand = (applicationId: string, eligible = true): VoteCandidate => ({
  applicationId,
  vehicleLabel: `Voiture ${applicationId}`,
  pseudo: `P_${applicationId}`,
  photoUrl: null,
  eligible,
});

describe("l'ordre de la grille d'un vote", () => {
  it("stable, sans rapport avec le classement : par identifiant de candidature", () => {
    const out = gridOrder([cand("c"), cand("a"), cand("b")]).map((e) => e.applicationId);
    expect(out).toEqual(["a", "b", "c"]);
    // Même liste dans un autre ordre d'arrivée : même grille (les numéros « N° 1 » ne bougent pas).
    expect(gridOrder([cand("b"), cand("c"), cand("a")]).map((e) => e.applicationId)).toEqual(out);
  });

  it("un candidat pas encore entré (grisé) passe après ceux qui peuvent recevoir une voix", () => {
    const out = gridOrder([cand("a", false), cand("c"), cand("b")]);
    expect(out.map((e) => [e.applicationId, e.eligible])).toEqual([
      ["b", true],
      ["c", true],
      ["a", false],
    ]);
  });

  it("ne modifie pas la liste reçue", () => {
    const input = [cand("b"), cand("a")];
    gridOrder(input);
    expect(input.map((e) => e.applicationId)).toEqual(["b", "a"]);
  });
});
