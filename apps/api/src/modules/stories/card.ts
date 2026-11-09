// Carte d'un contenu partagé (lot R7f4, maquette R7.23) : la carte posée sur le fond d'une story, d'une publication du Fil
// ou d'un fichier qui sort d'Orasso. Une carte crème légèrement penchée, photo en haut barrée d'un trait moutarde,
// étiquette, nom en grand sur UNE ligne (jamais coupé : `fitNameLine`), ligne de détail, chiffres, « orasso.fr » au pied.
// Même langage que l'affiche du lot 50 (`vehicles/share-story.ts`) : mêmes polices, mêmes couleurs, mêmes outils de texte.
// Un seul rendu, côté serveur (sharp) : l'aperçu de l'appli et du site affiche ce fichier tel quel. Aucune plaque n'est
// jamais lue ici : l'image donnée est déjà celle que l'API a le droit de montrer (plaque floutée ou « aucune plaque »).
import { clampFrame, type Frame, frameToCanvas, STORY_H, STORY_W, shareLabels } from "@orasso/shared";
import sharp, { type OverlayOptions } from "sharp";

import { textLine } from "../events/poster/text";
import { MAX_INPUT_PIXELS } from "../vehicles/photos-blur";
import { fitNameLine, P_O, type ShareStat } from "../vehicles/share-story";

/** La carte, sans l'inclinaison, et le canevas qui la porte (4:5 : la carte et ses marges). */
export const CARD_W = 860;
export const CARD_H = 1060;
export const CARD_PHOTO_H = 620;
export const CANVAS_W = 1080;
export const CANVAS_H = 1350;
/** Inclinaison de la carte (maquette : un léger basculement vers la gauche). */
export const CARD_TILT = -2.2;
/** Flou et assombrissement du fond (les mêmes que la story photo : `compose.ts`). */
export const GROUND_BLUR = 40;
export const GROUND_BRIGHTNESS = 0.8;
/** Flou fort d'une image sans décision de plaque (affiche d'événement) : illisible, plaque comprise. */
export const GROUND_BLUR_STRONG = 96;

const CREAM = "#f3ebdd";
const INK = "#131417";
const MOUTARDE = "#e9b824";
const MUTED = "#5b574f";
const PLACEHOLDER = "#1b1d21";
const PAD = 52;

export type CardSpec = {
  /** Étiquette en petites capitales (« Rassemblement », « Sport · @damien_66 »). */
  kicker: string;
  /** Le nom : une ligne, taille ajustée. */
  title: string;
  /** Ligne de détail sous le nom. */
  subtitle: string;
  /** Pastille moutarde sur la photo (« En cours », « 1re · 19 voix »), ou `null`. */
  badge: string | null;
  /** Chiffres (voiture), trois au plus. */
  stats: ShareStat[];
  /** Le trait moutarde qui barre le bas de la photo. */
  stripe: boolean;
  /** Photo montrable (déjà masquée), ou `null` : un cadre sombre avec le O de la marque. */
  photo: Buffer | null;
};

const svg = (w: number, h: number, body: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  );

async function photoLayer(photo: Buffer | null): Promise<Buffer> {
  if (photo) {
    try {
      return await sharp(photo, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize(CARD_W, CARD_PHOTO_H, { fit: "cover", position: "centre" })
        .png()
        .toBuffer();
    } catch {
      // Image illisible : le cadre sombre prend le relais, jamais une erreur pour une carte.
    }
  }
  const s = 3.4;
  const w = 135.3 * s;
  const h = 103.5 * s;
  return svg(
    CARD_W,
    CARD_PHOTO_H,
    `<rect width="${CARD_W}" height="${CARD_PHOTO_H}" fill="${PLACEHOLDER}"/>` +
      `<g transform="translate(${(CARD_W - w) / 2 - 7.7 * s} ${(CARD_PHOTO_H - h) / 2 + 1.74 * s}) scale(${s})"><path d="${P_O}" fill="${MOUTARDE}" fill-opacity=".85"/></g>`,
  );
}

/** Pastille moutarde (texte encre) posée en haut à gauche de la photo. */
async function badgeLayer(text: string): Promise<OverlayOptions[]> {
  const label = await textLine(text, { font: "label", size: 30, color: INK, spacing: 0.08, maxWidth: CARD_W - 140 });
  const padX = 26;
  const padY = 16;
  const w = label.width + padX * 2;
  const h = label.cap + padY * 2;
  return [
    {
      input: svg(w, h, `<rect width="${w}" height="${h}" rx="${Math.round(h / 2.6)}" fill="${MOUTARDE}"/>`),
      left: 36,
      top: 36,
    },
    { input: label.data, left: 36 + padX, top: Math.round(36 + padY - label.capTop) },
  ];
}

/** La carte à plat : 860 × 1060, coins arrondis. */
async function flatCard(spec: CardSpec): Promise<Buffer> {
  const layers: OverlayOptions[] = [{ input: await photoLayer(spec.photo), left: 0, top: 0 }];
  if (spec.stripe) {
    const y = CARD_PHOTO_H;
    layers.push({
      input: svg(
        CARD_W,
        CARD_PHOTO_H,
        `<polygon points="0,${y - 70} ${CARD_W},${y - 128} ${CARD_W},${y - 106} 0,${y - 48}" fill="${MOUTARDE}"/>`,
      ),
      left: 0,
      top: 0,
    });
  }
  if (spec.badge) layers.push(...(await badgeLayer(spec.badge)));

  const inner = CARD_W - PAD * 2;
  let cursor = CARD_PHOTO_H + 60;
  const place = (img: { data: Buffer; cap: number; capTop: number }, left = PAD) => {
    layers.push({ input: img.data, left, top: Math.round(cursor - img.capTop) });
    cursor += img.cap;
  };

  place(await textLine(spec.kicker, { font: "label", size: 28, color: MUTED, spacing: 0.14, maxWidth: inner }));
  cursor += 34;
  const title = await fitNameLine(spec.title, inner, 84, INK);
  place(title.image);
  if (spec.subtitle) {
    cursor += 30;
    place(await textLine(spec.subtitle, { font: "bold", size: 34, color: MUTED, keepCase: true, maxWidth: inner }));
  }
  if (spec.stats.length) {
    cursor += 50;
    let x = PAD;
    const base = cursor;
    for (const s of spec.stats.slice(0, 3)) {
      const value = await textLine(s.value, { font: "condensed", size: 70, color: INK });
      layers.push({ input: value.data, left: x, top: Math.round(base - value.capTop) });
      let w = value.width;
      if (s.unit) {
        const unit = await textLine(s.unit, { font: "bold", size: 34, color: MUTED, keepCase: true });
        layers.push({
          input: unit.data,
          left: x + value.width + 10,
          top: Math.round(base + value.cap - unit.cap - unit.capTop),
        });
        w += 10 + unit.width;
      }
      x += w + 44;
    }
    cursor += 70;
  }
  const foot = await textLine(shareLabels.signature, { font: "bold", size: 34, color: INK, keepCase: true });
  layers.push({ input: foot.data, left: PAD, top: CARD_H - PAD - foot.cap - foot.capTop });

  const base = await sharp({ create: { width: CARD_W, height: CARD_H, channels: 4, background: CREAM } })
    .composite(layers)
    .png()
    .toBuffer();
  return sharp(base)
    .composite([
      {
        input: svg(CARD_W, CARD_H, `<rect width="${CARD_W}" height="${CARD_H}" rx="44" fill="#fff"/>`),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
}

/**
 * La carte posée dans son canevas (1080 × 1350, fond transparent), avec son ombre et son inclinaison. C'est ce fichier
 * que l'appli et le site affichent en aperçu et que le serveur colle sur le fond (`placeOnGround`).
 */
export async function renderCard(spec: CardSpec): Promise<Buffer> {
  const card = await flatCard(spec);
  const left = Math.round((CANVAS_W - CARD_W) / 2);
  const top = Math.round((CANVAS_H - CARD_H) / 2);
  const shadow = await sharp(
    svg(CARD_W, CARD_H, `<rect width="${CARD_W}" height="${CARD_H}" rx="44" fill="#000" fill-opacity=".5"/>`),
  )
    .extend({ top: 40, bottom: 40, left: 40, right: 40, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(22)
    .png()
    .toBuffer();
  const flat = await sharp({
    create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: shadow, left: left - 40, top: top - 40 + 18 },
      { input: card, left, top },
    ])
    .png()
    .toBuffer();
  const turned = await sharp(flat)
    .rotate(CARD_TILT, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });
  return sharp(turned.data)
    .extract({
      left: Math.max(0, Math.round((turned.info.width - CANVAS_W) / 2)),
      top: Math.max(0, Math.round((turned.info.height - CANVAS_H) / 2)),
      width: CANVAS_W,
      height: CANVAS_H,
    })
    .png()
    .toBuffer();
}

/**
 * Le fond : l'image du contenu en couverture, floutée et assombrie (les couleurs du contenu) ; sans image, un fond
 * sombre de la marque avec une lueur moutarde en haut à droite. `width × height` : 1080 × 1920 (story) ou 1080 × 1350.
 */
export async function renderGround(
  image: Buffer | null,
  width: number,
  height: number,
  strong = false,
): Promise<Buffer> {
  if (image) {
    try {
      if (strong) {
        // Flou fort : l'image (une affiche, sans décision de plaque) est réduite au huitième avant d'être floutée, puis
        // reprise à la taille du fond : rien de lisible n'en reste, plaque comprise.
        const small = await sharp(image, { limitInputPixels: MAX_INPUT_PIXELS })
          .rotate()
          .resize(Math.round(width / 8), Math.round(height / 8), { fit: "cover" })
          .blur(GROUND_BLUR_STRONG / 8)
          .png()
          .toBuffer();
        return await sharp(small)
          .resize(width, height, { fit: "fill" })
          .blur(GROUND_BLUR / 2)
          .modulate({ brightness: GROUND_BRIGHTNESS })
          .png()
          .toBuffer();
      }
      return await sharp(image, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize(width, height, { fit: "cover" })
        .blur(GROUND_BLUR)
        .modulate({ brightness: GROUND_BRIGHTNESS })
        .png()
        .toBuffer();
    } catch {
      // Illisible : le fond de la marque.
    }
  }
  return sharp(
    svg(
      width,
      height,
      `<defs><radialGradient id="g" cx="0.85" cy="0.08" r="0.9"><stop offset="0" stop-color="${MOUTARDE}" stop-opacity=".38"/><stop offset="1" stop-color="${MOUTARDE}" stop-opacity="0"/></radialGradient></defs>` +
        `<rect width="${width}" height="${height}" fill="#0f1013"/><rect width="${width}" height="${height}" fill="url(#g)"/>`,
    ),
  )
    .png()
    .toBuffer();
}

/**
 * Pose la carte sur le fond selon le cadrage de l'auteur (le même calcul que la photo d'une story : `frameToCanvas`,
 * échelle relative à « tenir en entier », décalage en pixels du canevas) : 1 = la carte (1080 × 1350) en pleine largeur.
 * Sans cadrage, la carte reste au centre à l'échelle 1. Ce qui déborde du canevas est rogné.
 */
export async function placeOnGround(
  ground: Buffer,
  card: Buffer,
  size: { width: number; height: number },
  frame?: Frame,
): Promise<Buffer> {
  if (size.height === CANVAS_H)
    return sharp(ground)
      .composite([{ input: card, left: 0, top: 0 }])
      .png()
      .toBuffer();
  const f = clampFrame(frame ?? { scale: 1, offsetX: 0, offsetY: 0 });
  const box = frameToCanvas(f, CANVAS_W, CANVAS_H);
  const fw = Math.max(1, Math.round(box.width));
  const fh = Math.max(1, Math.round(box.height));
  const left = Math.round(box.left);
  const top = Math.round(box.top);
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(STORY_W, left + fw);
  const y1 = Math.min(STORY_H, top + fh);
  if (x1 <= x0 || y1 <= y0) return ground;
  const placed = await sharp(card)
    .resize(fw, fh, { fit: "fill" })
    .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
    .png()
    .toBuffer();
  return sharp(ground)
    .composite([{ input: placed, left: x0, top: y0 }])
    .png()
    .toBuffer();
}

/**
 * Signature « orasso.fr » d'un fichier qui sort d'Orasso : une pastille sombre en bas à droite (en story, au-dessus de la
 * zone que l'application de destination recouvre). Rend un JPEG : lu partout (Instagram, WhatsApp, TikTok…).
 */
export async function signFile(image: Buffer, size: { width: number; height: number }): Promise<Buffer> {
  const label = await textLine(shareLabels.signature, { font: "bold", size: 38, color: CREAM, keepCase: true });
  const padX = 26;
  const padY = 16;
  const w = label.width + padX * 2;
  const h = label.cap + padY * 2;
  const right = 44;
  const bottom = size.height >= STORY_H ? 250 : 44;
  const left = size.width - right - w;
  const top = size.height - bottom - h;
  return sharp(image)
    .composite([
      {
        input: svg(
          w,
          h,
          `<rect width="${w}" height="${h}" rx="${Math.round(h / 2.4)}" fill="#0b0c0e" fill-opacity=".62"/>`,
        ),
        left,
        top,
      },
      { input: label.data, left: left + padX, top: Math.round(top + padY - label.capTop) },
    ])
    .flatten({ background: "#0b0c0e" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
