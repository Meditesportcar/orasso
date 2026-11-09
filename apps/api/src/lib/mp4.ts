// Lecteur de conteneur MP4 / MOV (lot R7g) : la logique est dans `@orasso/shared` (`rules/mp4.ts`, pure : l'appli et le site
// s'en servent aussi pour savoir si une vidéo est en H.264 avant de l'envoyer). Ici seulement les sources de l'API : un
// fichier du disque (lu par petits morceaux, jamais chargé) ou un tampon (essais).
import { open } from "node:fs/promises";
import { type Mp4Info, mp4BufferSource, readMp4 } from "@orasso/shared";

export { Mp4Error, type Mp4ErrorKind, type Mp4Info } from "@orasso/shared";

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
