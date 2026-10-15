// Crée la base de test si besoin et lui applique les migrations, une fois avant tous les tests.
// L'URL est calculée par vitest.config.ts (DATABASE_URL du .env, nom suffixé de `_test`).
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

export default async function setup() {
  const url = new URL(process.env.ORASSO_TEST_DATABASE_URL ?? "");
  const name = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [name]);
  if (!rowCount) await client.query(`create database "${name}"`);
  await client.end();

  const pool = new pg.Pool({ connectionString: url.toString() });
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  await pool.end();
}
