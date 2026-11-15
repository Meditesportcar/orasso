// Lot B3a : une affiche sans photo ne laisse pas une grande plage beige vide (Suisse, Rétro, JDM, Billet).
import { fromWallTime } from "@orasso/shared";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { render } from "./render";
import type { PosterInput } from "./types";

const input = (style: PosterInput["style"], photo: Buffer | null): PosterInput => ({
  style,
  title: "Salon de printemps",
  startsAt: fromWallTime({ year: 2026, month: 12, day: 14, hour: 9, minute: 0 }),
  timezone: "Europe/Paris",
  place: "Perpignan",
  structureName: "MéditeSportCar",
  photo,
  logo: null,
});

/** Les canaux d'un pixel de l'affiche (largeur 360 : 360 × 450). */
async function pixel(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
}

const luma = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe("affiche sans photo", () => {
  // Un point au cœur de la zone photo de chaque gabarit clair, loin du trait moutarde et des textes.
  const zones = { swiss: [180, 30], retro: [180, 120], jdm: [250, 250], ticket: [60, 60] } as const;
  for (const [style, [x, y]] of Object.entries(zones) as [keyof typeof zones, readonly [number, number]][]) {
    it(`${style} : la zone photo est un aplat sombre, pas un aplat beige`, async () => {
      const png = await render(input(style, null), "post", 360);
      expect(luma(await pixel(png, x, y))).toBeLessThan(80);
    });
  }

  it("un trait moutarde barre la zone vide", async () => {
    const png = await render(input("swiss", null), "post", 360);
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let mustard = 0;
    for (let y = 0; y < 250; y++) {
      const i = (y * info.width + 5) * info.channels;
      if ((data[i] ?? 0) > 200 && (data[i + 1] ?? 0) > 150 && (data[i + 2] ?? 255) < 80) mustard++;
    }
    expect(mustard).toBeGreaterThan(2);
  });
});

describe("photo illisible (lot B3a, tour 1)", () => {
  it("billet : un buffer corrompu donne une affiche sans photo, signature claire comprise", async () => {
    const png = await render(input("ticket", Buffer.from("pas une image")), "post", 360);
    // Zone photo sombre ; la signature claire se lit dans la zone (au moins quelques pixels clairs à son niveau).
    expect(luma(await pixel(png, 60, 60))).toBeLessThan(80);
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let light = 0;
    for (let y = 205; y < 225; y++)
      for (let x = 220; x < 340; x++) if ((data[(y * info.width + x) * info.channels] ?? 0) > 200) light++;
    expect(light).toBeGreaterThan(20);
  });
});

describe("photo illisible, un seul contrôle (lot B3b)", () => {
  it.each(["swiss", "retro", "jdm", "ticket"] as const)(
    "%s : un buffer corrompu rend exactement l'affiche sans photo",
    async (style) => {
      const broken = await render(input(style, Buffer.from("pas une image")), "post", 360);
      const none = await render(input(style, null), "post", 360);
      expect(broken.equals(none)).toBe(true);
    },
  );
});
