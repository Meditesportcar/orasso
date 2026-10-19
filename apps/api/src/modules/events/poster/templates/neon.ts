// Néon (`.pz.neon` du prototype) : photo plein cadre, voile sombre en bas, trait moutarde lumineux incliné, cartouche
// date moutarde penché en haut à gauche, titre en bas.
import type { PosterCtx, PosterLayout } from "../types";
import { C, dot, label, parts, SIG_FREE_WIDTH, title, verticalGradient } from "./shared";

export function neon(ctx: PosterCtx): PosterLayout {
  const { W, H, cqw, cqh, story } = ctx;
  const p = parts(ctx);
  const barY = 0.52 * H;
  const barH = 1.4 * cqh;
  const bar = `<rect x="${-0.1 * W}" y="${barY}" width="${1.2 * W}" height="${barH}" fill="${C.accent}"`;
  return {
    background: C.dark,
    layers: [
      { kind: "photo", x: 0, y: 0, w: W, h: H, flat: C.flatDark },
      {
        kind: "svg",
        markup: verticalGradient("v", W, H, [
          [0, "#000000", 0.15],
          [0.35, "#000000", 0],
          [0.82, "#0a0a0c", 0.92],
          [1, "#0a0a0c", 0.92],
        ]),
      },
      {
        kind: "svg",
        // `box-shadow: 0 0 4cqw` : halo flou sous le trait.
        markup: `<defs><filter id="g" x="-20%" y="-400%" width="140%" height="900%"><feGaussianBlur stdDeviation="${2 * cqw}"/></filter></defs><g transform="rotate(-10 ${W / 2} ${barY + barH / 2})">${bar} opacity="0.8" filter="url(#g)"/>${bar}/></g>`,
      },
      {
        kind: "box",
        x: 5 * cqw,
        y: 4 * cqh,
        padding: [1.6 * cqw, 2.6 * cqw, 1.6 * cqw, 2.6 * cqw],
        fill: C.accent,
        align: "center",
        skewX: -8,
        maxWidth: 40 * cqw,
        rows: [
          { text: p.D, font: "narrow", size: 15 * cqw, color: C.dark },
          { text: p.M, font: "narrow", size: 3.4 * cqw, color: C.dark, spacing: 0.12, gapBefore: 1.6 * cqw },
        ],
      },
      title(ctx, {
        x: 5 * cqw,
        width: 90 * cqw,
        y: H - (story ? 16 : 13) * cqh,
        anchor: "bottom",
        maxSize: (story ? 13 : 11) * cqw,
        color: C.ink,
      }),
      label(dot(p.DAY, p.h, p.pl), {
        x: 5 * cqw,
        // La signature occupe le coin bas droit : le libellé s'arrête avant (réduit s'il est plus long).
        width: SIG_FREE_WIDTH * cqw,
        y: H - 7 * cqh,
        anchor: "bottom",
        size: 3.6 * cqw,
        color: C.accent,
      }),
      { kind: "sig", right: W - 4 * cqw, y: H - 3 * cqh, anchor: "bottom", color: C.ink },
    ],
  };
}
