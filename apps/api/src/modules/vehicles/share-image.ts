// Fiche à partager sur Instagram (lot 31, ARCHITECTURE-SUITE § 14) : PNG 1080×1920 (story) ou 1080×1080 (publication)
// rendu par `sharp` : photo de couverture recadrée, dégradé, nom du véhicule en Archivo (une ou deux lignes, jamais
// tronqué), année et chiffres clés, pseudo, « ORASSO » et « orasso.fr ». Jamais de plaque : la fonction ne lit pas le
// champ. Palette = thème Béton de `docs/design-system/tokens.json` (le paquet du système de design n'est pas une
// dépendance de l'API ; `share-image.test.ts` compare ces valeurs aux jetons).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { countryLabel, SHARE_MARGIN, SHARE_SIZES, type ShareFormat, shareImageLayout } from "@orasso/shared";
import sharp, { type OverlayOptions } from "sharp";

import { repoRoot } from "../../env";
import { storage } from "../../lib/storage";
import type { VehicleWithAll } from "./repo";
import { vehicleLabel } from "./serializers";

/** Jetons du thème Béton (`color.beton.*`). */
export const SHARE_COLORS = {
  groundDeep: "#07080a",
  ink: "#f3ebdd",
  inkMuted: "#afa89c",
  accent: "#e9b824",
} as const;

const FONT_DIR = join(repoRoot, "packages", "design-system", "src", "native", "fonts");
const FONTS = {
  name: { file: "Archivo-ExtraBold.ttf", family: "Archivo ExtraBold" },
  body: { file: "Archivo-SemiBold.ttf", family: "Archivo SemiBold" },
  brand: { file: "Archivo-Expanded-Black.ttf", family: "Archivo Expanded Black" },
} as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Texte rendu par pango avec la police Archivo (repli sur la police du système si le fichier manque). */
async function text(
  content: string,
  font: keyof typeof FONTS,
  size: number,
  color: string,
  maxWidth: number,
): Promise<{ data: Buffer; width: number; height: number }> {
  const f = FONTS[font];
  const fontfile = join(FONT_DIR, f.file);
  const rendered = await sharp({
    text: {
      text: `<span foreground="${color}">${esc(content)}</span>`,
      font: `${f.family} ${size}`,
      ...(existsSync(fontfile) ? { fontfile } : {}),
      dpi: 72,
      rgba: true,
      wrap: "none",
      align: "left",
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  // Filet de sécurité : la mesure du texte est estimée, jamais coupée — au pire on réduit l'image du texte.
  if (rendered.info.width > maxWidth) {
    const scaled = await sharp(rendered.data).resize({ width: maxWidth }).png().toBuffer({ resolveWithObject: true });
    return { data: scaled.data, width: scaled.info.width, height: scaled.info.height };
  }
  return { data: rendered.data, width: rendered.info.width, height: rendered.info.height };
}

const fr = new Intl.NumberFormat("fr-FR");
const plainSpaces = (s: string) => s.replace(/[  ]/g, " ");

/** « 1995 · 330 ch · 1 500 kg · Japon » : jamais de plaque. */
export function shareFacts(v: Pick<VehicleWithAll, "year" | "powerHp" | "weightKg" | "make">): string {
  return [
    v.year ? String(v.year) : null,
    v.powerHp ? `${v.powerHp} ch` : null,
    v.weightKg ? plainSpaces(`${fr.format(v.weightKg)} kg`) : null,
    v.make.isOther ? null : countryLabel(v.make.country),
  ]
    .filter(Boolean)
    .join("  ·  ");
}

async function background(v: VehicleWithAll, width: number, height: number): Promise<Buffer> {
  const cover = v.photos[0];
  const source = cover ? await storage.get(cover.storageKey) : null;
  if (source) {
    try {
      return await sharp(source).rotate().resize(width, height, { fit: "cover", position: "centre" }).png().toBuffer();
    } catch {
      // Photo illisible : fond uni.
    }
  }
  return sharp({ create: { width, height, channels: 3, background: SHARE_COLORS.groundDeep } })
    .png()
    .toBuffer();
}

/** Dégradé du bas : transparent au départ, presque opaque derrière le texte. */
function gradient(width: number, height: number, from: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="${from}" stop-color="${SHARE_COLORS.groundDeep}" stop-opacity="0"/>
<stop offset="1" stop-color="${SHARE_COLORS.groundDeep}" stop-opacity="0.96"/>
</linearGradient></defs>
<rect width="${width}" height="${height}" fill="url(#g)"/></svg>`,
  );
}

/** Rend la fiche. `pseudo` : le propriétaire (affiché « par … »). */
export async function renderShareImage(v: VehicleWithAll, pseudo: string, format: ShareFormat): Promise<Buffer> {
  const { width, height } = SHARE_SIZES[format];
  const available = width - SHARE_MARGIN * 2;
  const layout = shareImageLayout(vehicleLabel(v), format, width);
  const nameSize = layout.fontSize;
  const factsSize = format === "story" ? 40 : 36;
  const gap = format === "story" ? 36 : 28;

  const [name, facts, by, site, brand] = await Promise.all([
    text(layout.lines.join("\n"), "name", nameSize, SHARE_COLORS.ink, available),
    text(shareFacts(v), "body", factsSize, SHARE_COLORS.inkMuted, available),
    text(`par ${pseudo}`, "body", factsSize, SHARE_COLORS.ink, available),
    text("orasso.fr", "brand", 34, SHARE_COLORS.accent, available),
    text("ORASSO", "brand", 40, SHARE_COLORS.ink, available),
  ]);

  // Empilé depuis le bas : site, pseudo, chiffres, nom.
  const bottom = height - (format === "story" ? 150 : 90);
  let y = bottom - site.height;
  const layers: OverlayOptions[] = [
    { input: gradient(width, height, format === "story" ? 0.42 : 0.38), top: 0, left: 0 },
    { input: brand.data, top: format === "story" ? 110 : 70, left: SHARE_MARGIN },
    { input: site.data, top: y, left: SHARE_MARGIN },
  ];
  y -= gap + by.height;
  layers.push({ input: by.data, top: y, left: SHARE_MARGIN });
  if (shareFacts(v)) {
    y -= gap + facts.height;
    layers.push({ input: facts.data, top: y, left: SHARE_MARGIN });
  }
  y -= gap * 1.5 + name.height;
  layers.push({ input: name.data, top: Math.max(0, Math.round(y)), left: SHARE_MARGIN });

  const base = await background(v, width, height);
  return sharp(base)
    .composite(layers.map((l) => ({ ...l, top: Math.round(l.top ?? 0) })))
    .png({ compressionLevel: 8 })
    .toBuffer();
}

// --- Cache (une heure par véhicule et format) -----------------------------------------------------------------------
const TTL_MS = 3_600_000;
const MAX_ENTRIES = 60;
const cache = new Map<string, { at: number; data: Buffer }>();

export function shareImageCacheKey(v: VehicleWithAll, format: ShareFormat): string {
  return [v.id, format, v.updatedAt.getTime(), v.photos.map((p) => p.id).join(","), v.certifiedAt ? "c" : ""].join("|");
}

export async function cachedShareImage(
  v: VehicleWithAll,
  pseudo: string,
  format: ShareFormat,
  at: number = Date.now(),
): Promise<Buffer> {
  const key = `${shareImageCacheKey(v, format)}|${pseudo}`;
  const hit = cache.get(key);
  if (hit && at - hit.at < TTL_MS) return hit.data;
  const data = await renderShareImage(v, pseudo, format);
  for (const [k, e] of cache) if (at - e.at >= TTL_MS) cache.delete(k);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at, data });
  return data;
}

export const clearShareImageCache = () => cache.clear();
