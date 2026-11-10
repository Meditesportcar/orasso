import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiCall, samplePhoto } from "./helpers";
import { who } from "./lotr7f3-setup";
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

// ─── Tour 3 : une story vidéo signalée, pour la modération ───────────────────────────────────────────────────────────────

/**
 * Une story vidéo publiée par un compte neuf (fichiers de démonstration), signalée par un autre : le dossier de modération
 * montre alors le lecteur de la vidéo. L'envoi se fait comme l'appli : le fichier brut, puis la vignette, puis la création.
 */
export async function reportedVideoStory(prefix: string) {
  const api = `http://localhost:${process.env.API_PORT ?? 3001}/api`;
  const web = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
  const author = await who(`${prefix}A`);
  const reporter = await who(`${prefix}R`);
  const video = await fetch(`${api}/me/uploads/story-video`, {
    method: "POST",
    headers: { origin: web, cookie: author.cookie, "content-type": "video/mp4" },
    body: new Uint8Array(clip().buffer),
  });
  const sent = (await video.json()) as { key: string };
  if (video.status !== 201) throw new Error(`envoi de la vidéo : ${video.status}`);
  const form = new FormData();
  form.append("purpose", "story_poster");
  form.append("file", new Blob([new Uint8Array(samplePhoto())], { type: "image/png" }), "poster.png");
  const poster = await fetch(`${api}/me/uploads`, {
    method: "POST",
    headers: { origin: web, cookie: author.cookie },
    body: form,
  });
  const posterKey = ((await poster.json()) as { key: string }).key;
  const story = await apiCall<{ id: string }>(author.cookie, "POST", "/me/stories", {
    uploadKey: sent.key,
    posterKey,
    audience: "public",
  });
  if (story.status !== 201) throw new Error(`création de la story : ${story.status}`);
  const report = await apiCall(reporter.cookie, "POST", `/stories/${story.data.id}/report`, { reason: "shocking" });
  if (report.status !== 201) throw new Error(`signalement : ${report.status}`);
  return { author, reporter, storyId: story.data.id };
}
