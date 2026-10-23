import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SHARE_SIZES, shareFormats, shareSafeBands, shareStyles } from "@orasso/shared";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { fitNameLine, renderStory, type StoryInput, storyLayout } from "./share-story";

// Affiche à partager (lot 50 ; lot M6, maquettes 2.1 à 2.3) : formats story 9:16 et post 4:5, trois styles, aucun
// texte dans les marges qu'Instagram recouvre, nom du véhicule sur une seule ligne quelle que soit sa longueur.
async function cover() {
  // Une « photo » carrée très contrastée.
  return sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#7a5c2e" } })
    .composite([
      {
        input: await sharp({ create: { width: 600, height: 600, channels: 3, background: "#ff0000" } })
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}

const LONG = "Mercedes-AMG GT 63 S E Performance 4MATIC+";

const base = (over: Partial<StoryInput> = {}): StoryInput => ({
  format: "story",
  style: "night",
  photo: null,
  name: "GR Supra",
  line: "Toyota · A90 · Blanche",
  tags: ["JDM", "Sportive", "Japonaise"],
  stats: [
    { label: "Puissance", value: "340", unit: "ch" },
    { label: "Poids", value: "1 495", unit: "kg" },
    { label: "Année", value: "2021" },
  ],
  certified: true,
  pseudo: "Kenji_66",
  findIt: "Retrouve-la sur",
  site: "orasso.fr",
  qrUrl: "https://orasso.fr/v/00000000-0000-0000-0000-000000000000",
  ...over,
});

describe("affiche à partager", () => {
  for (const format of shareFormats) {
    it.each(shareStyles)(`${format}, style %s : dimensions du format`, async (style) => {
      const png = await renderStory(base({ format, style, photo: await cover() }));
      const meta = await sharp(png).metadata();
      expect([meta.width, meta.height]).toEqual([SHARE_SIZES[format].width, SHARE_SIZES[format].height]);
      const out = process.env.SHARE_OUT;
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, `${format}-${style}.png`), png);
      }
    });
  }

  it("story : marges d'Instagram de 13 % en haut et 15 % en bas", () => {
    expect(shareSafeBands(1920)).toEqual({ top: 250, bottom: 288 });
  });

  it("story : aucun texte, étiquette, logo ni QR dans les marges masquées, nom très long compris", async () => {
    for (const name of ["GTI", "GR Supra", LONG]) {
      for (const certified of [true, false]) {
        const { frame, placed } = await storyLayout(base({ name, certified }));
        for (const p of placed) {
          if (p.kind === "shadow" || p.kind === "halo") continue;
          expect(p.top, `${p.kind} sous la marge du haut (${name})`).toBeGreaterThanOrEqual(frame.bands.top);
          expect(p.bottom, `${p.kind} au-dessus de la marge du bas (${name})`).toBeLessThanOrEqual(
            frame.H - frame.bands.bottom,
          );
        }
      }
    }
  });

  it("le nom tient sur une seule ligne, dans la largeur, et le corps baisse avec sa longueur", async () => {
    const width = 936;
    const short = await fitNameLine("GR Supra", width, 140, "#f3ebdd");
    const long = await fitNameLine(LONG, width, 140, "#f3ebdd");
    expect(short.size).toBeGreaterThan(120);
    expect(short.font).toBe("expanded");
    expect(short.image.width).toBeLessThanOrEqual(width);
    expect(long.size).toBeLessThan(140);
    expect(long.image.width).toBeLessThanOrEqual(width);
    // Une seule ligne : la hauteur de l'image reste celle d'une ligne de ce corps.
    expect(long.image.height).toBeLessThan(long.size * 1.6);
  });

  it("sans chiffres, sans photo, sans certification : le rendu passe ; le sceau n'apparaît qu'avec la certification", async () => {
    const png = await renderStory(base({ photo: null, stats: [], tags: [], certified: false }));
    expect((await sharp(png).metadata()).height).toBe(1920);
    const plain = await storyLayout(base({ certified: false }));
    expect(plain.placed.some((p) => p.kind === "seal")).toBe(false);
    const certified = await storyLayout(base({ certified: true }));
    expect(certified.placed.some((p) => p.kind === "seal")).toBe(true);
  });

  it("le filet de sécurité floute les zones demandées sur l'affiche composée", async () => {
    const photo = await cover();
    const clear = await renderStory(base({ photo }));
    const masked = await renderStory(base({ photo, masks: [{ x: 0.05, y: 0.06, w: 0.3, h: 0.08 }] }));
    const crop = (png: Buffer) =>
      sharp(png).extract({ left: 54, top: 115, width: 324, height: 154 }).raw().toBuffer({ resolveWithObject: true });
    const [a, b] = await Promise.all([crop(clear), crop(masked)]);
    expect(Buffer.compare(a.data, b.data)).not.toBe(0);
  });
});
