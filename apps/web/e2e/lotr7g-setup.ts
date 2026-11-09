import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RELAIS } from "./relais";

// Lot R7g (stories vidéo) : les fichiers de démonstration des recettes. Une mire de 2 s en H.264 (720 × 1280, avec son), la même
// en HEVC, et la mire dont la durée est réécrite (« trop longue »). Générées une fois par ffmpeg (`apps/api/test/fixtures`) :
// aucune plaque, aucune personne. Jamais une vidéo du téléphone de quelqu'un.
const FIXTURES = resolve(import.meta.dirname, "../../api/test/fixtures");

export const CAPTURES = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7g-captures/apres`;

const read = (name: string) => readFileSync(`${FIXTURES}/${name}`);

export const clip = () => ({ name: "story.mp4", mimeType: "video/mp4", buffer: read("story-2s.mp4") });
export const hevcClip = () => ({ name: "hevc.mp4", mimeType: "video/mp4", buffer: read("story-hevc.mp4") });
export const brokenClip = () => ({
  name: "casse.mp4",
  mimeType: "video/mp4",
  buffer: read("story-2s.mp4").subarray(0, 4000),
});

/** La mire dont la durée annoncée (`mvhd`) est réécrite : « trop longue ». */
export function longClip(seconds = 45) {
  const buffer = Buffer.from(read("story-2s.mp4"));
  const at = buffer.indexOf("mvhd") + 4;
  const timescale = buffer.readUInt32BE(at + 4 + 8);
  buffer.writeUInt32BE(Math.round(timescale * seconds), at + 4 + 12);
  return { name: "longue.mp4", mimeType: "video/mp4", buffer };
}

/** Une mire paysage de 2 s (1280 × 720) : posée sur sa vignette floutée, à l'affichage. */
export const landscapeClip = () => ({
  name: "paysage.mp4",
  mimeType: "video/mp4",
  buffer: read("story-paysage-2s.mp4"),
});
