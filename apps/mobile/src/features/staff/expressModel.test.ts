import { describe, expect, it } from "vitest";

import { expressIdFor, isUncertainSend } from "./expressModel";

describe("identifiant d'idempotence de l'inscription express", () => {
  it("réseau et 5xx (502, 504…) sont incertains ; une réponse du serveur ne l'est pas", () => {
    expect(isUncertainSend({ status: 0 })).toBe(true);
    expect(isUncertainSend({ status: 502 })).toBe(true);
    expect(isUncertainSend({ status: 504 })).toBe(true);
    expect(isUncertainSend({ status: 429 })).toBe(false);
    expect(isUncertainSend({ status: 423 })).toBe(false);
    expect(isUncertainSend(null)).toBe(false);
  });
  it("après un 502, le nouvel essai de la même adresse garde le même identifiant", () => {
    let n = 0;
    const fresh = () => `id-${++n}`;
    const first = expressIdFor(null, "a@b.fr", fresh);
    expect(first.id).toBe("id-1");
    const retry = expressIdFor(first, "a@b.fr", fresh);
    expect(retry.id).toBe("id-1");
    // Une autre adresse est un autre envoi.
    expect(expressIdFor(first, "autre@b.fr", fresh).id).toBe("id-2");
  });
});
