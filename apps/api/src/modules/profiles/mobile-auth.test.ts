// Accès de l'appli mobile (lot 09) : jeton de session en `Authorization: Bearer` (plugin `bearer`, sans cookie)
// et vérification du pseudo avant l'inscription.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, resetDb, signUp } from "../../../test/helpers";
import { app } from "../../app";
import { pool } from "../../db/client";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
});

describe("Connexion de l'appli mobile", () => {
  it("la connexion renvoie le jeton `set-auth-token`, qui ouvre la session sans cookie", async () => {
    const kenji = await signUp("Kenji_66");
    const login = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: kenji.email, password: "motdepasse-test-123" }),
    });
    expect(login.status).toBe(200);
    const token = login.headers.get("set-auth-token");
    expect(token).toBeTruthy();

    const me = await app.request("/api/me", { headers: { authorization: `Bearer ${token}` } });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { profile: { pseudo: string } };
    expect(body.profile.pseudo).toBe("Kenji_66");

    const anonymous = await app.request("/api/me");
    expect(anonymous.status).toBe(401);
  });
});

describe("GET /api/pseudo-available", () => {
  it("dit si le pseudo est libre, sans tenir compte de la casse, et refuse un format invalide", async () => {
    await signUp("Kenji_66");
    const free = await call(null, "GET", "/pseudo-available?pseudo=Marc.70");
    expect(free.json).toEqual({ valid: true, available: true });
    const taken = await call(null, "GET", "/pseudo-available?pseudo=kenji_66");
    expect(taken.json).toEqual({ valid: true, available: false });
    const invalid = await call(null, "GET", "/pseudo-available?pseudo=a%20b");
    expect(invalid.json).toEqual({ valid: false, available: false });
    const missing = await call(null, "GET", "/pseudo-available");
    expect(missing.json).toEqual({ valid: false, available: false });
  });
});
