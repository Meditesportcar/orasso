// Lot 54b : les caches de lecture (useApi, candidatures) sont propres au compte connecté. Le trousseau est simulé par
// une table en mémoire qui survit à l'« appli » (comme le trousseau d'un vrai appareil).
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void store.set(key, value),
  deleteItemAsync: async (key: string) => void store.delete(key),
}));

import {
  bindCacheScope,
  cacheGetJson,
  cacheScope,
  cacheSetJson,
  kvGetJson,
  kvKey,
  kvSetJson,
  purgeCaches,
} from "./kv";

const cacheKeysInStore = () => [...store.keys()].filter((k) => k.startsWith(kvKey("cache")));

beforeEach(async () => {
  await purgeCaches();
  store.clear();
});

describe("caches de lecture par compte", () => {
  it("ne lit ni n'écrit rien tant qu'aucun compte n'est lié", async () => {
    await cacheSetJson("provider-profile", { name: "Sans compte" });
    expect(await cacheGetJson("provider-profile")).toBeNull();
    expect(cacheKeysInStore()).toEqual([]);
  });

  it("garde la valeur du compte connecté, y compris hors ligne (lecture seule du cache)", async () => {
    await bindCacheScope("compte-a");
    await cacheSetJson("provider-applications", [{ id: "c1", refusalNote: "Complet" }]);
    expect(await cacheGetJson("provider-applications")).toEqual([{ id: "c1", refusalNote: "Complet" }]);
  });

  it("changement de compte sur le même appareil : le second ne lit jamais le cache du premier", async () => {
    await bindCacheScope("compte-a");
    await cacheSetJson("my-pro", { name: "Garage A" });
    await cacheSetJson("pro-stats", { scans: 12 });

    // Le premier compte n'a pas été déconnecté proprement : le second se connecte directement.
    await bindCacheScope("compte-b");
    expect(cacheScope()).toBe("compte-b");
    expect(await cacheGetJson("my-pro")).toBeNull();
    expect(await cacheGetJson("pro-stats")).toBeNull();
    // Et rien du premier compte ne reste sur l'appareil.
    expect(cacheKeysInStore().some((k) => k.includes("compte-a"))).toBe(false);

    await cacheSetJson("my-pro", { name: "Garage B" });
    expect(await cacheGetJson("my-pro")).toEqual({ name: "Garage B" });
  });

  it("déconnexion : plus aucune clé de cache du compte, et plus de lecture possible", async () => {
    await bindCacheScope("compte-a");
    await cacheSetJson("my-pro", { name: "Garage A" });
    await cacheSetJson("missions-list", [1, 2, 3]);
    expect(cacheKeysInStore().length).toBeGreaterThan(0);

    await purgeCaches();
    expect(cacheKeysInStore()).toEqual([]);
    expect(cacheScope()).toBeNull();
    expect(await cacheGetJson("my-pro")).toBeNull();
  });

  it("après un redémarrage de l'appli, la déconnexion retrouve le compte lié et l'efface", async () => {
    await bindCacheScope("compte-a");
    await cacheSetJson("my-pro", { name: "Garage A" });
    // Redémarrage : la mémoire est perdue, pas le trousseau (on simule en liant puis en déliant sans purge).
    vi.resetModules();
    const fresh = await import("./kv");
    expect(fresh.cacheScope()).toBeNull();
    await fresh.purgeCaches();
    expect(cacheKeysInStore()).toEqual([]);
  });

  it("les écritures simultanées ne perdent aucune clé de l'index", async () => {
    await bindCacheScope("compte-a");
    await Promise.all(["a", "b", "c", "d", "e"].map((key) => cacheSetJson(key, key)));
    expect(await kvGetJson<string[]>("cache-index.compte-a")).toHaveLength(5);
    await purgeCaches();
    expect(cacheKeysInStore()).toEqual([]);
  });

  it("une écriture lancée juste avant la déconnexion ne ressuscite pas le cache", async () => {
    await bindCacheScope("compte-a");
    const pending = cacheSetJson("my-pro", { name: "Garage A" });
    await purgeCaches();
    await pending;
    expect(cacheKeysInStore()).toEqual([]);
  });

  it("n'altère pas les clés qui ne sont pas des caches", async () => {
    await kvSetJson("theme", "dark");
    await bindCacheScope("compte-a");
    await purgeCaches();
    expect(await kvGetJson("theme")).toBe("dark");
  });
});
