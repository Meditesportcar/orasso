// Lecteur de conteneur MP4 / MOV (lot R7g) : la logique est dans `@orasso/shared` (`rules/mp4.ts`, pure : l'appli et le site
// s'en servent aussi pour savoir si une vidéo est en H.264 avant de l'envoyer). Ici seulement les sources de l'API : un
// fichier du disque (lu par petits morceaux, jamais chargé) ou un tampon (essais).
import { open } from "node:fs/promises";
import { type Mp4Error, type Mp4Info, mp4BufferSource, readMp4, storyVideoLabels } from "@orasso/shared";

export { Mp4Error, type Mp4ErrorKind, type Mp4Info } from "@orasso/shared";

/** Message (415) d'un fichier que le lecteur refuse. */
export const mp4ErrorMessage = (error: Mp4Error): string =>
  error.kind === "no_video"
    ? storyVideoLabels.apiNoVideo
    : error.kind === "location_track"
      ? storyVideoLabels.apiLocationTrack
      : storyVideoLabels.apiUnreadable;

/** Lit un fichier du disque sans le charger (un descripteur, des lectures de quelques octets). */
export async function readMp4File(path: string): Promise<Mp4Info> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    return await readMp4({
      size,
      read: async (offset, length) => {
        const buffer = Buffer.alloc(Math.min(length, Math.max(0, size - offset)));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
        return buffer.subarray(0, bytesRead);
      },
    });
  } finally {
    await handle.close();
  }
}

export const readMp4Buffer = (data: Uint8Array): Promise<Mp4Info> => readMp4(mp4BufferSource(data));

/** Boîtes qui peuvent porter un lieu, un appareil ou un auteur : `udta` (dont `©xyz`), `meta` (dont les clés Apple) et `uuid`. */
const METADATA_BOXES = new Set(["udta", "meta", "uuid"]);
/** Plus gros `moov` parcouru (même borne que le lecteur). */
const STRIP_MOOV_MAX = 8 * 1024 * 1024;

type RawBox = { type: string; offset: number; header: number; size: number };

function rawBoxes(data: Buffer, from: number, to: number, base: number): RawBox[] {
  const boxes: RawBox[] = [];
  let o = from;
  while (o + 8 <= to) {
    let size = data.readUInt32BE(o);
    let header = 8;
    if (size === 1) {
      if (o + 16 > to) break;
      size = Number(data.readBigUInt64BE(o + 8));
      header = 16;
    } else if (size === 0) size = to - o;
    if (size < header || o + size > to) break;
    boxes.push({ type: data.toString("latin1", o + 4, o + 8), offset: base + o, header, size });
    o += size;
  }
  return boxes;
}

/**
 * Efface d'une vidéo tout ce qui peut dire où et avec quoi elle a été filmée (lot R7g, tour 2 : la position GPS des
 * iPhone et des Android est dans `udta`/`©xyz` ou dans `meta`). Les boîtes `udta`, `meta` et `uuid`, au premier niveau,
 * sous `moov` et dans chaque `trak`, changent de **type** pour `free` et leur contenu est mis à zéro : même taille, donc
 * les décalages `stco`/`co64` restent valides et le fichier se lit comme avant. À appeler après la vérification (le fichier est alors bien formé).
 * Rend le nombre de boîtes neutralisées.
 */
export async function stripMp4Metadata(path: string): Promise<number> {
  const handle = await open(path, "r+");
  try {
    const { size } = await handle.stat();
    const free = Buffer.from("free", "latin1");
    let done = 0;
    const zeros = Buffer.alloc(1024 * 1024);
    const neutralise = async (box: RawBox) => {
      await handle.write(free, 0, 4, box.offset + 4);
      // Le contenu d'une boîte `free` est ignoré par tous les lecteurs : on l'efface aussi (le lieu ne reste pas dans le fichier).
      for (let at = box.offset + box.header; at < box.offset + box.size; at += zeros.length) {
        const length = Math.min(zeros.length, box.offset + box.size - at);
        await handle.write(zeros, 0, length, at);
      }
      done++;
    };
    // Premier niveau : seulement les en-têtes, `mdat` n'est jamais lu.
    let offset = 0;
    const tops: RawBox[] = [];
    while (offset + 8 <= size) {
      const head = Buffer.alloc(16);
      const { bytesRead } = await handle.read(head, 0, 16, offset);
      if (bytesRead < 8) break;
      let total = head.readUInt32BE(0);
      let header = 8;
      if (total === 1) {
        if (bytesRead < 16) break;
        total = Number(head.readBigUInt64BE(8));
        header = 16;
      } else if (total === 0) total = size - offset;
      if (total < header || offset + total > size) break;
      tops.push({ type: head.toString("latin1", 4, 8), offset, header, size: total });
      offset += total;
    }
    for (const top of tops) {
      if (METADATA_BOXES.has(top.type)) await neutralise(top);
      else if (top.type === "moov" && top.size <= STRIP_MOOV_MAX) {
        const moov = Buffer.alloc(top.size);
        await handle.read(moov, 0, top.size, top.offset);
        for (const child of rawBoxes(moov, top.header, top.size, top.offset)) {
          if (METADATA_BOXES.has(child.type)) await neutralise(child);
          else if (child.type === "trak") {
            const rel = child.offset - top.offset;
            for (const inner of rawBoxes(moov, rel + child.header, rel + child.size, top.offset)) {
              if (METADATA_BOXES.has(inner.type)) await neutralise(inner);
            }
          }
        }
      }
    }
    return done;
  } finally {
    await handle.close();
  }
}
