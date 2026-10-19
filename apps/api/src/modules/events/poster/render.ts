// Rendu d'une affiche (lot 47, ARCHITECTURE-DA-V2 § 5.3) : `render(input, format, width?)` → PNG. Une seule source
// pour l'aperçu en direct, les vignettes des cartes et le partage Instagram. Cache mémoire des aperçus (50 entrées).
import { createHash } from "node:crypto";
import { type PosterFormat, posterDate, posterSize } from "@orasso/shared";
import sharp from "sharp";

import { renderLayout } from "./engine";
import { posterTemplates } from "./templates";
import type { PosterCtx, PosterInput } from "./types";

/** Poids maximal d'une affiche : au-delà, le PNG passe en palette (photo quantifiée, toujours nette). */
export const POSTER_MAX_BYTES = 600 * 1024;

const SPACES = /\s+/g;

function ctxOf(input: PosterInput, format: PosterFormat, width?: number): PosterCtx {
  const { width: W, height: H } = posterSize(format, width);
  return {
    W,
    H,
    cqw: W / 100,
    cqh: H / 100,
    story: format === "story",
    input,
    date: posterDate(input.startsAt, input.timezone),
    title: input.title.replace(SPACES, " ").trim().toUpperCase(),
    place: input.place.replace(SPACES, " ").trim().toUpperCase(),
  };
}

/**
 * Rend l'affiche au format demandé ; `width` (aperçu) réduit tout en proportion. Toujours sous 600 Ko : PNG en
 * couleurs vraies, sinon en palette (tramée, puis sans trame) ; une photo trop chargée (grain, feuillage) est enfin
 * adoucie avant un dernier rendu. Trois rendus au plus en même temps (le reste attend son tour).
 */
export function render(input: PosterInput, format: PosterFormat, width?: number): Promise<Buffer> {
  return withRenderSlot(() => posterEngine.render(input, format, width));
}

// --- Sémaphore global : un rendu occupe le processeur une à quelques centaines de millisecondes ----------------------
export const MAX_CONCURRENT_RENDERS = 3;
let active = 0;
const waiting: (() => void)[] = [];

async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (active >= MAX_CONCURRENT_RENDERS) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Rendus en cours (tests du sémaphore). */
export const activeRenders = () => active;

/** Le moteur, remplaçable dans les tests (rendu qui échoue, rendu lent). */
export const posterEngine = { render: renderPng };

async function renderPng(input: PosterInput, format: PosterFormat, width?: number): Promise<Buffer> {
  const raw = await pixels(input, format, width);
  let out = await raw().png({ compressionLevel: 6 }).toBuffer();
  for (const step of PALETTES) {
    if (out.length <= POSTER_MAX_BYTES) return out;
    out = await raw()
      .png({ ...PALETTE, ...step })
      .toBuffer();
  }
  if (out.length <= POSTER_MAX_BYTES || !input.photo) return out;
  // Photo réduite à 360 px puis agrandie par le gabarit : le grain disparaît, l'affiche reste nette.
  const smoothed = await sharp(input.photo)
    .rotate()
    .resize({ width: 360, withoutEnlargement: true })
    .blur(1)
    .png()
    .toBuffer();
  return (await pixels({ ...input, photo: smoothed }, format, width))()
    .png({ ...PALETTE, quality: 50, colours: 64, dither: 0 })
    .toBuffer();
}

const PALETTE = { palette: true, effort: 4, compressionLevel: 9 } as const;
// `colours` ne joue qu'avec une `quality` inférieure à 100 (libimagequant).
const PALETTES = [
  { quality: 90, colours: 256, dither: 0.8 },
  { quality: 60, colours: 128, dither: 0.5 },
];

async function pixels(input: PosterInput, format: PosterFormat, width?: number) {
  const ctx = ctxOf(input, format, width);
  const { data, info } = await renderLayout(posterTemplates[input.style](ctx), input, ctx.W, ctx.H);
  return () => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

// --- Cache des aperçus ----------------------------------------------------------------------------------------------
const MAX_ENTRIES = 50;
const cache = new Map<string, Buffer>();

const digest = (b: Buffer | null) => (b ? createHash("sha1").update(b).digest("hex") : "-");

export function posterCacheKey(input: PosterInput, format: PosterFormat, width?: number): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.style,
        input.title,
        input.startsAt.toISOString(),
        input.timezone,
        input.place,
        input.structureName,
        digest(input.photo),
        digest(input.logo),
        format,
        width ?? null,
      ]),
    )
    .digest("hex");
}

/** Aperçu en cache (le plus ancien sort au-delà de 50 entrées ; un accès le remet en tête). */
export async function cachedRender(input: PosterInput, format: PosterFormat, width?: number): Promise<Buffer> {
  const key = posterCacheKey(input, format, width);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const data = await render(input, format, width);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, data);
  return data;
}

export const posterCacheSize = () => cache.size;
export const clearPosterCache = () => cache.clear();
