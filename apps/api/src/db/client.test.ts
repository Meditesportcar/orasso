import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { pool } from "./client";

afterAll(async () => {
  await pool.end();
});

/** Coupe la connexion `pid` depuis une connexion à part, comme le fait PostgreSQL quand on l'arrête. */
async function terminate(pid: number) {
  const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  try {
    await admin.query("select pg_terminate_backend($1)", [pid]);
  } finally {
    await admin.end();
  }
}

async function backendPid(client: pg.PoolClient) {
  const { rows } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
  return rows[0]!.pid;
}

// Sans les écouteurs de `client.ts`, node-postgres lève l'erreur hors de toute promesse : vitest la compte comme
// erreur non gérée et la suite échoue. On attend donc la fin de la connexion (`end`), jamais son `error`, pour ne
// pas fournir soi-même l'écouteur manquant.
describe("connexion à la base coupée par PostgreSQL", () => {
  it("au repos : l'API ne tombe pas et la requête suivante passe", async () => {
    const client = await pool.connect();
    const pid = await backendPid(client);
    client.release();
    const ended = new Promise((resolve) => client.once("end", resolve));
    await terminate(pid);
    await ended;
    const { rows } = await pool.query<{ ok: number }>("select 1 as ok");
    expect(rows[0]!.ok).toBe(1);
  });

  it("empruntée (transaction en cours) : l'API ne tombe pas et la connexion morte n'est pas resservie", async () => {
    const client = await pool.connect();
    const removed = new Promise((resolve) => pool.once("remove", resolve));
    try {
      const pid = await backendPid(client);
      await client.query("begin");
      const ended = new Promise((resolve) => client.once("end", resolve));
      await terminate(pid);
      await ended;
      await expect(client.query("select 1")).rejects.toThrow();
    } finally {
      // Comme Drizzle à la fin d'une transaction : `release()` sans argument ; c'est au pool d'écarter la connexion.
      client.release();
    }
    expect(await removed).toBe(client);
    const { rows } = await pool.query<{ ok: number }>("select 1 as ok");
    expect(rows[0]!.ok).toBe(1);
  });
});
