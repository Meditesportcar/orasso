// Aperçu des e-mails (`GET /dev/mail`, lot 56) : réservé au développement. Garde de production : 404 partout ailleurs.
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { pool } from "../../db/client";
import { env } from "../../env";

const mutableEnv = env as { NODE_ENV: string };
const initial = env.NODE_ENV;

afterEach(() => {
  mutableEnv.NODE_ENV = initial;
});
afterAll(async () => {
  await pool.end();
});

describe("GET /dev/mail", () => {
  it("404 hors développement (test et production), sans rien révéler", async () => {
    const { app } = await import("../../app");
    for (const mode of ["test", "production"]) {
      mutableEnv.NODE_ENV = mode;
      const res = await app.request("/api/dev/mail");
      expect(res.status, mode).toBe(404);
      expect(await res.text(), mode).not.toContain("Orasso</strong>");
    }
  });

  it("200 en développement : un exemple par type d'envoi, avec sujet et HTML", async () => {
    const { app } = await import("../../app");
    mutableEnv.NODE_ENV = "development";
    const res = await app.request("/api/dev/mail");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string; subject: string; html: string }[] };
    expect(body.items.length).toBeGreaterThanOrEqual(8);
    expect(body.items.every((i) => i.subject && i.html.includes("<html"))).toBe(true);
    expect(body.items.map((i) => i.id)).not.toContain("backup_code");
  });
});
