// Fichiers publics `/api/files/*` (lot R5c1, tour 2, défaut antérieur au lot) : une clé publique de forme stricte est
// servie ; `private/…` ne l'est jamais, quelle que soit sa graphie (`//`, `%2F`, `\`, `%5C`, `./`, `..`, majuscules).
// `pathOf` garde tout chemin sous le dossier de stockage.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "./app";
import { pool } from "./db/client";
import { pathOf, storage } from "./lib/storage";

afterAll(async () => {
  await pool.end();
});

const PUBLIC = "vehicles/0f0f0f0f-test/abc123-photo.webp";
const PRIVATE = "private/crew-posts/11111111-2222-4333-8444-555555555555.webp";
const PROOF = "private/verification/s1/0123456789abcdef.png";

beforeAll(async () => {
  await storage.put(PUBLIC, Buffer.from("public"));
  await storage.put(PRIVATE, Buffer.from("secret du crew"));
  await storage.put(PROOF, Buffer.from("justificatif"));
});

describe("GET /api/files/*", () => {
  it("sert une clé publique normale", async () => {
    const res = await app.request(`/api/files/${PUBLIC}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(await res.text()).toBe("public");
  });

  it.each([
    `/api/files/${PRIVATE}`,
    `/api/files//${PRIVATE}`,
    `/api/files///${PRIVATE}`,
    `/api/files/%2F${PRIVATE}`,
    `/api/files/%2f${PRIVATE}`,
    `/api/files/%5C${PRIVATE}`,
    `/api/files/private%2Fcrew-posts%2F11111111-2222-4333-8444-555555555555.webp`,
    `/api/files/./${PRIVATE}`,
    `/api/files/vehicles/../${PRIVATE}`,
    `/api/files/private/../${PRIVATE}`,
    `/api/files/vehicles/..%2F${PRIVATE}`,
    `/api/files/PRIVATE/crew-posts/11111111-2222-4333-8444-555555555555.webp`,
    `/api/files/Private/crew-posts/11111111-2222-4333-8444-555555555555.webp`,
    `/api/files//${PROOF}`,
    `/api/files/%2F${PROOF}`,
    "/api/files/vehicles/0f0f0f0f-test/ABC123-photo.webp",
    "/api/files/vehicles/0f0f0f0f-test/abc123-photo.webp%00",
  ])("refuse %s", async (path) => {
    const res = await app.request(path);
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toContain("secret du crew");
    expect(text).not.toContain("justificatif");
  });
});

describe("pathOf", () => {
  it("garde le chemin sous le dossier de stockage", () => {
    expect(() => pathOf(PUBLIC)).not.toThrow();
    expect(() => pathOf(PRIVATE)).not.toThrow();
    for (const bad of [
      "",
      `/${PRIVATE}`,
      `//${PRIVATE}`,
      `./${PRIVATE}`,
      `private/../${PRIVATE}`,
      "../outside.webp",
      "a//b.webp",
      "a\\b.webp",
      "a/\u0000.webp",
      "a/\nb.webp",
    ]) {
      expect(() => pathOf(bad), bad).toThrow("Clé de stockage invalide");
    }
  });
});
