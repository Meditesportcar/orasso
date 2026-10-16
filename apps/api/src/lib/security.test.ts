// Recette de sécurité (lot 12) : limites de débit des routes sensibles et en-têtes HTTP de l'API.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, signUp } from "../../test/helpers";
import { pool } from "../db/client";
import { notificationsService } from "../modules/notifications/service";
import { rateLimit, rateRules } from "./rateLimit";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
});

describe("limites de débit", () => {
  it("fenêtre fixe par utilisateur : 429 rate_limited au-delà du maximum, puis à nouveau permis", () => {
    const t = 1_000_000;
    for (let i = 0; i < rateRules.accountQrVerify.max; i++) rateLimit("accountQrVerify", "u1", t);
    expect(() => rateLimit("accountQrVerify", "u1", t)).toThrow(/Trop de vérifications/);
    expect(() => rateLimit("accountQrVerify", "u2", t)).not.toThrow(); // autre utilisateur
    expect(() => rateLimit("accountQrVerify", "u1", t + rateRules.accountQrVerify.windowMs)).not.toThrow();
  });

  it("vérification du QR de compte : 30 par minute puis 429", async () => {
    const u = await signUp("Verif_66");
    for (let i = 0; i < 30; i++) {
      expect((await call(u, "POST", "/account-qr/verify", { payload: "ORC1-XXXX" })).status).toBe(200);
    }
    const blocked = await call(u, "POST", "/account-qr/verify", { payload: "ORC1-XXXX" });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error).toMatchObject({ code: "rate_limited" });
    expect(blocked.json.error.details.retryAfter).toBeGreaterThan(0);
  });

  it("sondage de plaque par l'ajout de véhicules : 20 par heure puis 429", async () => {
    const u = await signUp("Sonde_66");
    for (let i = 0; i < 20; i++) expect((await call(u, "POST", "/me/vehicles", {})).status).toBe(400);
    expect((await call(u, "POST", "/me/vehicles", {})).status).toBe(429);
  });
});

describe("en-têtes HTTP", () => {
  it("nosniff, pas d'encadrement, pas de référent, pas de HSTS (posé par nginx)", async () => {
    const res = await call(null, "GET", "/health");
    expect(res.status).toBe(200);
    const raw = await (await import("../app")).app.request("/api/health");
    expect(raw.headers.get("x-content-type-options")).toBe("nosniff");
    expect(raw.headers.get("x-frame-options")).toBe("DENY");
    expect(raw.headers.get("referrer-policy")).toBe("no-referrer");
    expect(raw.headers.get("strict-transport-security")).toBeNull();
    expect(raw.headers.get("cross-origin-resource-policy")).toBeNull();
  });
});
