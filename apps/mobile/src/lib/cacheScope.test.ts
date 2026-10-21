// Lot 54b : les caches de lecture (useApi, candidatures) sont propres au compte connecté. Le trousseau est simulé par
// une table en mémoire qui survit à l'« appli » (comme le trousseau d'un vrai appareil).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void store.set(key, value),
  deleteItemAsync: async (key: string) => void store.delete(key),
}));

import {
  accountGuard,
  bindCacheScope,
  CACHE_KEY_PREFIXES,
  cacheGetJson,
  cacheScope,
  cacheSetJson,
  kvGet,
  kvGetJson,
  kvKey,
  kvSet,
  kvSetJson,
  LEGACY_CACHE_KEYS,
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

  it("réponse tardive du compte A livrée après la connexion de B : B ne voit rien de A, son cache non plus", async () => {
    await bindCacheScope("compte-a");
    // La requête part sous A (c'est ce que font useApi et ApplicationsProvider).
    const guard = accountGuard();
    expect(guard.scope).toBe("compte-a");

    // Déconnexion de A, connexion de B, pendant que la réponse est encore en route.
    await purgeCaches();
    await bindCacheScope("compte-b");
    expect(guard.current()).toBe(false);

    // La réponse arrive : l'écriture est refusée, le cache de B reste vide.
    await cacheSetJson("applications.upcoming", [{ id: "privee-de-a" }], guard.scope);
    expect(await cacheGetJson("applications.upcoming")).toBeNull();
    expect(JSON.stringify([...store.entries()])).not.toContain("privee-de-a");
  });

  it("la garde reste valable tant que le compte est le même (reconnexion du même compte comprise)", async () => {
    await bindCacheScope("compte-a");
    const guard = accountGuard();
    await purgeCaches();
    await bindCacheScope("compte-a");
    expect(guard.current()).toBe(true);
    await cacheSetJson("my-pro", { name: "Garage A" }, guard.scope);
    expect(await cacheGetJson("my-pro")).toEqual({ name: "Garage A" });
  });

  it("une requête lancée sans compte (écran public) reste valable après la connexion", async () => {
    const guard = accountGuard();
    expect(guard.scope).toBeNull();
    await bindCacheScope("compte-a");
    expect(guard.current()).toBe(true);
  });
});

describe("anciennes clés de cache sans compte", () => {
  it("sont effacées une seule fois, à la première liaison d'un compte", async () => {
    for (const key of LEGACY_CACHE_KEYS) await kvSet(key, JSON.stringify({ ancien: "compte" }));
    await kvSet("theme", "dark");

    await bindCacheScope("compte-a");
    for (const key of LEGACY_CACHE_KEYS) expect(await kvGet(key)).toBeNull();
    expect(await kvGet("theme")).toBe("dark");

    // Déjà fait : une clé réapparue plus tard n'est plus touchée (purge unique).
    await kvSet("my-pro", "x");
    await purgeCaches();
    await bindCacheScope("compte-b");
    expect(await kvGet("my-pro")).toBe("x");
  });
});

describe("clés de cache à identifiant (registre des préfixes)", () => {
  it("une clé à identifiant posée sous le compte A n'est lisible ni après la déconnexion, ni par B", async () => {
    await bindCacheScope("compte-a");
    await cacheSetJson("feed.salon-argeles", { prive: "de-a" });
    await cacheSetJson("orga-events-structure-1", [{ id: "e1" }]);
    expect(await cacheGetJson("feed.salon-argeles")).toEqual({ prive: "de-a" });

    await purgeCaches();
    expect(await cacheGetJson("feed.salon-argeles")).toBeNull();
    expect(JSON.stringify([...store.entries()])).not.toContain("de-a");

    await bindCacheScope("compte-b");
    expect(await cacheGetJson("feed.salon-argeles")).toBeNull();
    expect(await cacheGetJson("orga-events-structure-1")).toBeNull();
    // Même si A se reconnecte : sa déconnexion a tout effacé.
    await purgeCaches();
    await bindCacheScope("compte-a");
    expect(await cacheGetJson("feed.salon-argeles")).toBeNull();
  });

  it("tout cacheKey à identifiant du code a son préfixe dans le registre", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(path);
      }
    };
    walk(root);
    const missing: string[] = [];
    for (const file of files) {
      // `cacheKey: \`prefixe${id}\`` : la partie fixe avant la première interpolation est le préfixe.
      for (const match of readFileSync(file, "utf8").matchAll(/cacheKey:\s*`([^`$]*)\$\{/g)) {
        const prefix = match[1] ?? "";
        if (!CACHE_KEY_PREFIXES.some((known) => prefix.startsWith(known))) missing.push(`${file} : « ${prefix} »`);
      }
    }
    expect(missing).toEqual([]);
  });
});
