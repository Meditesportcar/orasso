import { beforeEach, describe, expect, it, vi } from "vitest";

const device = vi.hoisted(() => ({
  os: "web",
  storage: new Map<string, string>(),
  files: new Map<string, string>(),
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return device.os;
    },
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => device.storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void device.storage.set(key, value),
  deleteItemAsync: async (key: string) => void device.storage.delete(key),
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "file:///documents" },
  File: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    get exists() {
      return device.files.has(this.uri);
    }
    create() {
      device.files.set(this.uri, "");
    }
    write(value: string) {
      device.files.set(this.uri, value);
    }
    delete() {
      device.files.delete(this.uri);
    }
    async text() {
      return device.files.get(this.uri) ?? "";
    }
  },
  Directory: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    list() {
      return [...device.files.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`))
        .map((uri) => ({
          name: uri.slice(this.uri.length + 1),
          delete: () => void device.files.delete(uri),
        }));
    }
  },
}));

const when = new Date("2026-11-11T10:00:00.000Z");
const big = { cards: Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, text: "x".repeat(2_500) })) };

describe.each(["web", "ios"])("copie hors ligne (%s)", (os) => {
  let kv: typeof import("./kv");
  let copy: typeof import("./offlineCopy");
  beforeEach(async () => {
    vi.resetModules();
    device.os = os;
    device.storage.clear();
    device.files.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => device.storage.get(key) ?? null,
      setItem: (key: string, raw: string) => void device.storage.set(key, raw),
      removeItem: (key: string) => void device.storage.delete(key),
    });
    kv = await import("./kv");
    copy = await import("./offlineCopy");
  });

  it("sans compte lié, ne garde ni ne lit rien", async () => {
    await copy.saveCopy("fil.for_you", big, when);
    expect(await copy.readCopy("fil.for_you")).toBeNull();
    expect(device.files.size).toBe(0);
  });

  it("garde une grosse page avec sa date et la rend telle quelle", async () => {
    await kv.bindCacheScope("a");
    await copy.saveCopy("fil.for_you", big, when);
    const read = await copy.readCopy<typeof big>("fil.for_you");
    expect(read?.savedAt).toBe(when.toISOString());
    expect(read?.value).toEqual(big);
    expect(await copy.readCopy("fil.following")).toBeNull();
  });

  it("sur appareil, la page va dans un fichier et pas dans le trousseau", async () => {
    await kv.bindCacheScope("a");
    await copy.saveCopy("fil.for_you", big, when);
    const biggest = Math.max(...[...device.storage.values()].map((v) => v.length));
    if (os === "ios") {
      expect(device.files.size).toBe(1);
      expect(biggest).toBeLessThan(500);
    } else {
      expect(device.files.size).toBe(0);
    }
  });

  it("la dernière copie remplace la précédente", async () => {
    await kv.bindCacheScope("a");
    await copy.saveCopy("k", { n: 1 }, when);
    await copy.saveCopy("k", { n: 2 }, new Date(when.getTime() + 1000));
    expect((await copy.readCopy<{ n: number }>("k"))?.value).toEqual({ n: 2 });
  });

  it("A se déconnecte puis B se connecte : B ne lit rien de A, et A retrouve une page vide", async () => {
    await kv.bindCacheScope("a");
    await copy.saveCopy("fil.for_you", big, when);
    await kv.purgeCaches();
    expect(device.files.size).toBe(0);
    await kv.bindCacheScope("b");
    expect(await copy.readCopy("fil.for_you")).toBeNull();
    await kv.bindCacheScope("a");
    expect(await copy.readCopy("fil.for_you")).toBeNull();
  });

  it("changement direct de compte : la copie de A est effacée, un envoi tardif de A n'écrit rien sous B", async () => {
    await kv.bindCacheScope("a");
    const guardA = (await import("./kv")).accountGuard();
    await copy.saveCopy("fil.for_you", big, when);
    await kv.bindCacheScope("b");
    expect(await copy.readCopy("fil.for_you")).toBeNull();
    await copy.saveCopy("fil.for_you", { tardif: true }, when, guardA);
    expect(await copy.readCopy("fil.for_you")).toBeNull();
    await copy.saveCopy("fil.for_you", { de: "b" }, when);
    expect((await copy.readCopy<{ de: string }>("fil.for_you"))?.value).toEqual({ de: "b" });
    expect(await copy.readCopy("fil.for_you", guardA)).toBeNull();
  });
});
