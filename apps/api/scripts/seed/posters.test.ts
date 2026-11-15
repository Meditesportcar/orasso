// Lot B3b : reconnaître l'ancien dégradé factice des affiches de démonstration (D34), et le choix stable d'une photo par slug.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FAKE_PHOTO_COLORS, fakePhotoWebp } from "./helpers";
import { demoEventPhotos, isLegacyFakePhoto, slugIndex } from "./photos";
import { SEED_EVENT_SLUG_PREFIXES, SEED_EVENT_SLUGS } from "./seed-scope";

describe("isLegacyFakePhoto", () => {
  it.each([...FAKE_PHOTO_COLORS, "#ffffff"])("reconnaît le dégradé factice %s", async (color) => {
    expect(await isLegacyFakePhoto((await fakePhotoWebp(color)).data)).toBe(true);
  });

  it("ne prend jamais une vraie photo pour le dégradé, même redimensionnée en 1200 × 800", async () => {
    const photos = await demoEventPhotos();
    expect(photos.length).toBeGreaterThan(0);
    for (const p of photos) {
      expect(await isLegacyFakePhoto(p.data), p.name).toBe(false);
      const same = await sharp(p.data).resize(1200, 800, { fit: "cover" }).webp({ quality: 70 }).toBuffer();
      expect(await isLegacyFakePhoto(same), `${p.name} 1200×800`).toBe(false);
    }
  });

  it("contre-exemples sombres 1200 × 800 : aplats #17191c et #0d0e10, dégradé sans formes, photo de nuit granuleuse", async () => {
    const flat = (c: string) =>
      sharp({ create: { width: 1200, height: 800, channels: 3, background: c } })
        .webp()
        .toBuffer();
    expect(await isLegacyFakePhoto(await flat("#17191c"))).toBe(false);
    expect(await isLegacyFakePhoto(await flat("#0d0e10"))).toBe(false);
    const gradient = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b5452a"/><stop offset="1" stop-color="#17191C"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/></svg>',
      ),
    )
      .webp({ quality: 70 })
      .toBuffer();
    expect(await isLegacyFakePhoto(gradient)).toBe(false);
    const noise = Buffer.alloc(1200 * 800 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 29; // nuit : très sombre, grain
    const night = await sharp(noise, { raw: { width: 1200, height: 800, channels: 3 } })
      .webp({ quality: 70 })
      .toBuffer();
    expect(await isLegacyFakePhoto(night)).toBe(false);
  });

  it("une image de 1200 × 800 unie, un buffer illisible et une autre taille : pas le dégradé", async () => {
    const flat = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#b5452a" } })
      .webp()
      .toBuffer();
    expect(await isLegacyFakePhoto(flat)).toBe(false);
    expect(await isLegacyFakePhoto(Buffer.from("pas une image"))).toBe(false);
    const small = await sharp((await fakePhotoWebp("#b5452a")).data)
      .resize(600, 400)
      .webp()
      .toBuffer();
    expect(await isLegacyFakePhoto(small)).toBe(false);
  });
});

describe("choix par slug", () => {
  it("stable, dans les bornes, et varié", () => {
    const slugs = [...SEED_EVENT_SLUGS];
    const picks = slugs.map((s) => slugIndex(s, 7));
    expect(picks).toEqual(slugs.map((s) => slugIndex(s, 7)));
    expect(picks.every((n) => n >= 0 && n < 7)).toBe(true);
    expect(new Set(picks).size).toBeGreaterThan(3);
    expect(slugIndex("x", 0)).toBe(0);
  });

  it("la liste des slugs de la graine est sans doublon", () => {
    expect(new Set(SEED_EVENT_SLUGS).size).toBe(SEED_EVENT_SLUGS.length);
    expect(SEED_EVENT_SLUG_PREFIXES).toEqual(["msc-edition-"]);
  });
});
