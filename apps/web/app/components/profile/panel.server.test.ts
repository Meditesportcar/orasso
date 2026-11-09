import { describe, expect, it } from "vitest";

import type { ApiResult } from "../../lib/api.server";
import { isPanelFailure } from "./panel";
import { mainOrFailure } from "./panel.server";

// Lot R7b1, tour 2 : la panne d'un panneau du Profil n'emporte que lui ; la session expirée renvoie à la connexion.
const req = new Request("http://localhost/app/moi?onglet=garage");
const ok = <T>(data: T): ApiResult<T> => ({ ok: true, status: 200, data, headers: new Headers() });
const fail = (status: number): ApiResult<never> => ({
  ok: false,
  status,
  error: { code: "x", message: "boum" },
  headers: new Headers(),
});

describe("panneaux du Profil", () => {
  it("lecture réussie : le contenu", () => {
    expect(mainOrFailure(req, ok([1, 2]))).toEqual({ data: [1, 2] });
  });

  it("erreur (500, 503, 404) : la panne du panneau, rien n'est levé", () => {
    for (const status of [404, 500, 503]) {
      const out = mainOrFailure(req, fail(status));
      expect(isPanelFailure(out)).toBe(true);
      expect(out).toEqual({ failed: true, status });
    }
  });

  it("session expirée (401) : renvoi à la connexion", () => {
    let thrown: unknown;
    try {
      mainOrFailure(req, fail(401));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get("location")).toContain("/connexion");
  });

  it("un contenu n'est pas une panne", () => {
    expect(isPanelFailure({ vehicles: [] })).toBe(false);
    expect(isPanelFailure(null)).toBe(false);
  });
});
