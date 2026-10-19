// Moteur de rendu des affiches (lot 47) : assemble les calques d'un gabarit en une image avec `sharp` (photo recadrée
// `cover`, formes SVG, texte pango aux polices Archivo, signature « Orasso »). Aucun accès à la base ni au réseau.
import sharp, { type OutputInfo, type OverlayOptions } from "sharp";

import { textLine } from "./text";
import type { BoxLayer, PhotoLayer, PosterInput, PosterLayout, SigLayer, SvgLayer, TextLayer } from "./types";

type Placed = { input: Buffer; left: number; top: number; width: number; height: number };

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Contour du O du logo Orasso (géométrie du prototype, `P_O`). */
const P_O =
  "M69.19 101.74Q49.85 101.74 36.12 96.66Q22.38 91.57 15.04 81.98Q7.7 72.38 7.7 58.87Q7.7 47.38 11.41 37.57Q15.12 27.76 21.8 20.35Q31.69 9.59 47.02 3.92Q62.35 -1.74 81.54 -1.74Q100.87 -1.74 114.61 3.42Q128.34 8.58 135.68 18.17Q143.02 27.76 143.02 41.42Q143.02 53.05 139.17 63.01Q135.32 72.97 128.34 80.38Q118.6 90.84 103.27 96.29Q87.94 101.74 69.19 101.74ZM56.2 29L102.2 29C110.49 29 116.02 35.72 114.56 44L112.44 56C110.98 64.28 103.08 71 94.8 71L48.8 71C40.51 71 34.98 64.28 36.44 56L38.56 44C40.02 35.72 47.92 29 56.2 29Z";

const svg = (w: number, h: number, body: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  );

const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ne garde que la partie visible d'un calque (sharp refuse un calque qui déborde de l'image). */
async function clip(p: Placed, W: number, H: number): Promise<OverlayOptions | null> {
  const left = Math.round(p.left);
  const top = Math.round(p.top);
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(W, left + p.width);
  const y1 = Math.min(H, top + p.height);
  if (x1 <= x0 || y1 <= y0) return null;
  if (x0 === left && y0 === top && x1 === left + p.width && y1 === top + p.height) {
    return { input: p.input, left, top };
  }
  const input = await sharp(p.input)
    .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
    .png()
    .toBuffer();
  return { input, left: x0, top: y0 };
}

async function photoLayer(l: PhotoLayer, photo: Buffer | null): Promise<Placed> {
  const w = Math.max(1, Math.round(l.w));
  const h = Math.max(1, Math.round(l.h));
  let img: Buffer;
  if (photo) {
    try {
      img = await sharp(photo)
        .rotate()
        .resize(w, h, { fit: "cover", position: "centre" })
        .ensureAlpha()
        .png()
        .toBuffer();
    } catch {
      img = await sharp({ create: { width: w, height: h, channels: 4, background: l.flat } })
        .png()
        .toBuffer();
    }
  } else {
    img = await sharp({ create: { width: w, height: h, channels: 4, background: l.flat } })
      .png()
      .toBuffer();
  }
  if (l.clip) {
    img = await sharp(img)
      .composite([{ input: svg(w, h, l.clip), blend: "dest-in" }])
      .png()
      .toBuffer();
  }
  return { input: img, left: l.x, top: l.y, width: w, height: h };
}

/** Bloc de texte (lignes empilées, interligne en fraction du corps), aligné dans sa boîte. */
async function textBlock(l: TextLayer) {
  const lines = await Promise.all(
    l.lines.map((line) =>
      textLine(line, { font: l.font, size: l.size, color: l.color, spacing: l.spacing, maxWidth: l.width }),
    ),
  );
  const step = l.size * (l.lineHeight ?? 0.9);
  const align = l.align ?? "left";
  // Position de chaque ligne dans la boîte : haut des capitales de la première ligne à y = 0.
  const placed = lines.map((img, i) => {
    const capY = i * step;
    const dx = align === "left" ? 0 : align === "right" ? l.width - img.width : (l.width - img.width) / 2;
    return { img, left: dx, top: capY - img.capTop };
  });
  const last = lines[lines.length - 1];
  const baseline = (lines.length - 1) * step + (last?.cap ?? 0);
  return { placed, baseline };
}

async function textLayer(l: TextLayer, W: number, H: number): Promise<Placed[]> {
  const { placed, baseline } = await textBlock(l);
  const boxLeft = (l.align ?? "left") === "left" ? l.x : l.align === "right" ? l.x - l.width : l.x - l.width / 2;
  if (l.rotate === -90) {
    // Bloc rendu à plat dans sa propre image, puis tourné : le début du texte en bas, la première ligne à gauche.
    const minTop = Math.min(0, ...placed.map((p) => p.top));
    const blockW = Math.ceil(l.width);
    const blockH = Math.ceil(Math.max(...placed.map((p) => p.top + p.img.height)) - minTop);
    const flat = await sharp({
      create: { width: blockW, height: Math.max(1, blockH), channels: 4, background: TRANSPARENT },
    })
      .composite(
        placed.map((p) => ({
          input: p.img.data,
          left: Math.max(0, Math.round(p.left)),
          top: Math.round(p.top - minTop),
        })),
      )
      .png()
      .toBuffer();
    const turned = await sharp(flat).rotate(-90).png().toBuffer({ resolveWithObject: true });
    // Après le quart de tour, le haut des capitales (à -minTop du haut du bloc) est à -minTop du bord gauche.
    return [
      {
        input: turned.data,
        left: l.x + minTop,
        top: l.y - turned.info.height,
        width: turned.info.width,
        height: turned.info.height,
      },
    ];
  }
  const originY = (l.anchor ?? "top") === "top" ? l.y : l.y - baseline;
  void W;
  void H;
  return placed.map((p) => ({
    input: p.img.data,
    left: boxLeft + p.left,
    top: originY + p.top,
    width: p.img.width,
    height: p.img.height,
  }));
}

async function boxLayer(l: BoxLayer): Promise<Placed> {
  const rows = await Promise.all(
    l.rows.map((r) => textLine(r.text, { font: r.font, size: r.size, color: r.color, spacing: r.spacing })),
  );
  const [pt, pr, pb, pl] = l.padding;
  const inner = Math.max(...rows.map((r) => r.width));
  // Largeur ajustée au texte, jamais au-delà de `maxWidth` : une ligne trop longue (ville) est réduite, jamais coupée.
  const width = Math.ceil(l.width ?? Math.min(inner + pl + pr, l.maxWidth ?? Number.POSITIVE_INFINITY));
  // Lignes empilées par leurs capitales.
  let y = pt;
  const overlays: OverlayOptions[] = [];
  for (const [i, r] of rows.entries()) {
    if (i > 0) y += l.rows[i]?.gapBefore ?? 0;
    const maxW = width - pl - pr;
    const img = r.width > maxW ? await textLine(l.rows[i]?.text ?? "", { ...rowOpts(l, i), maxWidth: maxW }) : r;
    const x = l.align === "center" ? (width - img.width) / 2 : pl;
    overlays.push({ input: img.data, left: Math.max(0, Math.round(x)), top: Math.max(0, Math.round(y - img.capTop)) });
    y += img.cap;
  }
  const height = Math.ceil(y + pb);
  let out = await sharp(svg(width, height, `<rect width="${width}" height="${height}" fill="${l.fill}"/>`))
    .ensureAlpha()
    .composite(overlays)
    .png()
    .toBuffer({ resolveWithObject: true });
  if (l.skewX) {
    const t = Math.tan((l.skewX * Math.PI) / 180);
    out = await sharp(out.data)
      .affine([1, t, 0, 1], { background: TRANSPARENT, interpolator: "bilinear" })
      .png()
      .toBuffer({ resolveWithObject: true });
  }
  if (l.rotate) {
    out = await sharp(out.data)
      .rotate(l.rotate, { background: TRANSPARENT })
      .png()
      .toBuffer({ resolveWithObject: true });
  }
  // Le centre reste celui de la boîte droite.
  const cx = (l.origin ?? "topleft") === "center" ? l.x : l.x + width / 2;
  const cy = (l.origin ?? "topleft") === "center" ? l.y : l.y + height / 2;
  return {
    input: out.data,
    left: cx - out.info.width / 2,
    top: cy - out.info.height / 2,
    width: out.info.width,
    height: out.info.height,
  };
}

function rowOpts(l: BoxLayer, i: number) {
  const r = l.rows[i];
  if (!r) throw new Error("ligne de cartouche");
  return { font: r.font, size: r.size, color: r.color, spacing: r.spacing };
}

/** Initiales d'une structure : ses capitales (« MéditeSportCar » → « MSC »), sinon les initiales de ses mots. */
export function structureInitials(name: string): string {
  const caps = name.replace(/[^A-ZÀ-Ý]/g, "");
  if (caps.length >= 2) return caps.slice(0, 3);
  const words = name.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 3)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

const isLight = (hex: string) => {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 140;
};

/** Logo rond de la structure, ou ses initiales sur un rond de la couleur de la signature ; `null` sans nom ni logo. */
async function structureBadge(input: PosterInput, d: number, color: string): Promise<Buffer | null> {
  const circle = `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/>`;
  if (input.logo) {
    try {
      return await sharp(input.logo)
        .resize(d, d, { fit: "cover" })
        .ensureAlpha()
        .composite([{ input: svg(d, d, circle), blend: "dest-in" }])
        .png()
        .toBuffer();
    } catch {
      // Logo illisible : initiales.
    }
  }
  const initials = structureInitials(input.structureName);
  if (!initials) return null;
  const ink = isLight(color) ? "#131417" : "#f3ebdd";
  const letters = await textLine(initials, { font: "narrow", size: d * 0.36, color: ink, maxWidth: d * 0.8 });
  return sharp(svg(d, d, `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="${color}"/>`))
    .composite([
      {
        input: letters.data,
        left: Math.max(0, Math.round((d - letters.width) / 2)),
        top: Math.max(0, Math.round(d / 2 - letters.cap / 2 - letters.capTop)),
      },
    ])
    .png()
    .toBuffer();
}

/** Signature : [logo de la structure] [O] ORASSO, alignée à droite (ou centrée), centrée verticalement sur le O. */
async function sigLayer(l: SigLayer, input: PosterInput, cqw: number): Promise<Placed[]> {
  const s = Math.max(8, Math.round(6 * cqw));
  const gap = 1.4 * cqw;
  const [word, badge] = await Promise.all([
    textLine("Orasso", { font: "narrow", size: Math.max(5, 3.2 * cqw), color: l.color, spacing: 0.16 }),
    structureBadge(input, s, l.color),
  ]);
  const total = (badge ? s + gap : 0) + s + gap + word.width;
  const right = l.center === undefined ? l.right : l.center + total / 2;
  const centerY = l.anchor === "bottom" ? l.y - s / 2 : l.y + s / 2;
  const wordLeft = right - word.width;
  const oLeft = wordLeft - gap - s;
  const o = svg(
    s,
    s,
    `<svg viewBox="-7.3 -25 150 150" width="${s}" height="${s}"><g transform="translate(-7.7 0)"><path d="${P_O}" fill="${l.color}" fill-rule="evenodd"/></g></svg>`,
  );
  const out: Placed[] = [
    {
      input: word.data,
      left: wordLeft,
      top: centerY - word.cap / 2 - word.capTop,
      width: word.width,
      height: word.height,
    },
    { input: await sharp(o).png().toBuffer(), left: oLeft, top: centerY - s / 2, width: s, height: s },
  ];
  if (badge) out.push({ input: badge, left: oLeft - gap - s, top: centerY - s / 2, width: s, height: s });
  return out;
}

/** Rend un gabarit en pixels bruts `W × H` (RGB), à encoder par l'appelant. */
export async function renderLayout(
  layout: PosterLayout,
  input: PosterInput,
  W: number,
  H: number,
): Promise<{ data: Buffer; info: OutputInfo }> {
  const cqw = W / 100;
  const groups = await Promise.all(
    layout.layers.map(async (l): Promise<Placed[]> => {
      switch (l.kind) {
        case "svg":
          return [{ input: svg(W, H, (l as SvgLayer).markup), left: 0, top: 0, width: W, height: H }];
        case "photo":
          return [await photoLayer(l, input.photo)];
        case "text":
          return textLayer(l, W, H);
        case "box":
          return [await boxLayer(l)];
        case "sig":
          return sigLayer(l, input, cqw);
      }
    }),
  );
  const overlays = (await Promise.all(groups.flat().map((p) => clip(p, W, H)))).filter(
    (o): o is OverlayOptions => o !== null,
  );
  return sharp({ create: { width: W, height: H, channels: 3, background: layout.background } })
    .composite(overlays)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

export { escXml };
