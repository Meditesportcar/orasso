// Outils communs aux gabarits d'affiche (lot 47). Couleurs relevées dans le CSS du prototype (`.pz.*`) : les affiches
// peuvent sortir de la palette (écart 6 du README du système de design, daté par le lot 38).
import { fitTitle, posterCharWidth } from "@orasso/shared";

import type { PosterCtx, TextLayer } from "../types";

export const C = {
  ink: "#f3ebdd",
  dark: "#131417",
  accent: "#e9b824",
  muted: "#aaa397",
  /** Aplat d'une affiche sans photo, sur fond sombre et sur fond clair. */
  flatDark: "#24262b",
  flatLight: "#d8cdb8",
} as const;

/**
 * Largeur libre à gauche de la signature du coin bas droit (en cqw, depuis une marge de 5 cqw) : un libellé posé à sa
 * hauteur s'arrête avant (réduit s'il est plus long, jamais coupé). La signature (logo, O, « ORASSO ») fait ~30 cqw.
 */
export const SIG_FREE_WIDTH = 58;

/** Hauteur des capitales d'Archivo, en fraction du corps (mesurée : 69 px pour 100 px). */
export const CAP = 0.7;

/** Titre du gabarit : corps maximal du prototype, réduit pour tenir dans `width` (jamais tronqué), une ou deux lignes. */
export function title(
  ctx: PosterCtx,
  o: Omit<TextLayer, "kind" | "lines" | "size" | "font"> & {
    maxSize: number;
    font?: TextLayer["font"];
    /** Longueur disponible (largeur, ou hauteur pour un titre vertical). */
    length?: number;
  },
): TextLayer & { blockHeight: number } {
  const font = o.font ?? "expanded";
  const lh = o.lineHeight ?? 0.9;
  const fit = fitTitle(ctx.title, o.length ?? o.width, {
    maxSize: o.maxSize,
    charWidth: posterCharWidth[font],
    lineHeight: lh,
  });
  const { maxSize: _m, length: _l, ...rest } = o;
  return {
    kind: "text",
    ...rest,
    font,
    lines: fit.lines,
    size: fit.fontSize,
    lineHeight: lh,
    // Haut des capitales de la première ligne à la ligne de base de la dernière.
    blockHeight: (fit.lines.length - 1) * fit.fontSize * lh + fit.fontSize * CAP,
  };
}

/** Libellé (`.lb` : étroit, 800, interlettrage .12em, capitales). */
export function label(
  text: string,
  o: Omit<TextLayer, "kind" | "lines" | "font" | "spacing"> & { spacing?: number },
): TextLayer {
  return { kind: "text", font: "narrow", spacing: o.spacing ?? 0.12, lines: [text], ...o };
}

/** Chiffres (`.nm` : étroit, 800, interligne .85). */
export function numbers(text: string, o: Omit<TextLayer, "kind" | "lines" | "font">): TextLayer {
  return { kind: "text", font: "narrow", lineHeight: 0.85, lines: [text], ...o };
}

/** Dégradé vertical plein cadre : `stops` = [position 0–1, couleur, opacité]. */
export function verticalGradient(id: string, W: number, H: number, stops: [number, string, number][]): string {
  const s = stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("");
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${s}</linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${id})"/>`;
}

/** « SAM · 19 H · PORT DE CANET » sans morceau vide. */
export const dot = (...xs: string[]) => xs.filter((x) => x.trim()).join(" · ");

/** Lieu, heure, date : les morceaux de texte des gabarits. */
export function parts(ctx: PosterCtx) {
  const d = ctx.date;
  return {
    D: d.day,
    M: d.month,
    DAY: d.weekday,
    h: d.hour.toUpperCase(),
    pl: ctx.place,
    mm: d.monthNumber,
  };
}
