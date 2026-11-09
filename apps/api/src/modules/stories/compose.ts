// Composition d'une story photo en 9:16 (lot R7f1, ARCHITECTURE-R7 § 2.5 et § 3). Un seul rendu, côté serveur, à
// l'identique de l'aperçu de l'appli : fond = la photo en couverture 1080 × 1920, floutée (`blur(40)`) et assombrie de
// 20 % ; premier plan = la photo cadrée par `frame` ; puis les plaques floutées sur le rendu final, avec les rectangles
// de la photo d'origine transformés par le même cadrage (`mapRects`). WebP q80. L'original n'est jamais gardé.
import {
  clampFrame,
  type Frame,
  fitDefault,
  frameToCanvas,
  mapRects,
  type PlateRect,
  STORY_H,
  STORY_W,
} from "@orasso/shared";
import sharp from "sharp";

import { blurPlateRegions, MAX_INPUT_PIXELS } from "../vehicles/photos-blur";

/** Flou et assombrissement du fond (maquette R7.22 `s-format` : « fond flouté »). */
export const STORY_BG_BLUR = 40;
export const STORY_BG_BRIGHTNESS = 0.8;

export type ComposedStory = {
  data: Buffer;
  info: { width: number; height: number; size: number };
  /** Rectangles floutés, dans le rendu final (fractions du 1080 × 1920). */
  blurredRects: PlateRect[];
};

/** Photo, cadrage et plaques d'origine → rendu final. `rects` en fractions de la photo telle qu'elle est stockée. */
export async function composeStoryPhoto(
  input: Buffer,
  opts: { frame?: Frame; rects?: PlateRect[] | null },
): Promise<ComposedStory> {
  const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW < 1 || srcH < 1) throw new Error("Image illisible");
  const frame = clampFrame(opts.frame ?? fitDefault(srcW, srcH));

  const background = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(STORY_W, STORY_H, { fit: "cover" })
    .blur(STORY_BG_BLUR)
    .modulate({ brightness: STORY_BG_BRIGHTNESS })
    .png()
    .toBuffer();

  // Premier plan : la photo à sa taille dans le canevas, rognée à ce qui reste visible (un zoom la fait déborder).
  const box = frameToCanvas(frame, srcW, srcH);
  const fw = Math.max(1, Math.round(box.width));
  const fh = Math.max(1, Math.round(box.height));
  const left = Math.round(box.left);
  const top = Math.round(box.top);
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(STORY_W, left + fw);
  const y1 = Math.min(STORY_H, top + fh);
  const layers: sharp.OverlayOptions[] = [];
  if (x1 > x0 && y1 > y0) {
    const foreground = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize(fw, fh, { fit: "fill" })
      .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
      .png()
      .toBuffer();
    layers.push({ input: foreground, left: x0, top: y0 });
  }
  const flat = await sharp(background).composite(layers).png().toBuffer();

  const blurredRects: PlateRect[] = opts.rects?.length
    ? mapRects(opts.rects, frame, { width: srcW, height: srcH })
    : [];
  if (blurredRects.length) {
    const out = await blurPlateRegions(flat, blurredRects);
    return { data: out.data, info: out.info, blurredRects };
  }
  const out = await sharp(flat).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  return { data: out.data, info: { width: out.info.width, height: out.info.height, size: out.info.size }, blurredRects };
}
