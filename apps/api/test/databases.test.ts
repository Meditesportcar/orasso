import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as migrator from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  assertGeneratedDatabase,
  cleanDatabases,
  databaseNames,
  ensureDatabases,
  migrationsFingerprint,
  withDatabase,
} from "./databases";

// setup-process a déjà chargé le vrai module avant les mocks de ce fichier.
vi.hoisted(() => vi.resetModules());
vi.mock("drizzle-orm/node-postgres/migrator", () => ({ migrate: vi.fn() }));

const urlFor = (name: string) => withDatabase(process.env.ORASSO_TEST_DATABASE_URL!, name);
const commentFor = (name: string, fp = "a".repeat(64)) =>
  `orasso-api-tests:v1:${createHash("sha256").update(name).digest("hex").slice(0, 12)}:${fp}`;

describe("noms et garde des bases de test", () => {
  it.each(["orasso", "a".repeat(63), "é".repeat(63), "a".repeat(58), "base\"avec'guillemets", "orasso_test"])(
    "noms courts et distincts de la source : %s",
    (source) => {
      const url = urlFor(source);
      const { template, worker } = databaseNames(url, "1");
      expect(new Set([source, template, worker, databaseNames(url, "2").worker]).size).toBe(4);
      for (const name of [template, worker]) {
        expect(Buffer.byteLength(name, "utf8")).toBeLessThanOrEqual(63);
        expect(name).toMatch(/^[a-zA-Z0-9_]+$/);
        expect(() => assertGeneratedDatabase(url, name, commentFor(source))).not.toThrow();
      }
    },
  );

  it("l'empreinte distingue les sources dont le préfixe tronqué est identique", () => {
    const a = databaseNames(urlFor(`${"a".repeat(62)}b`), "1");
    const b = databaseNames(urlFor(`${"a".repeat(62)}c`), "1");
    expect(a.template).not.toBe(b.template);
    expect(a.worker).not.toBe(b.worker);
  });

  it.each(["0", "01", "-1", "tpl", '1"', "1000000"])("refuse l'identifiant %s", (poolId) => {
    expect(() => databaseNames(urlFor("orasso"), poolId)).toThrow();
  });

  it("refuse la source, les noms étrangers ou tronqués, même avec le bon commentaire", () => {
    const source = "a".repeat(63);
    const url = urlFor(source);
    const names = databaseNames(url, "1");
    for (const name of [
      source,
      "postgres",
      "orasso_test_1",
      `${names.worker}x`,
      `${names.template}_1`,
      "a".repeat(64),
    ]) {
      expect(() => assertGeneratedDatabase(url, name, commentFor(source))).toThrow("Suppression refusée");
    }
  });

  it.each([null, "", "a".repeat(64), commentFor("autre"), commentFor("orasso", "invalide")])(
    "refuse un commentaire absent, ancien ou étranger : %s",
    (comment) => {
      expect(() =>
        assertGeneratedDatabase(urlFor("orasso"), databaseNames(urlFor("orasso"), "1").worker, comment),
      ).toThrow();
    },
  );

  it("accepte une ancienne empreinte de migrations appartenant à cette suite", () => {
    const url = urlFor("orasso");
    expect(() =>
      assertGeneratedDatabase(url, databaseNames(url, "1").template, commentFor("orasso", "b".repeat(64))),
    ).not.toThrow();
  });
});

it("réutilise modèle et clones, puis les recrée si les migrations changent, sans toucher la source", async () => {
  const testUrl = urlFor("regression");
  const dir = await mkdtemp(join(tmpdir(), "orasso-migrations-"));
  const names = databaseNames(testUrl, "1");
  const databases = new Map<string, string | null>([
    ["regression", null],
    ["foreign_test_1", null],
  ]);
  // Simule les métadonnées du serveur ; les empreintes sont calculées sur de vrais fichiers temporaires.
  // Aucun DROP réel dans un test parallèle : il imposerait des checkpoints à toute la suite.
  const query = vi.fn(async (sql: string, params?: string[]) => {
    if (sql.startsWith("select pg_advisory_lock")) return { rows: [] };
    if (sql.includes("shobj_description")) {
      const name = params![0]!;
      return { rows: databases.has(name) ? [{ fp: databases.get(name) }] : [] };
    }
    if (sql === "select datname from pg_database")
      return { rows: [...databases.keys()].map((datname) => ({ datname })) };
    const name = /database "([^"]+)"/.exec(sql)?.[1];
    if (!name) throw new Error(`SQL inattendu : ${sql}`);
    if (sql.startsWith("create database")) databases.set(name, null);
    else if (sql.startsWith("drop database")) databases.delete(name);
    else if (sql.startsWith("comment on database")) databases.set(name, /is '([^']+)'/.exec(sql)![1]!);
    else throw new Error(`SQL inattendu : ${sql}`);
    return { rows: [] };
  });
  class ClientMock extends pg.Client {
    override connect = vi.fn(async () => this) as pg.Client["connect"];
    override end = vi.fn(async () => {});
    override query = query as unknown as pg.Client["query"];
  }
  class PoolMock extends pg.Pool {
    override end = vi.fn(async () => {});
  }
  vi.spyOn(pg, "Client").mockImplementation(ClientMock);
  vi.spyOn(pg, "Pool").mockImplementation(PoolMock);
  const migrate = vi.mocked(migrator.migrate).mockResolvedValue(undefined);
  const drops = () => query.mock.calls.filter(([sql]) => sql.startsWith("drop database")).map(([sql]) => sql);
  try {
    await mkdir(join(dir, "meta"));
    await writeFile(
      join(dir, "meta/_journal.json"),
      JSON.stringify({ entries: [{ when: 1, tag: "0000_probe", breakpoints: true }] }),
    );
    await writeFile(join(dir, "0000_probe.sql"), "create table probe (id integer);");
    await ensureDatabases(testUrl, ["1"], dir);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(drops()).toEqual([]);
    const first = new Map(databases);
    await ensureDatabases(testUrl, ["1"], dir);
    expect(databases).toEqual(first);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(drops()).toEqual([]);
    // Une base au bon nom mais sans marqueur ne doit jamais être supprimée, ni par ensure ni par le nettoyage.
    databases.set(names.worker, null);
    await expect(ensureDatabases(testUrl, ["1"], dir)).rejects.toThrow("Suppression refusée");
    await expect(cleanDatabases(testUrl)).rejects.toThrow("Suppression refusée");
    expect(drops()).toEqual([]);
    databases.set(names.worker, first.get(names.worker)!);
    const fp = migrationsFingerprint(dir);
    await writeFile(join(dir, "0000_probe.sql"), "create table probe (id integer, added text);");
    expect(migrationsFingerprint(dir)).not.toBe(fp);
    await ensureDatabases(testUrl, ["1"], dir);
    expect(migrate).toHaveBeenCalledTimes(2);
    expect(drops()).toEqual([
      `drop database "${names.template}" with (force)`,
      `drop database "${names.worker}" with (force)`,
    ]);
    for (const name of Object.values(names))
      expect(databases.get(name)).toBe(commentFor("regression", migrationsFingerprint(dir)));
    await cleanDatabases(testUrl);
    expect(databases).toEqual(
      new Map([
        ["regression", null],
        ["foreign_test_1", null],
      ]),
    );
  } finally {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  }
});
