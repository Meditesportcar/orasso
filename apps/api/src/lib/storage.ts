// Stockage des fichiers (photos, logos, affiches). Pilote « disque » : UPLOADS_DIR (défaut DATA_DIR/storage),
// servi par /api/files/*.
// Le pilote S3 OVH viendra quand les clés existeront (H7) : même interface.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

import { env, repoRoot } from "../env";

const dataDir = isAbsolute(env.DATA_DIR) ? env.DATA_DIR : resolve(repoRoot, env.DATA_DIR);
const storageDir = env.UPLOADS_DIR ? resolve(repoRoot, env.UPLOADS_DIR) : join(dataDir, "storage");

/**
 * Chemin d'une clé, toujours **sous** le dossier de stockage (lot R5c1, tour 2 : `/api/files//private/…` retombait dans
 * `storage/private/…`). Refusés : barre initiale, barre inverse, segment vide, `.` ou `..`, caractère de contrôle.
 */
export function pathOf(key: string): string {
  const invalid = () => new Error("Clé de stockage invalide");
  // biome-ignore lint/suspicious/noControlCharactersInRegex: on refuse justement les caractères de contrôle.
  if (!key || key.startsWith("/") || key.includes("\\") || /[\u0000-\u001f\u007f]/.test(key)) throw invalid();
  const parts = key.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) throw invalid();
  const p = resolve(storageDir, ...parts);
  if (!p.startsWith(storageDir + sep)) throw invalid();
  return p;
}

export const storage = {
  async put(key: string, data: Buffer): Promise<void> {
    const p = pathOf(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  },
  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(pathOf(key));
    } catch {
      return null;
    }
  },
  async remove(key: string): Promise<void> {
    await rm(pathOf(key), { force: true });
  },
  /** URL publique (photos de véhicules, logos et affiches sont publics par nature). */
  url(key: string | null): string | null {
    return key ? `/api/files/${key}` : null;
  },
};

export { dataDir, storageDir };
