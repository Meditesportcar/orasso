// Suisse (`.pz.swiss`) : fond crème, photo en haut coupée en biais, grand « 24.10 » moutarde, titre droit, filet noir.
import type { PosterCtx, PosterLayout } from "../types";
import { C, dot, label, numbers, parts, SIG_FREE_WIDTH, title } from "./shared";

export function swiss(ctx: PosterCtx): PosterLayout {
  const { W, H, cqw, cqh } = ctx;
  const p = parts(ctx);
  const ph = 0.56 * H;
  return {
    background: C.ink,
    layers: [
      {
        kind: "photo",
        x: 0,
        y: 0,
        w: W,
        h: ph,
        flat: C.flatLight,
        clip: `<polygon points="0,0 ${W},0 ${W},${0.82 * ph} 0,${ph}" fill="#fff"/>`,
      },
      numbers(`${p.D.padStart(2, "0")}.${p.mm}`, {
        x: W - 4 * cqw,
        align: "right",
        width: 90 * cqw,
        y: 0.41 * H + 2 * cqw,
        size: 25 * cqw,
        color: C.accent,
      }),
      title(ctx, {
        x: 5 * cqw,
        width: 90 * cqw,
        y: H - 16 * cqh,
        anchor: "bottom",
        maxSize: 7.5 * cqw,
        font: "bold",
        color: C.dark,
      }),
      {
        kind: "svg",
        markup: `<rect x="${5 * cqw}" y="${H - 12.5 * cqh}" width="${90 * cqw}" height="${0.5 * cqh}" fill="${C.dark}"/>`,
      },
      label(dot(p.DAY, p.h, p.pl), {
        x: 5 * cqw,
        width: SIG_FREE_WIDTH * cqw,
        y: H - 6.5 * cqh,
        anchor: "bottom",
        size: 3.4 * cqw,
        color: C.dark,
      }),
      { kind: "sig", right: W - 4 * cqw, y: H - 3 * cqh, anchor: "bottom", color: C.dark },
    ],
  };
}
