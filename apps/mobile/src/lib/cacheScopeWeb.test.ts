// Purge par préfixe dans le navigateur (recette web) : même si l'index du compte est perdu, la déconnexion balaie
// les clés à identifiant du compte (le trousseau natif ne se liste pas, il reste sur l'index).
import { beforeEach, describe, expect, it, vi } from "vitest";

const local = new Map<string, string>();

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-secure-store", () => ({}));
vi.stubGlobal("localStorage", {
  getItem: (key: string) => local.get(key) ?? null,
  setItem: (key: string, value: string) => void local.set(key, value),
  removeItem: (key: string) => void local.delete(key),
  get length() {
    return local.size;
  },
  key: (i: number) => [...local.keys()][i] ?? null,
});
// `Object.keys(localStorage)` : le stub expose ses clés comme propriétés.
const sync = new Proxy(globalThis.localStorage, {
  ownKeys: () => [...local.keys()],
  getOwnPropertyDescriptor: (_t, k) => (local.has(String(k)) ? { enumerable: true, configurable: true } : undefined),
});
vi.stubGlobal("localStorage", sync);

import { bindCacheScope, cacheGetJson, cacheSetJson, kvDel, kvKey, purgeCaches } from "./kv";

beforeEach(async () => {
  await purgeCaches();
  local.clear();
});

describe("purge par préfixe (web)", () => {
  it("efface les clés à identifiant du compte même sans index", async () => {
    await bindCacheScope("compte-a");
    await cacheSetJson("feed.salon", { prive: "de-a" });
    await cacheSetJson("recap.e1", { prive: "de-a" });
    // L'index est perdu (écriture interrompue, stockage partiellement vidé).
    await kvDel("cache-index.compte-a");
    expect([...local.keys()].some((k) => k.startsWith(kvKey("cache.compte-a.feed.")))).toBe(true);

    await purgeCaches();
    expect([...local.keys()].filter((k) => k.startsWith(kvKey("cache.")))).toEqual([]);

    await bindCacheScope("compte-a");
    expect(await cacheGetJson("feed.salon")).toBeNull();
    expect(await cacheGetJson("recap.e1")).toBeNull();
  });
});
