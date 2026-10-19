// Damier (`.pz.damier`) : bandes à damier en haut et en bas, photo entre les deux, bandeau moutarde incliné avec le
// titre et la date.
import { fitTitle, posterCharWidth } from "@orasso/shared";

import type { PosterCtx, PosterLayout } from "../types";
import { C, dot, parts } from "./shared";

export function damier(ctx: PosterCtx): PosterLayout {
  const { W, H, cqw, cqh } = ctx;
  const p = parts(ctx);
  const s = 7 * cqh;
  const half = s / 2;
  // Motif du `conic-gradient` : quart haut droit clair, bas droit sombre, bas gauche clair, haut gauche sombre.
  const pattern = `<pattern id="d" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><rect width="${s}" height="${s}" fill="${C.dark}"/><rect x="${half}" y="0" width="${half}" height="${half}" fill="${C.ink}"/><rect x="0" y="${half}" width="${half}" height="${half}" fill="${C.ink}"/></pattern>`;
  const fit = fitTitle(ctx.title, 90 * cqw, { maxSize: 10 * cqw, charWidth: posterCharWidth.expanded });
  return {
    background: C.dark,
    layers: [
      { kind: "photo", x: 0, y: s, w: W, h: H - 2 * s, flat: C.flatDark },
      {
        kind: "svg",
        markup: `<defs>${pattern}</defs><rect width="${W}" height="${s}" fill="url(#d)"/><rect y="${H - s}" width="${W}" height="${s}" fill="url(#d)"/>`,
      },
      {
        kind: "box",
        x: 0,
        y: 0.56 * H,
        width: W,
        padding: [3 * cqw, 5 * cqw, 3 * cqw, 5 * cqw],
        fill: C.accent,
        align: "left",
        rotate: -4,
        rows: [
          ...fit.lines.map((line, i) => ({
            text: line,
            font: "expanded" as const,
            size: fit.fontSize,
            color: C.dark,
            gapBefore: i ? fit.fontSize * 0.2 : 0,
          })),
          {
            text: dot(`${p.DAY} ${p.D} ${p.M}`, p.pl),
            font: "narrow" as const,
            size: 3.4 * cqw,
            color: C.dark,
            spacing: 0.12,
            gapBefore: cqh + cqw,
          },
        ],
      },
      { kind: "sig", right: W - 4 * cqw, y: H - 9 * cqh, anchor: "bottom", color: C.ink },
    ],
  };
}
