// Lot R8q : la position d'une personne n'est ni stockée, ni journalisée, ni envoyée à une source (décision de Damien, comme
// « Ma météo »). Les deux sources sont des bouchons qui gardent ce qu'elles reçoivent : elles ne doivent voir que des codes de
// département. Seule la case de 0,1° est traitée par le service, et elle n'est rattachée à aucun compte.
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { call, resetDb, signUp, useClock } from "../../../test/helpers";
import { practicalSources } from "../../../test/practicalStubs";
import { db, pool } from "../../db/client";
import { externalCache, profiles } from "../../db/schema";
import { setExternalFetch } from "../../lib/external/cache";
import { resetRateLimits } from "../../lib/rateLimit";

afterAll(async () => {
  await pool.end();
});

const NOW = new Date("2026-10-16T09:00:00Z");
// Une position volontairement précise : ni elle ni aucune de ses parties ne doivent se retrouver quelque part.
const exact = { lat: 42.704937, lng: 2.895412 };
const needles = ["42.704937", "2.895412", "42.7049", "2.8954", "704937", "895412"];

beforeEach(async () => {
  await resetDb();
  await db.delete(externalCache);
  useClock(NOW);
  resetRateLimits();
});
afterEach(() => {
  setExternalFetch(null);
  vi.restoreAllMocks();
});

function captureLogs() {
  const logs: string[] = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(
        args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" "),
      );
    });
  }
  return logs;
}

const data = {
  wash: { "66": [{ name: "Lavage du Port", lat: 42.7101, lon: 2.9012 }] },
  fuel: { "66": [{ adresse: "Route de Canet", ville: "Perpignan", cp: "66000", lat: 42.6987, lon: 2.8901 }] },
};

describe("POST /practical : la position n'est ni stockée ni journalisée ni envoyée", () => {
  it("les sources ne reçoivent que des codes de département ; aucune ligne d'aucune table ne porte la position", async () => {
    const stub = practicalSources(data);
    const logs = captureLogs();
    const u = await signUp("Fan_Position");
    const profileBefore = await db.select().from(profiles);

    const res = await call(u, "POST", "/practical", { near: "position", ...exact });
    expect(res.status).toBe(200);
    expect(res.json.origin).toEqual({ kind: "cell", label: "Ma position", lat: 42.7, lng: 2.9 });
    expect(res.json.places).toHaveLength(2);

    // Les deux sources n'ont reçu que des codes de département : l'adresse et le corps de chaque appel en témoignent.
    expect(stub.calls.length).toBeGreaterThan(0);
    for (const c of stub.calls) {
      expect(c.department, JSON.stringify(c)).toMatch(/^[0-9][0-9AB]$/);
      const sent = decodeURIComponent(`${c.url}\n${c.body}`.replace(/\+/g, " "));
      for (const needle of needles) expect(sent, needle).not.toContain(needle);
      // Pas même la case : ni `lat`, ni `lng`, ni coordonnée dans la requête.
      expect(sent).not.toMatch(/around|lat\s*[:=]|lng\s*[:=]|latitude|longitude/i);
      expect(sent).not.toContain("42.7,2.9");
    }
    // Les départements demandés ne dépendent que de la case.
    const departments = new Set(stub.calls.map((c) => c.department));
    expect(departments.has("66")).toBe(true);
    expect(departments.size).toBe(2);

    // Aucune ligne d'aucune table (schéma public) ne contient la position reçue.
    const tables = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect(tables.rows.length).toBeGreaterThan(50);
    for (const { table_name } of tables.rows) {
      for (const needle of needles) {
        const found = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from ${sql.identifier(table_name)} t where t::text like ${`%${needle}%`}`,
        );
        expect(found.rows[0]?.n, `${table_name} / ${needle}`).toBe(0);
      }
    }
    // Même la case de 0,1° n'est écrite nulle part : seules les deux listes de département sont en cache.
    const keys = (await db.select({ key: externalCache.key }).from(externalCache)).map((r) => r.key).sort();
    expect(
      keys.every((k) => /^(osm|fuel2):[0-9][0-9AB]$/.test(k)),
      keys.join(","),
    ).toBe(true);
    expect(await db.select().from(profiles)).toEqual(profileBefore);

    // Ni la réponse ni les journaux de la requête ne portent la position reçue.
    for (const needle of needles) {
      expect(JSON.stringify(res.json), needle).not.toContain(needle);
      expect(logs.join("\n"), needle).not.toContain(needle);
    }
  });

  it("deux positions de la même case rendent la même réponse", async () => {
    practicalSources(data);
    const u = await signUp("Fan_Case");
    const a = await call(u, "POST", "/practical", { near: "position", lat: 42.6951, lng: 2.8512 });
    const b = await call(u, "POST", "/practical", { near: "position", lat: 42.7449, lng: 2.9488 });
    expect(a.status).toBe(200);
    expect(b.json).toEqual(a.json);
    // Une autre case : une autre origine.
    const c = await call(u, "POST", "/practical", { near: "position", lat: 42.8, lng: 2.9 });
    expect(c.json.origin).toEqual({ kind: "cell", label: "Ma position", lat: 42.8, lng: 2.9 });
  });

  it("une erreur de validation ne répète pas la position, hors de France : 400", async () => {
    const logs = captureLogs();
    const u = await signUp("Fan_Valid");
    const res = await call(u, "POST", "/practical", { near: "position", lat: 51.504937, lng: -0.1195 });
    expect(res.status).toBe(400);
    for (const needle of ["51.504937", "0.1195"]) {
      expect(JSON.stringify(res.json), needle).not.toContain(needle);
      expect(logs.join("\n"), needle).not.toContain(needle);
    }
    expect((await call(u, "POST", "/practical", { near: "position", lat: 42.7 })).status).toBe(400);
    expect((await call(u, "POST", "/practical", { near: "position", ...exact, userId: "x" })).status).toBe(400);
    expect((await call(null, "POST", "/practical", { near: "position", ...exact })).status).toBe(401);
  });

  it("source en panne avec une position : les journaux ne portent toujours pas la position", async () => {
    practicalSources(data, { fail: ["wash", "fuel"] });
    const logs = captureLogs();
    const u = await signUp("Fan_Panne");
    const res = await call(u, "POST", "/practical", { near: "position", ...exact });
    expect(res.status).toBe(200);
    expect(res.json.partial).toBe(true);
    for (const needle of needles) expect(logs.join("\n"), needle).not.toContain(needle);
  });
});
