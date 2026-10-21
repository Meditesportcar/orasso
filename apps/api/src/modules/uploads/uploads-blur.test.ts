// Lot 57 (D28) : photo d'un contenu média, plaques floutées à l'envoi si le média le demande (facultatif).
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, signUp, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { pool } from "../../db/client";
import { storage } from "../../lib/storage";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(new Date("2026-10-21T10:00:00Z"));
});

/** Damier 400 × 200 : la pixellisation efface forcément ses détails fins. */
async function checker(): Promise<Buffer> {
  const width = 400;
  const height = 200;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      raw.fill(on ? 240 : 20, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

async function send(cookie: string, purpose: string, plateRects?: unknown) {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(await checker())], "photo.png", { type: "image/png" }));
  if (plateRects !== undefined) form.append("plateRects", JSON.stringify(plateRects));
  return app.request("/api/me/uploads", { method: "POST", body: form, headers: { cookie } });
}

/** Écart-type des pixels d'une zone (un damier net varie beaucoup, une zone floutée presque plus). */
async function spread(key: string, box: { left: number; top: number; width: number; height: number }) {
  const file = await storage.get(key);
  if (!file) throw new Error(`Fichier absent : ${key}`);
  const { data } = await sharp(file).extract(box).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mean = data.reduce((s, v) => s + v, 0) / data.length;
  return Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
}

describe("POST /me/uploads : floutage facultatif d'une photo de contenu média (D28)", () => {
  it("floute la zone demandée et laisse le reste intact ; sans rectangle, rien n'est flouté", async () => {
    const u = await signUp("leo");
    const blurred = await send(u.cookie, "media_content", [{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }]);
    expect(blurred.status).toBe(201);
    const { key } = (await blurred.json()) as { key: string };
    const inside = { left: 120, top: 70, width: 160, height: 60 };
    const outside = { left: 0, top: 0, width: 80, height: 40 };
    expect(await spread(key, inside)).toBeLessThan(40);
    expect(await spread(key, outside)).toBeGreaterThan(80);

    const plain = await send(u.cookie, "media_content");
    expect(plain.status).toBe(201);
    const { key: plainKey } = (await plain.json()) as { key: string };
    expect(await spread(plainKey, inside)).toBeGreaterThan(80);
  });

  it("refuse les rectangles pour un autre usage, et un JSON illisible", async () => {
    const u = await signUp("leo");
    expect((await send(u.cookie, "message", [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }])).status).toBe(400);
    const form = new FormData();
    form.append("purpose", "media_content");
    form.append("file", new File([new Uint8Array(await checker())], "photo.png", { type: "image/png" }));
    form.append("plateRects", "{pas du json");
    const res = await app.request("/api/me/uploads", { method: "POST", body: form, headers: { cookie: u.cookie } });
    expect(res.status).toBe(400);
  });
});
