// Texte des affiches (lot 47) : rendu par pango (entrée `text` de sharp) avec les polices Archivo du système de design
// (`packages/design-system/src/native/fonts/`), comme la fiche Instagram du lot 31. Le texte n'est jamais coupé :
// si la mesure réelle dépasse la largeur permise, l'image du texte est réduite.
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

import { repoRoot } from "../../../env";

const FONT_DIR = join(repoRoot, "packages", "design-system", "src", "native", "fonts");

/**
 * Polices de l'affiche, d'après le prototype (`.pz .ti` : Archivo 900 italique étirée à 125 % ; `.nm` et `.lb` :
 * étroites à 62–75 %, 800 ; titre « Suisse » : 900 droit, 100 %). Noms de famille = ceux des fichiers.
 */
export const POSTER_FONTS = {
  expanded: { file: "Archivo-Expanded-BlackItalic.ttf", family: "Archivo-Expanded-BlackItalic" },
  bold: { file: "Archivo-ExtraBold.ttf", family: "Archivo-ExtraBold" },
  narrow: { file: "Archivo-Narrow-Bold.ttf", family: "Archivo-Narrow-Bold" },
} as const;
export type PosterFont = keyof typeof POSTER_FONTS;

/**
 * Une ligne rendue. pango recadre l'image sur l'encre : `capTop` = distance du haut de l'image au haut des capitales
 * (non nulle quand la ligne porte un accent sur une capitale) ; `cap` = hauteur des capitales. Toute l'affiche est en
 * capitales (`text-transform: uppercase` du prototype) : la mise en page s'aligne sur ces deux mesures.
 */
export type TextImage = { data: Buffer; width: number; height: number; capTop: number; cap: number };

const ACCENTED = /[̀-ͯ]/;
const metrics = new Map<string, { cap: number; accent: number }>();

async function rawLine(content: string, font: PosterFont, size: number, color: string, letter: string) {
  const f = POSTER_FONTS[font];
  const fontfile = join(FONT_DIR, f.file);
  const rendered = await sharp({
    text: {
      text: `<span foreground="${color}"${letter}>${esc(content)}</span>`,
      font: `${f.family} ${size}px`,
      ...(existsSync(fontfile) ? { fontfile } : {}),
      dpi: 72,
      rgba: true,
      wrap: "none",
      align: "left",
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data: rendered.data, width: rendered.info.width, height: rendered.info.height };
}

/** Hauteur des capitales et dépassement d'un accent, par police et par corps (mesurés une fois). */
async function fontMetrics(font: PosterFont, size: number) {
  const key = `${font}|${size}`;
  let m = metrics.get(key);
  if (!m) {
    const [e, eAcute] = await Promise.all([
      rawLine("E", font, size, "#000000", ""),
      rawLine("É", font, size, "#000000", ""),
    ]);
    m = { cap: e.height, accent: Math.max(0, eAcute.height - e.height) };
    if (metrics.size > 400) metrics.clear();
    metrics.set(key, m);
  }
  return m;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Une ligne de texte en image RGBA transparente. `spacing` : interlettrage en fraction du corps (`.12em` du
 * prototype → 0.12). `maxWidth` : au-delà, l'image est réduite (jamais coupée).
 */
export async function textLine(
  content: string,
  o: { font: PosterFont; size: number; color: string; spacing?: number; maxWidth?: number },
): Promise<TextImage> {
  const size = Math.max(4, Math.round(o.size));
  const text = (content.trim() || "·").toUpperCase();
  // Interlettrage pango : en 1024es de point (72 dpi : 1 pt = 1 px).
  const letter = o.spacing ? ` letter_spacing="${Math.round(o.spacing * size * 1024)}"` : "";
  const [out, m] = await Promise.all([rawLine(text, o.font, size, o.color, letter), fontMetrics(o.font, size)]);
  const capTop = ACCENTED.test(text.normalize("NFD")) ? m.accent : 0;
  if (o.maxWidth && out.width > o.maxWidth) {
    const ratio = Math.floor(o.maxWidth) / out.width;
    const scaled = await sharp(out.data)
      .resize({ width: Math.max(1, Math.floor(o.maxWidth)) })
      .png()
      .toBuffer({ resolveWithObject: true });
    return {
      data: scaled.data,
      width: scaled.info.width,
      height: scaled.info.height,
      capTop: capTop * ratio,
      cap: m.cap * ratio,
    };
  }
  return { ...out, capTop, cap: m.cap };
}
