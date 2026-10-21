// Bases de test parallèles : un modèle migré, puis un clone par processus. Noms courts :
// `<préfixe>_test_<identité>_tpl` / `…_<VITEST_POOL_ID>`. Le commentaire identifie la suite et les migrations
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
      else
        hash
          .update(`${rel}\0`)
          .update(readFileSync(join(current, entry.name)))
          .update("\0");
    }
  };
  walk(dir, "");
  return hash.digest("hex");
}

function databaseIdentity(testUrl: string) {
  const source = decodeURIComponent(new URL(testUrl).pathname.slice(1));
  if (!source) throw new Error("Base source manquante");
  const identity = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const prefix = source.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 30);
  return { source, stem: `${prefix}_test_${identity}`, owner: `orasso-api-tests:v1:${identity}:` };
}

/** URL de la base SOURCE → noms ASCII distincts et inférieurs à 63 octets. */
export function databaseNames(testUrl: string, poolId: string) {
  if (!/^[1-9]\d{0,5}$/.test(poolId)) throw new Error("Identifiant de processus invalide");
  const { source, stem } = databaseIdentity(testUrl);
  const names = { template: `${stem}_tpl`, worker: `${stem}_${poolId}` };
  for (const name of Object.values(names)) {
    if (Buffer.byteLength(name, "utf8") > 63 || name === source) throw new Error("Nom de base de test dangereux");
  }
  return names;
}

function generatedName(testUrl: string, name: string): boolean {
  const { source, stem } = databaseIdentity(testUrl);
  const suffix = name.slice(stem.length + 1);
  return (
    name !== source &&
    Buffer.byteLength(name, "utf8") <= 63 &&
    name.startsWith(`${stem}_`) &&
    (suffix === "tpl" || /^[1-9]\d{0,5}$/.test(suffix))
  );
}

/** Vérifiée avant CHAQUE DROP : le nom seul ne constitue jamais une preuve d'appartenance. */
export function assertGeneratedDatabase(testUrl: string, name: string, comment: string | null) {
  const { owner } = databaseIdentity(testUrl);
  if (
    !generatedName(testUrl, name) ||
    !comment?.startsWith(owner) ||
    !/^[a-f0-9]{64}$/.test(comment.slice(owner.length))
  ) {
    throw new Error(`Suppression refusée : base non reconnue par la suite (${name})`);
  }
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

async function dropGeneratedDatabase(client: pg.Client, testUrl: string, name: string) {
  const comment = await fingerprintOf(client, name);
  if (comment === undefined) return;
  assertGeneratedDatabase(testUrl, name, comment);
  await client.query(`drop database "${name}" with (force)`);
}

async function ensureTemplate(client: pg.Client, testUrl: string, template: string, fp: string, dir: string) {
  if ((await fingerprintOf(client, template)) === fp) return;
  await dropGeneratedDatabase(client, testUrl, template);
  await client.query(`create database "${template}"`);
  // Marqué avant migration : une migration interrompue reste récupérable par la suite (empreinte provisoire).
  await setFingerprint(client, template, `${databaseIdentity(testUrl).owner}${"0".repeat(64)}`);
  const pool = new pg.Pool({ connectionString: withDatabase(testUrl, template), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: dir });
  } finally {
    await pool.end();
  }
  await setFingerprint(client, template, fp);
}

/** Crée (ou recrée si les migrations ont changé) le modèle puis les clones demandés. */
export async function ensureDatabases(testUrl: string, poolIds: string[], dir = migrationsFolder) {
  // Tout valider avant de créer ou supprimer quoi que ce soit.
  const names = poolIds.map((id) => databaseNames(testUrl, id));
  const { template } = databaseNames(testUrl, "1");
  const fp = `${databaseIdentity(testUrl).owner}${migrationsFingerprint(dir)}`;
  await withAdmin(testUrl, async (client) => {
    await ensureTemplate(client, testUrl, template, fp, dir);
    for (const { worker } of names) {
      if ((await fingerprintOf(client, worker)) === fp) continue;
      await dropGeneratedDatabase(client, testUrl, worker);
      await client.query(`create database "${worker}" template "${template}"`);
      await setFingerprint(client, worker, fp);
    }
  });
}

/** Nettoyage à froid sur le serveur de l'URL source, limité aux bases reconnues de cette suite. */
export async function cleanDatabases(testUrl: string) {
  return withAdmin(testUrl, async (client) => {
    const { rows } = await client.query<{ datname: string }>("select datname from pg_database");
    const names = rows.map((r) => r.datname).filter((name) => generatedName(testUrl, name));
    // Vérifier toutes les empreintes avant la première suppression.
    for (const name of names) assertGeneratedDatabase(testUrl, name, (await fingerprintOf(client, name)) ?? null);
    for (const name of names) await dropGeneratedDatabase(client, testUrl, name);
    return names;
  });
}
