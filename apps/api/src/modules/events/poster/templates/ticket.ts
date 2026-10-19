// Billet (`.pz.ticket`) : carte crème arrondie sur fond sombre, photo en haut, pointillés de découpe, titre, date et
// code-barres en bas.
import type { PosterCtx, PosterLayout } from "../types";
import { C, dot, label, numbers, parts, title } from "./shared";

export function ticket(ctx: PosterCtx): PosterLayout {
  const { W, H, cqw, cqh } = ctx;
  const p = parts(ctx);
  const inset = 5 * cqw;
  const cw = W - 2 * inset;
  const ch = H - 2 * inset;
  const r = 3 * cqw;
  const phH = 0.55 * ch;
  // Code-barres : motif de 3,2 cqw (barre 0,8, vide 0,8, barre 0,4, vide 1,2) sur 30 cqw × 8 cqh.
  const bcW = 30 * cqw;
  const bcH = 8 * cqh;
  const bcX = inset + cw - 5 * cqw - bcW;
  const bcY = inset + ch - 5 * cqh - bcH;
  const unit = 3.2 * cqw;
  let bars = "";
  for (let x = 0; x < bcW; x += unit) {
    bars += `<rect x="${bcX + x}" y="${bcY}" width="${Math.min(0.8 * cqw, bcW - x)}" height="${bcH}"/>`;
    if (x + 1.6 * cqw < bcW) {
      bars += `<rect x="${bcX + x + 1.6 * cqw}" y="${bcY}" width="${0.4 * cqw}" height="${bcH}"/>`;
    }
  }
  const perfY = inset + phH;
  const nmSize = 14 * cqw;
  const rowBottom = inset + ch - 5 * cqh;
  return {
    background: "#1d1f24",
    layers: [
      {
        kind: "svg",
        markup: `<rect x="${inset}" y="${inset}" width="${cw}" height="${ch}" rx="${r}" fill="${C.ink}"/>`,
      },
      {
        kind: "photo",
        x: inset,
        y: inset,
        w: cw,
        h: phH,
        flat: C.flatLight,
        clip: `<path d="M0,${r} Q0,0 ${r},0 L${cw - r},0 Q${cw},0 ${cw},${r} L${cw},${phH} L0,${phH} Z" fill="#fff"/>`,
      },
      {
        kind: "svg",
        markup: `<line x1="${inset}" y1="${perfY}" x2="${inset + cw}" y2="${perfY}" stroke="${C.dark}" stroke-opacity="0.4" stroke-width="${0.6 * cqw}" stroke-dasharray="${1.8 * cqw} ${1.2 * cqw}"/><g fill="${C.dark}">${bars}</g>`,
      },
      title(ctx, {
        x: inset + 5 * cqw,
        width: cw - 10 * cqw,
        y: inset + 0.6 * ch + 0.6 * cqw,
        maxSize: 8 * cqw,
        color: C.dark,
      }),
      numbers(`${p.D} ${p.M}`, {
        x: inset + 5 * cqw,
        width: cw - 45 * cqw,
        y: rowBottom,
        anchor: "bottom",
        size: nmSize,
        color: C.dark,
      }),
      label(dot(p.DAY, p.h), {
        x: inset + 5 * cqw,
        width: cw - 45 * cqw,
        y: rowBottom - nmSize * 0.7 - 1.6 * cqw,
        anchor: "bottom",
        size: 3.2 * cqw,
        color: C.dark,
      }),
      { kind: "sig", right: W - 8 * cqw, y: 0.47 * H, anchor: "top", color: C.dark },
    ],
  };
}
