// Magazine (`.pz.mag`) : photo plein cadre, voiles haut et bas, grand titre étroit en haut, lieu sur pastille moutarde
// et date en bas à gauche.
import type { PosterCtx, PosterLayout } from "../types";
import { C, numbers, parts, title, verticalGradient } from "./shared";

export function mag(ctx: PosterCtx): PosterLayout {
  const { W, H, cqw, cqh } = ctx;
  const p = parts(ctx);
  const nmSize = 13 * cqw;
  const nmBottom = H - 8 * cqh;
  const pillSize = 3.4 * cqw;
  const pillH = 1.6 * cqw + pillSize * 0.7;
  const layers: PosterLayout["layers"] = [
    { kind: "photo", x: 0, y: 0, w: W, h: H, flat: C.flatDark },
    {
      kind: "svg",
      markup: verticalGradient("v", W, H, [
        [0, "#000000", 0.55],
        [0.4, "#000000", 0],
        [0.65, "#000000", 0],
        [1, "#000000", 0.7],
      ]),
    },
    title(ctx, {
      x: 4 * cqw,
      width: 92 * cqw,
      y: 4 * cqh + 1.2 * cqw,
      maxSize: 15 * cqw,
      font: "narrow",
      lineHeight: 0.82,
      color: C.ink,
    }),
    numbers([p.DAY, p.D, p.M, p.Y].filter(Boolean).join(" "), {
      x: 4 * cqw,
      width: 92 * cqw,
      y: nmBottom,
      anchor: "bottom",
      size: nmSize,
      color: C.ink,
    }),
  ];
  if (p.pl) {
    layers.push({
      kind: "box",
      x: 4 * cqw,
      y: nmBottom - nmSize * 0.7 - 1.2 * cqh - pillH - 1 * cqw,
      padding: [0.8 * cqw, 1.6 * cqw, 0.8 * cqw, 1.6 * cqw],
      maxWidth: 92 * cqw,
      fill: C.accent,
      align: "left",
      rows: [{ text: p.pl, font: "narrow", size: pillSize, color: C.dark, spacing: 0.12 }],
    });
  }
  layers.push({ kind: "sig", right: W - 4 * cqw, y: H - 3 * cqh, anchor: "bottom", color: C.ink });
  return { background: C.dark, layers };
}
