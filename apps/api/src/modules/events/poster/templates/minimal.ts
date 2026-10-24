// Minimal (`.pz.minimal`) : fond presque noir, titre en haut, lieu et heure en gris, photo encadrée au centre, grand
// « 24/10 » moutarde en bas. C'est aussi le gabarit d'une affiche sans photo (aplat).
import type { PosterCtx, PosterLayout } from "../types";
import { C, dot, label, numbers, parts, title } from "./shared";

export function minimal(ctx: PosterCtx): PosterLayout {
  const { W, H, cqw, cqh } = ctx;
  const p = parts(ctx);
  const t = title(ctx, { x: 6 * cqw, width: 88 * cqw, y: 6 * cqh + 0.3 * cqw, maxSize: 6 * cqw, color: C.ink });
  // Le lieu reste sous le titre, même sur deux lignes.
  const plY = Math.max(14 * cqh, t.y + t.blockHeight + 2 * cqh);
  const pw = 0.72 * W;
  const ph = 0.44 * H;
  return {
    background: "#0b0c0e",
    layers: [
      {
        kind: "photo",
        x: 0.14 * W,
        y: 0.22 * H,
        w: pw,
        h: ph,
        flat: C.flatDark,
        clip: `<rect width="${pw}" height="${ph}" rx="${cqw}" fill="#fff"/>`,
      },
      t,
      label(dot(p.Y, p.pl, p.h), { x: 6 * cqw, width: 88 * cqw, y: plY, size: 3.2 * cqw, color: C.muted }),
      numbers(`${p.D}/${p.mm}`, {
        x: 6 * cqw,
        width: 60 * cqw,
        y: H - 6 * cqh,
        anchor: "bottom",
        size: 26 * cqw,
        color: C.accent,
      }),
      { kind: "sig", right: W - 4 * cqw, y: H - 3 * cqh, anchor: "bottom", color: C.ink },
    ],
  };
}
