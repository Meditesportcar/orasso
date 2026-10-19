// Rétro (`.pz.retro`) : fond crème, bandes moutarde, orange et brique inclinées, photo dans une fenêtre en arche,
// titre et date centrés.
import type { PosterCtx, PosterLayout } from "../types";
import { C, dot, label, parts, title } from "./shared";

export function retro(ctx: PosterCtx): PosterLayout {
  const { W, H, cqw, cqh } = ctx;
  const p = parts(ctx);
  // Bandes : bas à 28 %, hauteur 20 %, `skewY(-8deg)` autour de leur centre.
  const top = 0.52 * H;
  const band = 0.2 * H;
  const k = Math.tan((8 * Math.PI) / 180) * (W / 2);
  const stripe = (i: number, color: string) => {
    const y0 = top + (band * i) / 3;
    const y1 = top + (band * (i + 1)) / 3;
    return `<polygon points="0,${y0 + k} ${W},${y0 - k} ${W},${y1 - k} 0,${y1 + k}" fill="${color}"/>`;
  };
  // Fenêtre : 76 % de large, 44 % de haut ; les rayons CSS (50cqw en haut, 3cqw en bas) ramenés à la largeur : le
  // haut devient un demi-cercle.
  const ww = 0.76 * W;
  const wh = 0.44 * H;
  const r = ww / 2;
  const rb = 3 * cqw * 0.76;
  const arch = `<path d="M0,${r} A${r},${r} 0 0 1 ${ww},${r} L${ww},${wh - rb} Q${ww},${wh} ${ww - rb},${wh} L${rb},${wh} Q0,${wh} 0,${wh - rb} Z" fill="#fff"/>`;
  return {
    background: C.ink,
    layers: [
      { kind: "svg", markup: stripe(0, C.accent) + stripe(1, "#d4552a") + stripe(2, "#7a2412") },
      { kind: "photo", x: 0.12 * W, y: 0.08 * H, w: ww, h: wh, flat: C.flatLight, clip: arch },
      title(ctx, {
        x: W / 2,
        align: "center",
        width: 92 * cqw,
        y: H - 12 * cqh,
        anchor: "bottom",
        maxSize: 8.6 * cqw,
        color: C.dark,
      }),
      label(dot(`${p.DAY} ${p.D} ${p.M}`, p.pl), {
        x: W / 2,
        align: "center",
        width: 84 * cqw,
        y: H - 7.5 * cqh,
        anchor: "bottom",
        size: 3.4 * cqw,
        color: C.dark,
      }),
      // Tout est centré dans ce style : la signature aussi, sous la date (elle chevauchait un lieu long à droite).
      { kind: "sig", right: W, center: W / 2, y: H - 2.5 * cqh, anchor: "bottom", color: C.dark },
    ],
  };
}
