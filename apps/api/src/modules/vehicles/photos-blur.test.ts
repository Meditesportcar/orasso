// Floutage de plaque (lot 51) : rectangles validés, zone modifiée, reste de la photo intact, irréversible.
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, resetDb, seedReference, signUp, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { pool } from "../../db/client";
import { blurPlateRegions, coveredBy, plateBox } from "./photos-blur";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  useClock(new Date("2026-10-19T10:00:00Z"));
  ref = await seedReference();
});

const car = () => ({
  vehicleType: "car",
  makeId: ref.makeId,
  modelId: ref.modelId,
  generationId: ref.generationId,
  year: 1995,
  plate: "ab-123-cd",
});

/** Damier 400 × 200 : des détails fins que la pixellisation efface forcément (une teinte unie resterait unie). */
async function checker(width = 400, height = 200): Promise<Buffer> {
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

async function pixels(buf: Buffer) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Écart moyen absolu entre deux images de même taille, sur une zone en pixels. */
function diff(
  a: { data: Buffer; width: number },
  b: { data: Buffer; width: number },
  box: { left: number; top: number; width: number; height: number },
) {
  let sum = 0;
  for (let y = box.top; y < box.top + box.height; y++) {
    for (let x = box.left; x < box.left + box.width; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * a.width + x) * 3 + c;
        sum += Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0));
      }
    }
  }
  return sum / (box.width * box.height * 3);
}

async function upload(u: { cookie: string }, vehicleId: string, image: Buffer, plateRects?: unknown) {
  const form = new FormData();
  form.append("photo", new File([new Uint8Array(image)], "auto.png", { type: "image/png" }));
  if (plateRects !== undefined) form.append("plateRects", JSON.stringify(plateRects));
  return app.request(`/api/me/vehicles/${vehicleId}/photos`, {
    method: "POST",
    body: form,
    headers: { cookie: u.cookie },
  });
}

async function stored(url: string) {
  const res = await app.request(url);
  expect(res.status).toBe(200);
  return Buffer.from(await res.arrayBuffer());
}

describe("règles pures", () => {
  it("rectangle normalisé → pixels bornés à l'image", () => {
    expect(plateBox({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 400, 200)).toEqual({
      left: 100,
      top: 100,
      width: 200,
      height: 50,
    });
    expect(plateBox({ x: 0.999, y: 0.999, w: 0.01, h: 0.01 }, 400, 200)).toEqual({
      left: 399,
      top: 199,
      width: 1,
      height: 1,
    });
  });

  it("un rectangle déjà couvert n'est pas refloué", () => {
    const applied = [{ x: 0.2, y: 0.2, w: 0.4, h: 0.3 }];
    expect(coveredBy({ x: 0.25, y: 0.25, w: 0.2, h: 0.1 }, applied)).toBe(true);
    expect(coveredBy({ x: 0.1, y: 0.25, w: 0.2, h: 0.1 }, applied)).toBe(false);
  });

  it("la zone change, le reste de l'image est identique", async () => {
    const src = await checker();
    const out = await blurPlateRegions(await sharp(src).webp({ lossless: true }).toBuffer(), [
      { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    ]);
    const before = await pixels(await sharp(src).webp({ quality: 80 }).toBuffer());
    const after = await pixels(out.data);
    expect(diff(before, after, { left: 110, top: 60, width: 180, height: 80 })).toBeGreaterThan(40);
    // Hors de la zone : seule la compression WebP joue (écart minime).
    expect(diff(before, after, { left: 0, top: 0, width: 90, height: 40 })).toBeLessThan(6);
    expect(diff(before, after, { left: 320, top: 160, width: 80, height: 40 })).toBeLessThan(6);
  });
});

describe("POST /me/vehicles/:id/photos (plateRects) et /photos/:photoId/blur", () => {
  it("rectangles à l'envoi : photo stockée floutée, pastille plateBlurred", async () => {
    const u = await signUp("Flou_01");
    const v = await call(u, "POST", "/me/vehicles", car());
    const src = await checker();
    const res = await upload(u, v.json.id, src, [{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }]);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { photos: { url: string; plateBlurred: boolean }[] };
    expect(body.photos[0]?.plateBlurred).toBe(true);
    const plain = await upload(u, v.json.id, src);
    const both = (await plain.json()) as { photos: { url: string; plateBlurred: boolean }[] };
    expect(both.photos[1]?.plateBlurred).toBe(false);
    const blurred = await pixels(await stored(both.photos[0]?.url ?? ""));
    const clear = await pixels(await stored(both.photos[1]?.url ?? ""));
    expect(diff(blurred, clear, { left: 110, top: 60, width: 180, height: 80 })).toBeGreaterThan(40);
    expect(diff(blurred, clear, { left: 0, top: 0, width: 90, height: 40 })).toBeLessThan(6);
  });

  it("rectangle hors de l'image, JSON illisible ou plus de 4 cadres : 400", async () => {
    const u = await signUp("Flou_02");
    const v = await call(u, "POST", "/me/vehicles", car());
    const src = await checker();
    expect((await upload(u, v.json.id, src, [{ x: 0.8, y: 0.1, w: 0.5, h: 0.2 }])).status).toBe(400);
    const form = new FormData();
    form.append("photo", new File([new Uint8Array(src)], "auto.png", { type: "image/png" }));
    form.append("plateRects", "{pas du json");
    const bad = await app.request(`/api/me/vehicles/${v.json.id}/photos`, {
      method: "POST",
      body: form,
      headers: { cookie: u.cookie },
    });
    expect(bad.status).toBe(400);
    const five = Array.from({ length: 5 }, () => ({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }));
    expect((await upload(u, v.json.id, src, five)).status).toBe(400);
    const photo = await upload(u, v.json.id, src);
    const id = ((await photo.json()) as { photos: { id: string }[] }).photos[0]?.id;
    const out = await call(u, "POST", `/me/vehicles/${v.json.id}/photos/${id}/blur`, {
      rects: [{ x: 0.5, y: 0.9, w: 0.2, h: 0.2 }],
    });
    expect(out.status).toBe(400);
    expect((await call(u, "POST", `/me/vehicles/${v.json.id}/photos/${id}/blur`, { rects: [] })).status).toBe(400);
  });

  it("floutage après coup : propriétaire seulement, nouvelle adresse, zone modifiée, rejouer ne change rien", async () => {
    const u = await signUp("Flou_03");
    const other = await signUp("Flou_04");
    const v = await call(u, "POST", "/me/vehicles", car());
    const src = await checker();
    const sent = (await (await upload(u, v.json.id, src)).json()) as { photos: { id: string; url: string }[] };
    const photo = sent.photos[0];
    if (!photo) throw new Error("photo absente");
    const before = await pixels(await stored(photo.url));
    const rects = [{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }];

    expect((await call(other, "POST", `/me/vehicles/${v.json.id}/photos/${photo.id}/blur`, { rects })).status).toBe(
      404,
    );

    const res = await call(u, "POST", `/me/vehicles/${v.json.id}/photos/${photo.id}/blur`, { rects });
    expect(res.status).toBe(200);
    const after = res.json.photos[0] as { id: string; url: string; plateBlurred: boolean };
    expect(after.id).toBe(photo.id);
    expect(after.plateBlurred).toBe(true);
    expect(after.url).not.toBe(photo.url);
    // Irréversible : l'ancienne photo n'existe plus.
    expect((await app.request(photo.url)).status).toBe(404);
    const blurred = await pixels(await stored(after.url));
    expect(diff(before, blurred, { left: 110, top: 60, width: 180, height: 80 })).toBeGreaterThan(40);
    expect(diff(before, blurred, { left: 0, top: 0, width: 90, height: 40 })).toBeLessThan(6);

    // Même cadre (ou un cadre inclus) : rien n'est réécrit.
    const again = await call(u, "POST", `/me/vehicles/${v.json.id}/photos/${photo.id}/blur`, {
      rects: [{ x: 0.3, y: 0.3, w: 0.2, h: 0.2 }],
    });
    expect(again.status).toBe(200);
    expect(again.json.photos[0].url).toBe(after.url);
  });
});
