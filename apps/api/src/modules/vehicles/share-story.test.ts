import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SHARE_SIZES, shareSafeBands, shareStyles } from "@orasso/shared";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { renderStory, STORY_COLORS, type StoryInput, storyLayout } from "./share-story";

// Carte à partager au format story (lot 50) : dimensions, zones sûres d'Instagram (fond uniforme), trois styles.
async function cover() {
  // Une « photo » très contrastée : si elle débordait sur les bandes, le test le verrait.
  return sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#7a5c2e" } })
    .composite([
      {
        input: await sharp({ create: { width: 800, height: 500, channels: 3, background: "#ff0000" } })
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}

const base = (over: Partial<StoryInput> = {}): StoryInput => ({
  style: "night",
  photo: null,
  grade: "Sport",
  pseudo: "kenji_66",
  name: "GR Supra",
  line: "Toyota · 2021 · Japonaise",
  numbers: [
    { value: "340", label: "ch" },
    { value: "14", label: "rassos" },
    { value: "1", label: "prix du public" },
  ],
  ...over,
});

const hex = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));

/** Toutes les lignes `[from, to[` ont exactement la couleur `ground`. */
async function bandIsUniform(png: Buffer, from: number, to: number, ground: string) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const [r, g, b] = hex(ground);
  for (let y = from; y < to; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] !== r || data[i + 1] !== g || data[i + 2] !== b) return { ok: false, x, y };
    }
  }
  return { ok: true };
}

describe("story v2", () => {
  it.each(shareStyles)("style %s : 1080 × 1920, bandes d'Instagram de la couleur du fond", async (style) => {
    const photo = await cover();
    const png = await renderStory(base({ style, photo }));
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([SHARE_SIZES.story.width, SHARE_SIZES.story.height]);
    const bands = shareSafeBands(SHARE_SIZES.story.height);
    expect(bands).toEqual({ top: 269, bottom: 384 });
    const ground = STORY_COLORS[style].ground;
    expect(await bandIsUniform(png, 0, bands.top, ground)).toEqual({ ok: true });
    expect(await bandIsUniform(png, SHARE_SIZES.story.height - bands.bottom, SHARE_SIZES.story.height, ground)).toEqual(
      { ok: true },
    );
    const out = process.env.SHARE_OUT;
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `story-${style}.png`), png);
    }
  });

  it("un nom très long ou sans photo reste dans les zones sûres, sans chiffre il n'y a pas de rangée vide", async () => {
    for (const name of ["Série 3 Touring Compact", "Hispano-Suiza-Alfonso-Treize-Cinquante-Super-Sport", "GTI"]) {
      const png = await renderStory(base({ name, photo: null, numbers: [] }));
      const bands = shareSafeBands(1920);
      expect(await bandIsUniform(png, 0, bands.top, STORY_COLORS.night.ground)).toEqual({ ok: true });
      expect(await bandIsUniform(png, 1920 - bands.bottom, 1920, STORY_COLORS.night.ground)).toEqual({ ok: true });
    }
  });

  it("la mise en page ne dépose rien dans les bandes", () => {
    const { layout, bands } = storyLayout(base());
    for (const l of layout.layers) {
      if (l.kind === "photo") expect(l.y).toBeGreaterThanOrEqual(bands.top);
      if (l.kind === "text") {
        expect(l.y).toBeGreaterThan(bands.top);
        expect(l.y).toBeLessThan(1920 - bands.bottom);
      }
      if (l.kind === "sig") expect(l.y).toBeLessThan(1920 - bands.bottom);
    }
  });
});
