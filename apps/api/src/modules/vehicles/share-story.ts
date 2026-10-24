// Affiche à partager (lot 50 ; lot M6 : maquettes 2.1 à 2.3 et corrections de Damien du 23/10). PNG rendu par `sharp`,
// texte pango aux polices Archivo du système de design (comme les affiches d'événement), story 1080 × 1920 (par
// défaut) ou post 1080 × 1350, trois styles : Nuit (fumée), Sable (papier crème), Néon (liseré moutarde) ; même mise en
// page, seule l'ambiance change.
// De haut en bas : la photo de couverture carrée en pleine largeur, prolongée en haut et en bas par elle-même, floutée
// et agrandie ; le sceau « Véhicule certifié · Orasso » à reflet (seulement si le véhicule est certifié) ; les styles
// en étiquettes inclinées, le nom du modèle sur UNE ligne (taille ajustée à sa longueur par la mesure du texte, jamais
// coupé), marque · génération · couleur dessous, les chiffres lisibles par tous (puissance, poids, année ; pas de
// grade) ; au pied, le vrai logo Orasso, le @pseudo et « Retrouve-la sur orasso.fr », et le QR de la fiche du véhicule.
// Story : aucun texte dans les marges qu'Instagram recouvre (`SHARE_SAFE`). Jamais de fausse plaque : la photo est
// celle que le serveur a floutée ; `masks` floute en plus les zones que l'appli a re-détectées sur l'affiche composée.
// Les couleurs sont celles des maquettes : un objet fabriqué (écart 6 du README du système de design), comme les
// affiches d'événement.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type PlateRect,
  SHARE_SIZES,
  type ShareFormat,
  type ShareStyle,
  sharePhotoTop,
  shareSafeBands,
  shareSealSide,
  shareSealTop,
} from "@orasso/shared";
import QRCode from "qrcode";
import sharp, { type OverlayOptions } from "sharp";

import { repoRoot } from "../../env";
import { CAP } from "../events/poster/templates/shared";
import { type PosterFont, type TextImage, textLine } from "../events/poster/text";
import { blurPlateRegions } from "./photos-blur";

/** Couleurs des trois styles (maquette `.aff`, `.aff.sable`, `.aff.neon`) ; les gris sont l'encre à 75–85 % sur le fond. */
export const STORY_COLORS: Record<
  ShareStyle,
  {
    ground: string;
    ink: string;
    soft: string;
    muted: string;
    accent: string;
    numbers: string;
    name: string;
    tag: string;
    tagInk: string;
    qrGround: string;
  }
> = {
  night: {
    ground: "#0b0c0e",
    ink: "#f3ebdd",
    soft: "#d0c9be",
    muted: "#b9b3a9",
    accent: "#e9b824",
    numbers: "#e9b824",
    name: "#f3ebdd",
    tag: "#f3ebdd",
    tagInk: "#131417",
    qrGround: "#f3ebdd",
  },
  sand: {
    ground: "#e8dfca",
    ink: "#131417",
    soft: "#33322f",
    muted: "#484744",
    accent: "#e9b824",
    numbers: "#131417",
    name: "#131417",
    tag: "#131417",
    tagInk: "#f3ebdd",
    qrGround: "#fffaf0",
  },
  neon: {
    ground: "#0b0c0e",
    ink: "#f3ebdd",
    soft: "#d0c9be",
    muted: "#b9b3a9",
    accent: "#e9b824",
    numbers: "#f3ebdd",
    name: "#e9b824",
    tag: "#f3ebdd",
    tagInk: "#131417",
    qrGround: "#f3ebdd",
  },
};

export type ShareStat = { label: string; value: string; unit?: string };

export type StoryInput = {
  format: ShareFormat;
  style: ShareStyle;
  /** Photo de couverture, déjà floutée par le serveur (n'importe quel format lu par sharp) ; `null` = aplat. */
  photo: Buffer | null;
  /** Le modèle (« GR Supra ») : une seule ligne, jamais coupée. */
  name: string;
  /** « Toyota · A90 · blanche » : marque, génération, couleur. */
  line: string;
  /** Styles en étiquettes (trois au plus, le premier en moutarde). */
  tags: string[];
  /** Puissance, poids, année : les valeurs absentes sont omises. */
  stats: ShareStat[];
  certified: boolean;
  pseudo: string;
  /** « Retrouve-la sur » (le, la selon le véhicule). */
  findIt: string;
  /** « orasso.fr » */
  site: string;
  /** Adresse codée dans le QR : la fiche publique du véhicule. */
  qrUrl: string;
  /** Zones à flouter sur l'affiche composée (filet de sécurité). */
  masks?: PlateRect[];
};

const W = 1080;
const MARGIN = Math.round(W * 0.06);
const INNER = W - MARGIN * 2;
const cqw = W / 100;

/** Mise en page propre au format (maquette `.aff` et `.aff.post`). */
export function storyFrame(format: ShareFormat) {
  const H = SHARE_SIZES[format].height;
  const story = format === "story";
  const cqh = H / 100;
  return {
    H,
    story,
    cqh,
    /** La photo carrée : 4 % du haut en story, remontée de 15 % en post. */
    photoY: sharePhotoTop(format),
    /** Le voile monte de là jusqu'en bas. */
    fadeFrom: story ? 0.4 : 0.44,
    /** Bas du bloc principal (chiffres) et du pied (logo, QR). */
    mainBottom: Math.round(H * (story ? 0.76 : 0.855)),
    footBottom: Math.round(H * (story ? 0.844 : 0.968)),
    qr: Math.round((story ? 13 : 11) * cqw),
    nameMax: Math.round((story ? 13 : 11.5) * cqw),
    sealTop: shareSealTop(format),
    gap: (story ? 2.2 : 1.6) * cqh,
    bands: story ? shareSafeBands(H) : { top: 0, bottom: 0 },
  };
}

const svg = (w: number, h: number, body: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  );

/** Contour du O du logo Orasso (géométrie du prototype, `P_O`). */
const P_O =
  "M69.19 101.74Q49.85 101.74 36.12 96.66Q22.38 91.57 15.04 81.98Q7.7 72.38 7.7 58.87Q7.7 47.38 11.41 37.57Q15.12 27.76 21.8 20.35Q31.69 9.59 47.02 3.92Q62.35 -1.74 81.54 -1.74Q100.87 -1.74 114.61 3.42Q128.34 8.58 135.68 18.17Q143.02 27.76 143.02 41.42Q143.02 53.05 139.17 63.01Q135.32 72.97 128.34 80.38Q118.6 90.84 103.27 96.29Q87.94 101.74 69.19 101.74ZM56.2 29L102.2 29C110.49 29 116.02 35.72 114.56 44L112.44 56C110.98 64.28 103.08 71 94.8 71L48.8 71C40.51 71 34.98 64.28 36.44 56L38.56 44C40.02 35.72 47.92 29 56.2 29Z";

// --- Nom sur une ligne -------------------------------------------------------------------------------------------------

/**
 * Le nom tient sur UNE ligne, jamais coupé (correction de Damien) : on mesure le texte rendu et on réduit le corps
 * jusqu'à ce qu'il tienne. Échelle : la capitale étirée de l'affiche (Archivo Expanded Black Italic) de `max` jusqu'à
 * 60 % de `max` ; plus long, la même ligne passe en Archivo 62 % Black (la largeur condensée de la marque), jusqu'à
 * 40 % de `max` ; au-delà (nom démesuré), le corps condensé continue de baisser : le nom reste entier.
 */
export async function fitNameLine(
  name: string,
  width: number,
  max: number,
  color: string,
): Promise<{ font: PosterFont; size: number; image: TextImage }> {
  const tryFont = async (font: PosterFont, floor: number) => {
    const probe = await textLine(name, { font, size: max, color });
    const size = probe.width <= width ? max : Math.floor((max * width) / probe.width) - 1;
    return { font, size, ok: size >= floor };
  };
  const expanded = await tryFont("expanded", Math.round(max * 0.6));
  // Condensé : au-dessous de 40 % de `max`, le corps continue de baisser (le nom reste entier).
  const pick = expanded.ok ? expanded : await tryFont("condensed", Math.round(max * 0.4));
  const size = Math.max(8, pick.size);
  // `maxWidth` : filet de sécurité de `textLine` (la mesure arrondie peut déborder d'un pixel) : l'image est réduite.
  const image = await textLine(name, { font: pick.font, size, color, maxWidth: width });
  return { font: pick.font, size, image };
}

// --- Fond, photo, voiles ----------------------------------------------------------------------------------------------

/** La photo étirée en fond, floutée et agrandie (maquette `.a-bg` : flou, saturation, luminosité, ×1,25). */
async function blurredGround(photo: Buffer | null, H: number, style: ShareStyle): Promise<Buffer> {
  const c = STORY_COLORS[style];
  const flat = () =>
    sharp({ create: { width: W, height: H, channels: 3, background: c.ground } })
      .png()
      .toBuffer();
  if (!photo) return flat();
  try {
    // Réduit, flouté, puis agrandi : un flou très large sans le coût d'un flou plein cadre.
    const small = await sharp(photo)
      .rotate()
      .resize(Math.round(W / 4), Math.round(H / 4), { fit: "cover", position: "centre" })
      .blur(6)
      .modulate(style === "sand" ? { brightness: 1.05, saturation: 0.9 } : { brightness: 0.72, saturation: 1.15 })
      .png()
      .toBuffer();
    const zoom = 1.25;
    const big = await sharp(small)
      .resize(Math.round(W * zoom), Math.round(H * zoom), { fit: "fill", kernel: "cubic" })
      .extract({
        left: Math.round((W * zoom - W) / 2),
        top: Math.round((H * zoom - H) / 2),
        width: W,
        height: H,
      })
      .png()
      .toBuffer();
    if (style !== "sand") return big;
    // Sable : la photo à 55 % sur le papier, puis un voile crème (`.aff.sable .a-bg::after`).
    return sharp({ create: { width: W, height: H, channels: 3, background: c.ground } })
      .composite([
        { input: await sharp(big).ensureAlpha(0.55).png().toBuffer() },
        { input: svg(W, H, `<rect width="${W}" height="${H}" fill="${c.ground}" fill-opacity=".55"/>`) },
      ])
      .png()
      .toBuffer();
  } catch {
    return flat();
  }
}

/** La photo carrée en pleine largeur, avec son léger voile haut et bas (`.a-ph::after`) ; la partie visible seulement. */
async function squarePhoto(photo: Buffer | null, y: number, H: number, style: ShareStyle): Promise<OverlayOptions[]> {
  if (!photo) return [];
  try {
    const shade = STORY_COLORS[style].ground;
    const square = await sharp(photo)
      .rotate()
      .resize(W, W, { fit: "cover", position: "centre" })
      .ensureAlpha()
      .composite([
        {
          input: svg(
            W,
            W,
            `<defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade}" stop-opacity=".35"/><stop offset=".14" stop-color="${shade}" stop-opacity="0"/><stop offset=".7" stop-color="${shade}" stop-opacity="0"/><stop offset="1" stop-color="${shade}" stop-opacity=".25"/></linearGradient></defs><rect width="${W}" height="${W}" fill="url(#v)"/>`,
          ),
        },
      ])
      .png()
      .toBuffer();
    // Les bords haut et bas fondus dans le prolongement flouté : aucune couture entre la photo et son fond.
    const blended = await sharp(square)
      .composite([
        {
          input: svg(
            W,
            W,
            `<defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".07" stop-color="#fff" stop-opacity="1"/><stop offset=".78" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="${W}" height="${W}" fill="url(#m)"/>`,
          ),
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();
    const top = Math.max(0, y);
    const bottom = Math.min(H, y + W);
    if (bottom <= top) return [];
    const input =
      top === y && bottom === y + W
        ? blended
        : await sharp(blended)
            .extract({ left: 0, top: top - y, width: W, height: bottom - top })
            .png()
            .toBuffer();
    return [{ input, left: 0, top }];
  } catch {
    return [];
  }
}

/** Fumée (Nuit), voile du bas, liseré (Néon) : un seul calque SVG plein cadre. */
function atmosphere(f: ReturnType<typeof storyFrame>, style: ShareStyle): Buffer {
  const c = STORY_COLORS[style];
  const H = f.H;
  const g = c.ground;
  const fadeTop = Math.round(H * f.fadeFrom);
  const fade =
    style === "sand"
      ? f.story
        ? `<stop offset="0" stop-color="${g}" stop-opacity="0"/><stop offset=".26" stop-color="${g}" stop-opacity=".9"/><stop offset=".62" stop-color="${g}" stop-opacity="1"/><stop offset="1" stop-color="${g}" stop-opacity=".55"/>`
        : `<stop offset="0" stop-color="${g}" stop-opacity="0"/><stop offset=".34" stop-color="${g}" stop-opacity=".92"/><stop offset=".66" stop-color="${g}" stop-opacity="1"/>`
      : f.story
        ? `<stop offset="0" stop-color="${g}" stop-opacity="0"/><stop offset=".26" stop-color="${g}" stop-opacity=".86"/><stop offset=".64" stop-color="${g}" stop-opacity=".93"/><stop offset="1" stop-color="${g}" stop-opacity=".5"/>`
        : `<stop offset="0" stop-color="${g}" stop-opacity="0"/><stop offset=".34" stop-color="${g}" stop-opacity=".88"/><stop offset=".66" stop-color="${g}" stop-opacity="1"/>`;
  const smokeTop = Math.round(H * 0.3);
  const smokeH = Math.round(H * 0.5);
  const smoke =
    style === "night"
      ? `<defs><radialGradient id="s"><stop offset="0" stop-color="#f3ebdd" stop-opacity=".2"/><stop offset=".7" stop-color="#f3ebdd" stop-opacity="0"/></radialGradient><filter id="sb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="24"/></filter></defs>
<g filter="url(#sb)"><ellipse cx="${0.18 * W}" cy="${smokeTop + 0.7 * smokeH}" rx="${0.6 * W}" ry="${0.4 * smokeH}" fill="url(#s)"/><ellipse cx="${0.88 * W}" cy="${smokeTop + 0.74 * smokeH}" rx="${0.5 * W}" ry="${0.35 * smokeH}" fill="url(#s)" opacity=".8"/></g>`
      : "";
  const inset = Math.round(W * 0.024);
  const frame =
    style === "neon"
      ? `<defs><filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="12"/></filter></defs>
<rect x="${inset}" y="${inset}" width="${W - inset * 2}" height="${H - inset * 2}" rx="46" fill="none" stroke="${c.accent}" stroke-width="10" opacity=".75" filter="url(#glow)"/>
<rect x="${inset}" y="${inset}" width="${W - inset * 2}" height="${H - inset * 2}" rx="46" fill="none" stroke="${c.accent}" stroke-width="6"/>`
      : "";
  return svg(
    W,
    H,
    `${smoke}<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">${fade}</linearGradient></defs><rect x="0" y="${fadeTop}" width="${W}" height="${H - fadeTop}" fill="url(#f)"/>${frame}`,
  );
}

// --- Étiquettes, sceau, logo, QR --------------------------------------------------------------------------------------

/** Une étiquette inclinée (`.tag` : fond plein, capitales étroites, penchée de 10°). */
async function tag(text: string, fill: string, ink: string): Promise<{ input: Buffer; width: number; height: number }> {
  const size = Math.round(2.9 * cqw);
  const img = await textLine(text, { font: "label", size, color: ink, spacing: 0.08 });
  const padX = Math.round(2 * cqw);
  const padY = Math.round(0.9 * cqw);
  const w = img.width + padX * 2;
  const h = Math.round(img.cap + padY * 2);
  const flat = await sharp(svg(w, h, `<rect width="${w}" height="${h}" rx="6" fill="${fill}"/>`))
    .ensureAlpha()
    .composite([{ input: img.data, left: padX, top: Math.max(0, Math.round(padY - img.capTop)) }])
    .png()
    .toBuffer();
  const t = Math.tan((-10 * Math.PI) / 180);
  const out = await sharp(flat)
    .affine([1, t, 0, 1], { background: { r: 0, g: 0, b: 0, alpha: 0 }, interpolator: "bilinear" })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { input: out.data, width: out.info.width, height: out.info.height };
}

/** Sceau « Véhicule certifié · Orasso » (maquette `certSeal()`) : disque moutarde, texte en couronne, O coché, reflet. */
export async function certifiedSeal(size: number, text: string): Promise<Buffer> {
  const s = size;
  const k = s / 100;
  const disc = svg(
    s,
    s,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d77e"/><stop offset=".5" stop-color="#e9b824"/><stop offset="1" stop-color="#b8860b"/></linearGradient>
<linearGradient id="r" x1="0" y1="0" x2="1" y2=".55"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".46" stop-color="#fff" stop-opacity=".55"/><stop offset=".58" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<circle cx="${50 * k}" cy="${50 * k}" r="${48 * k}" fill="url(#g)"/>
<circle cx="${50 * k}" cy="${50 * k}" r="${44 * k}" fill="none" stroke="#131417" stroke-width="${1.2 * k}" stroke-dasharray="${2 * k} ${2 * k}"/>
<g transform="translate(${29 * k} ${33 * k}) scale(${0.29 * k})"><g transform="translate(-7.7 0)"><path d="${P_O}" fill="#131417" fill-rule="evenodd"/><path d="M58 50l12 10 22-20" fill="none" stroke="#131417" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g></g>
<circle cx="${50 * k}" cy="${50 * k}" r="${46 * k}" fill="url(#r)"/>`,
  );
  // Le texte en couronne : chaque lettre rendue puis tournée sur le cercle (r = 36 %), du côté gauche par le haut.
  const radius = 36 * k;
  const fontSize = Math.max(6, Math.round(10 * k));
  const chars = [...text];
  const glyphs = await Promise.all(
    chars.map((ch) =>
      ch === " " ? null : textLine(ch, { font: "label", size: fontSize, color: "#131417", keepCase: true }),
    ),
  );
  const space = fontSize * 0.32;
  const widths = glyphs.map((g) => (g ? g.width : space));
  const total = widths.reduce((a, b) => a + b, 0);
  // Les espaces entre lettres comblent le tour complet.
  const gap = Math.max(0, (2 * Math.PI * radius - total) / chars.length);
  const overlays: OverlayOptions[] = [];
  let arc = 0;
  for (const [i, g] of glyphs.entries()) {
    const w = widths[i] ?? 0;
    const mid = arc + w / 2;
    arc += w + gap;
    if (!g) continue;
    const phi = Math.PI + mid / radius;
    const turned = await sharp(g.data)
      .rotate(((phi + Math.PI / 2) * 180) / Math.PI, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true });
    const cx = s / 2 + radius * Math.cos(phi);
    const cy = s / 2 + radius * Math.sin(phi);
    const left = Math.round(cx - turned.info.width / 2);
    const top = Math.round(cy - turned.info.height / 2);
    if (left < 0 || top < 0 || left + turned.info.width > s || top + turned.info.height > s) continue;
    overlays.push({ input: turned.data, left, top });
  }
  return sharp(disc).ensureAlpha().composite(overlays).png().toBuffer();
}

const logos = new Map<string, string>();

/** Le vrai logo Orasso du kit (`identite/logo`, copie du système de design) : clair sur fond sombre, sombre sur Sable. */
async function orassoLogo(width: number, onLight: boolean): Promise<Buffer> {
  const file = onLight ? "logo-fond-clair.svg" : "logo-fond-sombre.svg";
  let markup = logos.get(file);
  if (!markup) {
    markup = readFileSync(join(repoRoot, "packages", "design-system", "src", "web", "assets", file), "utf8").replace(
      /<metadata>[\s\S]*?<\/metadata>/,
      "",
    );
    logos.set(file, markup);
  }
  return sharp(Buffer.from(markup), { density: 300 }).resize({ width }).png().toBuffer();
}

/** QR de la fiche du véhicule, modules d'encre sur une plaque claire arrondie. */
export function qrSvg(url: string, size: number, ground: string, ink = "#131417"): Buffer {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const pad = Math.round(size * 0.07);
  const cell = (size - pad * 2) / n;
  let cells = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.data[y * n + x])
        cells += `<rect x="${(pad + x * cell).toFixed(2)}" y="${(pad + y * cell).toFixed(2)}" width="${(cell + 0.4).toFixed(2)}" height="${(cell + 0.4).toFixed(2)}"/>`;
    }
  }
  return svg(
    size,
    size,
    `<rect width="${size}" height="${size}" rx="${Math.round(size * 0.09)}" fill="${ground}"/><g fill="${ink}">${cells}</g>`,
  );
}

// --- Composition ------------------------------------------------------------------------------------------------------

/** Texte posé par sa ligne de base. */
const atBaseline = (img: TextImage, left: number, baseline: number): OverlayOptions => ({
  input: img.data,
  left: Math.round(left),
  top: Math.round(baseline - img.cap - img.capTop),
});

/** Les positions verticales du bloc principal et du pied (exportées pour les tests des zones sûres). */
export async function storyLayout(i: StoryInput) {
  const f = storyFrame(i.format);
  const c = STORY_COLORS[i.style];
  const placed: { kind: string; top: number; bottom: number; overlay: OverlayOptions }[] = [];
  const push = (kind: string, overlay: OverlayOptions, height: number) =>
    placed.push({ kind, top: overlay.top ?? 0, bottom: (overlay.top ?? 0) + height, overlay });

  // Chiffres : étiquette au-dessus, chiffre condensé moutarde, unité ; filet au-dessus du tout.
  let cursor = f.mainBottom;
  if (i.stats.length) {
    const valueSize = Math.round(10 * cqw);
    const unitSize = Math.round(4.4 * cqw);
    const labelSize = Math.round(2.6 * cqw);
    const valueBaseline = cursor;
    const labelBaseline = valueBaseline - valueSize * CAP - Math.round(1.2 * cqw);
    let x = MARGIN;
    for (const s of i.stats.slice(0, 3)) {
      const [label, value, unit] = await Promise.all([
        textLine(s.label, { font: "label", size: labelSize, color: c.muted, spacing: 0.1 }),
        textLine(s.value, { font: "condensed", size: valueSize, color: c.numbers }),
        s.unit ? textLine(s.unit, { font: "condensed", size: unitSize, color: c.numbers, keepCase: true }) : null,
      ]);
      push("text", atBaseline(label, x, labelBaseline), label.height);
      push("text", atBaseline(value, x, valueBaseline), value.height);
      let w = value.width;
      if (unit) {
        push("text", atBaseline(unit, x + value.width + Math.round(0.6 * cqw), valueBaseline), unit.height);
        w += Math.round(0.6 * cqw) + unit.width;
      }
      x += Math.max(w, label.width) + Math.round(6.5 * cqw);
    }
    const ruleY = Math.round(labelBaseline - labelSize * CAP - 1.6 * f.cqh);
    push(
      "rule",
      {
        input: svg(INNER, 2, `<rect width="${INNER}" height="2" fill="${c.ink}" fill-opacity=".22"/>`),
        left: MARGIN,
        top: ruleY,
      },
      2,
    );
    cursor = ruleY;
  }

  // Marque · génération · couleur.
  const lineSize = Math.round(3.3 * cqw);
  const lineImg = i.line
    ? await textLine(i.line, { font: "label", size: lineSize, color: c.soft, spacing: 0.12, maxWidth: INNER })
    : null;
  const lineBaseline = cursor - f.gap;
  if (lineImg) push("text", atBaseline(lineImg, MARGIN, lineBaseline), lineImg.height);
  const lineTop = lineImg ? lineBaseline - lineImg.cap : cursor;

  // Nom : une ligne, taille ajustée.
  const name = await fitNameLine(i.name, INNER, f.nameMax, c.name);
  const nameBaseline = Math.round(lineTop - f.gap + 0.6 * f.cqh);
  if (i.style === "neon") {
    // Halo du Néon (`text-shadow: 0 0 18px` moutarde à 35 %) : le nom, élargi d'une marge, flouté et atténué.
    const pad = 30;
    const halo = await soft(name.image.data, pad, 14, 0.45);
    const at = atBaseline(name.image, MARGIN, nameBaseline);
    push("halo", { input: halo, left: (at.left ?? 0) - pad, top: (at.top ?? 0) - pad }, name.image.height + pad * 2);
  }
  push("text", atBaseline(name.image, MARGIN, nameBaseline), name.image.height);
  const nameTop = nameBaseline - name.image.cap;

  // Étiquettes inclinées.
  let tx = MARGIN;
  const tagImgs = await Promise.all(
    i.tags.slice(0, 3).map((t, n) => tag(t, n === 0 ? c.accent : c.tag, n === 0 ? "#131417" : c.tagInk)),
  );
  const tagsBottom = Math.round(nameTop - f.gap);
  for (const t of tagImgs) {
    if (tx + t.width > W - MARGIN) break;
    push("tag", { input: t.input, left: Math.round(tx), top: tagsBottom - t.height }, t.height);
    tx += t.width + Math.round(1.6 * cqw);
  }

  // Pied : logo, @pseudo et « Retrouve-la sur orasso.fr », QR.
  const logoW = Math.round(30 * cqw);
  const logo = await orassoLogo(logoW, i.style === "sand");
  const logoMeta = await sharp(logo).metadata();
  const logoH = logoMeta.height ?? Math.round(logoW / 6.2);
  push("logo", { input: logo, left: MARGIN, top: f.footBottom - logoH }, logoH);
  const qrLeft = W - MARGIN - f.qr;
  push("qr", { input: qrSvg(i.qrUrl, f.qr, c.qrGround), left: qrLeft, top: f.footBottom - f.qr }, f.qr);
  const textLeft = MARGIN + logoW + Math.round(3 * cqw);
  const textWidth = qrLeft - Math.round(3 * cqw) - textLeft;
  const [pseudo, find] = await Promise.all([
    textLine(`@${i.pseudo}`, {
      font: "bold",
      size: Math.round(3.6 * cqw),
      color: c.ink,
      keepCase: true,
      maxWidth: textWidth,
    }),
    textLine(`${i.findIt} ${i.site}`, {
      font: "bold",
      size: Math.round(2.6 * cqw),
      color: c.soft,
      keepCase: true,
      maxWidth: textWidth,
    }),
  ]);
  const findBaseline = f.footBottom - Math.round(0.6 * cqw);
  push("text", atBaseline(find, textLeft, findBaseline), find.height);
  push("text", atBaseline(pseudo, textLeft, findBaseline - find.cap - Math.round(1.6 * cqw)), pseudo.height);

  // Sceau à reflet, seulement si le véhicule est certifié.
  if (i.certified) {
    const s = shareSealSide(i.format);
    const seal = await certifiedSeal(s, "VÉHICULE CERTIFIÉ · ORASSO · ");
    const turned = await sharp(seal)
      .rotate(-10, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer({ resolveWithObject: true });
    // Ombre portée (`drop-shadow(0 1.2cqw 2cqw rgba(0,0,0,.45))`) : la silhouette du sceau, noircie et floutée.
    const pad = 30;
    const shadow = await soft(
      await sharp(turned.data).linear([0, 0, 0, 1], [0, 0, 0, 0]).png().toBuffer(),
      pad,
      16,
      0.45,
    );
    const left = Math.round(W - 0.04 * W - s - (turned.info.width - s) / 2);
    const top = Math.round(f.sealTop - (turned.info.height - s) / 2);
    push("shadow", { input: shadow, left: left - pad, top: top - pad + Math.round(1.2 * cqw) }, turned.info.height);
    push("seal", { input: turned.data, left, top }, turned.info.height);
  }
  return { frame: f, placed };
}

/** Une copie élargie de `pad`, floutée et atténuée à `alpha` (halo, ombre portée). */
async function soft(input: Buffer, pad: number, sigma: number, alpha: number): Promise<Buffer> {
  return sharp(
    await sharp(input)
      .ensureAlpha()
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  )
    .blur(sigma)
    .linear([1, 1, 1, alpha], [0, 0, 0, 0])
    .png()
    .toBuffer();
}

/** sharp refuse un calque qui déborde de l'image : on n'en garde que la partie visible. */
async function clip(o: OverlayOptions, H: number): Promise<OverlayOptions | null> {
  const input = o.input as Buffer;
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const left = Math.round(o.left ?? 0);
  const top = Math.round(o.top ?? 0);
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(W, left + w);
  const y1 = Math.min(H, top + h);
  if (x1 <= x0 || y1 <= y0) return null;
  if (x0 === left && y0 === top && x1 === left + w && y1 === top + h) return { input, left, top };
  const part = await sharp(input)
    .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
    .png()
    .toBuffer();
  return { input: part, left: x0, top: y0 };
}

/** Rend l'affiche (PNG 1080 × 1920 en story, 1080 × 1350 en post). */
export async function renderStory(i: StoryInput): Promise<Buffer> {
  const { frame: f, placed } = await storyLayout(i);
  const [ground, photo] = await Promise.all([
    blurredGround(i.photo, f.H, i.style),
    squarePhoto(i.photo, f.photoY, f.H, i.style),
  ]);
  const layers: OverlayOptions[] = [
    ...photo,
    { input: atmosphere(f, i.style), left: 0, top: 0 },
    // Ombre et halo d'abord, puis le reste dans l'ordre de pose.
    ...placed.filter((p) => p.kind === "shadow" || p.kind === "halo").map((p) => p.overlay),
    ...placed.filter((p) => p.kind !== "shadow" && p.kind !== "halo").map((p) => p.overlay),
  ];
  const overlays = (await Promise.all(layers.map((o) => clip(o, f.H)))).filter((o): o is OverlayOptions => o !== null);
  let png = await sharp(ground).composite(overlays).removeAlpha().png().toBuffer();
  if (i.masks?.length) {
    const blurred = await blurPlateRegions(png, i.masks);
    png = await sharp(blurred.data).png().toBuffer();
  }
  return sharp(png).png({ compressionLevel: 8 }).toBuffer();
}
