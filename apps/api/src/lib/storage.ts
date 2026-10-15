// Stockage des fichiers (photos, logos, affiches). Pilote « disque » : UPLOADS_DIR (défaut DATA_DIR/storage),
// servi par /api/files/*.
// Le pilote S3 OVH viendra quand les clés existeront (H7) : même interface.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";

import { env, repoRoot } from "../env";

const dataDir = isAbsolute(env.DATA_DIR) ? env.DATA_DIR : resolve(repoRoot, env.DATA_DIR);
const storageDir = env.UPLOADS_DIR ? resolve(repoRoot, env.UPLOADS_DIR) : join(dataDir, "storage");

function pathOf(key: string): string {
  const p = normalize(join(storageDir, key));
  if (!p.startsWith(storageDir) || key.includes("..")) throw new Error(`Clé de stockage invalide : ${key}`);
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
