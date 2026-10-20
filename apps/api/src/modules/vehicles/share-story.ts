// Carte à partager au format story (lot 50, ARCHITECTURE-DA-V2 § 6, prototype `s-share`) : PNG 1080 × 1920 rendu par le
// moteur des affiches (lot 47 : `sharp`, texte pango aux polices Archivo). Trois styles : `night` (Béton), `sand`
// (Sable clair), `neon` (nuit et cadre moutarde). Zones sûres d'Instagram (retours de Damien, v33) : rien dans les 14 %
// du haut ni les 20 % du bas, les bandes sont de la couleur du fond, sans un pixel d'autre couleur. De haut en bas : la
// photo de couverture, barrée d'un trait moutarde, grade et @pseudo, nom du véhicule en très grand (jamais tronqué),
// marque · année · origine, chiffres (ch, rassos, prix du public), signature « Orasso » et adresse remontées au-dessus
// de la zone du bas. Jamais de plaque. Les couleurs sont celles du prototype : un objet fabriqué (écart 6 du README du
// système de design), comme les affiches.
import { fitTitle, posterCharWidth, SHARE_SIZES, type ShareStyle, shareSafeBands } from "@orasso/shared";
import sharp from "sharp";
import { renderLayout } from "../events/poster/engine";
import { CAP } from "../events/poster/templates/shared";
import type { PosterInput, PosterLayer, PosterLayout } from "../events/poster/types";

/** Couleurs des trois styles (prototype `.story`, `.story.sand`, `.story.plate`). */
export const STORY_COLORS: Record<
  ShareStyle,
  { ground: string; ink: string; muted: string; accent: string; numbers: string; name: string; tagInk: string }
> = {
  night: {
    ground: "#131417",
    ink: "#f3ebdd",
    muted: "#aaa397",
    accent: "#e9b824",
    numbers: "#e9b824",
    name: "#f3ebdd",
    tagInk: "#131417",
  },
  sand: {
    ground: "#e8dfca",
    ink: "#131417",
    muted: "#5b554a",
    accent: "#e9b824",
    numbers: "#131417",
    name: "#131417",
    tagInk: "#131417",
  },
  neon: {
    ground: "#131417",
    ink: "#f3ebdd",
    muted: "#aaa397",
    accent: "#e9b824",
    numbers: "#f3ebdd",
    name: "#e9b824",
    tagInk: "#131417",
  },
};

export type StoryInput = {
  style: ShareStyle;
  /** Photo de couverture (n'importe quel format lu par sharp), `null` = aplat. */
  photo: Buffer | null;
  grade: string;
  pseudo: string;
  /** « GR Supra » (marque, modèle, génération). */
  name: string;
  /** « Toyota · 2021 · Japonaise ». */
  line: string;
  /** Chiffres affichés : les valeurs absentes ou nulles sont omises. */
  numbers: { value: string; label: string }[];
};

const W = SHARE_SIZES.story.width;
const H = SHARE_SIZES.story.height;
const MARGIN = 80;
const INNER = W - MARGIN * 2;
const cqw = W / 100;

const NUMBER_SIZE = 104;
const LABEL_SIZE = 28;
const NARROW = posterCharWidth.narrow;

/** Hauteur de la photo à gauche et à droite : le trait moutarde monte de gauche à droite (prototype : −9°, adouci). */
const SLANT = 96;

export function storyLayout(i: StoryInput): { layout: PosterLayout; bands: { top: number; bottom: number } } {
  const c = STORY_COLORS[i.style];
  const bands = shareSafeBands(H);
  const bottomLimit = H - bands.bottom;
  const layers: PosterLayer[] = [];

  // Pied : signature et adresse sur une ligne, au-dessus de la zone du bas (marge de 56 px : le cadre du style Néon passe dessous).
  const sigBaseline = bottomLimit - 56;
  const rule = sigBaseline - Math.round(6 * cqw) - 28;
  // Chiffres : étiquette sous le chiffre, le tout au-dessus du filet.
  const labelBaseline = rule - 34;
  const numberBaseline = labelBaseline - LABEL_SIZE * CAP - 16;
  const numbersTop = numberBaseline - NUMBER_SIZE * CAP;
  // Marque · année · origine.
  const lineSize = 34;
  const lineBaseline = (i.numbers.length ? numbersTop : rule) - 44;
  // Nom : très grand, une ou deux lignes, jamais tronqué.
  const fit = fitTitle(i.name, INNER, { maxSize: 150, charWidth: posterCharWidth.expanded, lineHeight: 0.88 });
  const nameBaseline = lineBaseline - lineSize * CAP - 36;
  const nameBlock = (fit.lines.length - 1) * fit.fontSize * 0.88 + fit.fontSize * CAP;
  const nameTop = nameBaseline - nameBlock;
  // Grade et pseudo.
  const ownerSize = 38;
  const ownerBaseline = nameTop - 40;
  const ownerTop = ownerBaseline - ownerSize * CAP - 22;
  // Photo : de la bande du haut au-dessus de la ligne du grade (le bord bas monte vers la droite).
  const photoY = bands.top;
  const photoBottomLeft = Math.round(ownerTop - 44);
  const photoH = Math.max(280, photoBottomLeft - photoY);
  const leftEdge = photoH;
  const rightEdge = photoH - SLANT;

  layers.push({
    kind: "photo",
    x: 0,
    y: photoY,
    w: W,
    h: photoH,
    flat: i.style === "sand" ? "#cbbf9f" : "#24262b",
    clip: `<polygon points="0,0 ${W},0 ${W},${rightEdge} 0,${leftEdge}" fill="#fff"/>`,
  });
  // Le trait moutarde qui barre le bas de la photo.
  const stripe = 12;
  const frame =
    i.style === "neon"
      ? `<defs><filter id="glow" x="-10%" y="-5%" width="120%" height="110%"><feGaussianBlur stdDeviation="6"/></filter></defs>
<rect x="28" y="${bands.top + 26}" width="${W - 56}" height="${bottomLimit - bands.top - 52}" rx="22" fill="none" stroke="${c.accent}" stroke-width="6" opacity=".55" filter="url(#glow)"/>
<rect x="28" y="${bands.top + 26}" width="${W - 56}" height="${bottomLimit - bands.top - 52}" rx="22" fill="none" stroke="${c.accent}" stroke-width="3"/>`
      : "";
  layers.push({
    kind: "svg",
    markup: `${frame}<polygon points="0,${photoY + leftEdge - stripe} ${W},${photoY + rightEdge - stripe} ${W},${photoY + rightEdge} 0,${photoY + leftEdge}" fill="${c.accent}"/>
<rect x="${MARGIN}" y="${rule}" width="${INNER}" height="2" fill="${c.ink}" opacity=".22"/>`,
  });

  // Grade (étiquette moutarde penchée) et @pseudo.
  const gradeWidth = i.grade.length * 34 * NARROW * 1.12 + 44 + 14;
  layers.push({
    kind: "box",
    x: MARGIN,
    y: ownerTop,
    padding: [11, 22, 11, 22],
    fill: c.accent,
    skewX: -10,
    align: "left",
    rows: [{ text: i.grade, font: "narrow", size: 34, color: c.tagInk, spacing: 0.12 }],
  });
  layers.push({
    kind: "text",
    lines: [`@${i.pseudo}`],
    keepCase: true,
    font: "bold",
    size: ownerSize,
    color: c.ink,
    width: INNER - gradeWidth - 24,
    x: MARGIN + gradeWidth + 24,
    y: ownerBaseline,
    anchor: "bottom",
  });
  layers.push({
    kind: "text",
    lines: fit.lines,
    font: "expanded",
    size: fit.fontSize,
    lineHeight: 0.88,
    color: c.name,
    width: INNER,
    x: MARGIN,
    y: nameBaseline,
    anchor: "bottom",
  });
  layers.push({
    kind: "text",
    lines: [i.line],
    font: "narrow",
    size: lineSize,
    spacing: 0.12,
    color: c.muted,
    width: INNER,
    x: MARGIN,
    y: lineBaseline,
    anchor: "bottom",
  });

  // Chiffres : trois colonnes au plus, la largeur de chacune estimée par ses caractères.
  let x = MARGIN;
  for (const n of i.numbers.slice(0, 3)) {
    const w = Math.max(n.value.length * NUMBER_SIZE * 0.5, n.label.length * LABEL_SIZE * NARROW * 1.25);
    layers.push({
      kind: "text",
      lines: [n.value],
      font: "narrow",
      size: NUMBER_SIZE,
      color: c.numbers,
      width: Math.ceil(w),
      x,
      y: numberBaseline,
      anchor: "bottom",
    });
    layers.push({
      kind: "text",
      lines: [n.label],
      font: "narrow",
      size: LABEL_SIZE,
      spacing: 0.08,
      color: c.muted,
      width: Math.ceil(w),
      x,
      y: labelBaseline,
      anchor: "bottom",
    });
    x += Math.ceil(w) + 64;
  }

  // Pied : l'adresse à gauche, la signature à droite.
  layers.push({
    kind: "text",
    lines: [`orasso.fr/${i.pseudo}`],
    keepCase: true,
    font: "bold",
    size: 32,
    color: c.ink,
    width: 520,
    x: MARGIN,
    y: sigBaseline - Math.round(6 * cqw) / 2 + 32 * CAP * 0.5,
    anchor: "bottom",
  });
  layers.push({ kind: "sig", right: W - MARGIN, y: sigBaseline, anchor: "bottom", color: c.ink });

  return { layout: { background: c.ground, layers }, bands };
}

/** Rend la story (PNG 1080 × 1920). */
export async function renderStory(i: StoryInput): Promise<Buffer> {
  const { layout } = storyLayout(i);
  const input: PosterInput = {
    style: "minimal",
    title: i.name,
    startsAt: new Date(0),
    timezone: "Europe/Paris",
    place: "",
    structureName: "",
    photo: i.photo,
    logo: null,
  };
  const { data, info } = await renderLayout(layout, input, W, H);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png({ compressionLevel: 8 })
    .toBuffer();
}
