// Bases de test parallèles : une base modèle migrée une fois (`<base>_test_tpl`), puis une base clonée par processus
// de test (`<base>_test_<VITEST_POOL_ID>`). Le modèle et les clones portent l'empreinte des migrations
// (commentaire de la base) : si `apps/api/drizzle` change, ils sont recréés au passage suivant.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
// Verrou consultatif unique : sérialise la création du modèle et des clones entre processus.
const LOCK_KEY = 7_315_204;

/** Empreinte de tous les fichiers de migration (chemins relatifs et contenus). */
export function migrationsFingerprint(dir = migrationsFolder): string {
  const hash = createHash("sha256");
  const walk = (current: string, prefix: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(join(current, entry.name), `${rel}/`);
      else hash.update(`${rel}\0`).update(readFileSync(join(current, entry.name))).update("\0");
    }
  };
  walk(dir, "");
  return hash.digest("hex");
}

/** `postgres://…/<base>_test` → noms des bases modèle et du clone d'un processus. */
export function databaseNames(testUrl: string, poolId: string) {
  const base = new URL(testUrl).pathname.slice(1);
  return { template: `${base}_tpl`, worker: `${base}_${poolId}` };
}

export function withDatabase(testUrl: string, name: string): string {
  const url = new URL(testUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function withAdmin<T>(testUrl: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const admin = new URL(testUrl);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    return await fn(client);
  } finally {
    await client.end(); // libère aussi le verrou
  }
}

async function fingerprintOf(client: pg.Client, name: string): Promise<string | null | undefined> {
  const { rows } = await client.query(
    "select shobj_description(oid, 'pg_database') as fp from pg_database where datname = $1",
    [name],
  );
  return rows[0] ? (rows[0].fp ?? null) : undefined; // undefined : la base n'existe pas
}

async function setFingerprint(client: pg.Client, name: string, fp: string) {
  await client.query(`comment on database "${name}" is '${fp}'`);
}

async function ensureTemplate(client: pg.Client, testUrl: string, template: string, fp: string) {
  if ((await fingerprintOf(client, template)) === fp) return;
  await client.query(`drop database if exists "${template}" with (force)`);
  await client.query(`create database "${template}"`);
  const pool = new pg.Pool({ connectionString: withDatabase(testUrl, template), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
  await setFingerprint(client, template, fp);
}

/** Crée (ou recrée si les migrations ont changé) le modèle puis les clones demandés. */
export async function ensureDatabases(testUrl: string, poolIds: string[]) {
  const fp = migrationsFingerprint();
  await withAdmin(testUrl, async (client) => {
    const { template } = databaseNames(testUrl, "0");
    await ensureTemplate(client, testUrl, template, fp);
    for (const poolId of poolIds) {
      const { worker } = databaseNames(testUrl, poolId);
      if ((await fingerprintOf(client, worker)) === fp) continue;
      await client.query(`drop database if exists "${worker}" with (force)`);
      await client.query(`create database "${worker}" template "${template}"`);
      await setFingerprint(client, worker, fp);
    }
  });
}
