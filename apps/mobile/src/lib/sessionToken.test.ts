import { describe, expect, it } from "vitest";

import { newSessionToken } from "./sessionToken";

describe("nouveau jeton de session", () => {
  it("n'adopte que l'en-tête set-auth-token, jamais le jeton du corps", () => {
    expect(newSessionToken(new Headers({ "set-auth-token": "nouveau" }))).toBe("nouveau");
    expect(newSessionToken(new Headers())).toBeNull();
  });
});
