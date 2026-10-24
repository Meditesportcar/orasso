// JDM (`.pz.jdm`) : fond crème, photo sur les 70 % de droite, soleil rouge, titre vertical (de bas en haut) à gauche,
// date en clair en bas à droite.
import type { PosterCtx, PosterLayout } from "../types";
import { C, dot, label, numbers, parts, title } from "./shared";

export function jdm(ctx: PosterCtx): PosterLayout {
  const { W, H, cqw, cqh } = ctx;
  const p = parts(ctx);
  const sun = 22 * cqw;
  const lbSize = 3.4 * cqw;
  return {
    background: "#e8e2d4",
    layers: [
      { kind: "photo", x: 0.3 * W, y: 0, w: 0.7 * W, h: H, flat: C.flatLight },
      {
        kind: "svg",
        markup: `<circle cx="${W - 8 * cqw - sun / 2}" cy="${6 * cqh + sun / 2}" r="${sun / 2}" fill="#c8322b"/>`,
      },
      // `writing-mode: vertical-rl` + `rotate(180deg)` : le titre se lit de bas en haut, au plus 88 cqh de long.
      title(ctx, {
        x: 4 * cqw,
        width: 88 * cqh,
        y: H - 6 * cqh,
        maxSize: 14 * cqw,
        lineHeight: 0.86,
        rotate: -90,
        color: C.dark,
      }),
      numbers(`${p.D}.${p.mm}`, {
        x: W - 5 * cqw,
        align: "right",
        width: 60 * cqw,
        y: H - 10 * cqh - lbSize * 0.7 - 2 * cqw,
        anchor: "bottom",
        size: 16 * cqw,
        color: C.ink,
      }),
      label(dot(p.Y, p.h, p.pl), {
        x: W - 5 * cqw,
        align: "right",
        width: 60 * cqw,
        y: H - 10 * cqh,
        anchor: "bottom",
        size: lbSize,
        color: C.ink,
      }),
      { kind: "sig", right: W - 4 * cqw, y: H - 3 * cqh, anchor: "bottom", color: C.ink },
    ],
  };
}
