// Dette R7 § 8 : une déconnexion que l'API n'a pas confirmée (503) efface quand même le cookie de session du navigateur
// et le dit ; une déconnexion réussie ne change rien.
import { beforeEach, describe, expect, it, vi } from "vitest";

let outcome: { ok: boolean; status: number };
vi.mock("../lib/api.server", () => ({
  api: async () => ({ ...outcome, headers: new Headers() }),
  safeReturn: (v: string, f: string) => (v.startsWith("/") ? v : f),
  withCookies: (from: Headers, to: Headers = new Headers()) => {
    for (const c of from.getSetCookie()) to.append("set-cookie", c);
    return to;
  },
}));

const post = () => {
  const body = new URLSearchParams({ retour: "/app" });
  return new Request("http://site.test/deconnexion", { method: "POST", body });
};

beforeEach(() => {
  outcome = { ok: true, status: 200 };
});

describe("action de déconnexion", () => {
  it("API en panne : cookie de session effacé et retour sur la connexion avec l'avertissement", async () => {
    outcome = { ok: false, status: 503 };
    const { action } = await import("./deconnexion");
    const res = (await action({ request: post() } as never)) as Response;
    expect(res.headers.get("location")).toBe("/connexion?deconnexion-echec=1");
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => /^better-auth\.session_token=;.*Max-Age=0/.test(c))).toBe(true);
    expect(cookies.some((c) => /^__Secure-better-auth\.session_token=;.*Max-Age=0/.test(c))).toBe(true);
  });

  it("API disponible : redirection normale, pas d'avertissement", async () => {
    const { action } = await import("./deconnexion");
    const res = (await action({ request: post() } as never)) as Response;
    expect(res.headers.get("location")).toBe("/app");
  });
});
