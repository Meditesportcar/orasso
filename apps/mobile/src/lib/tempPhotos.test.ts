import { beforeEach, describe, expect, it, vi } from "vitest";

const device = vi.hoisted(() => ({
  os: "android",
  files: new Set<string>(),
  dropped: [] as (() => Promise<void>)[],
  broken: new Set<string>(),
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return device.os;
    },
  },
}));
vi.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return device.files.has(this.uri);
    }
    delete() {
      if (device.broken.has(this.uri)) throw new Error("verrouillé");
      device.files.delete(this.uri);
    }
  },
}));
vi.mock("./kv", () => ({ onCacheScopeDropped: (h: () => Promise<void>) => void device.dropped.push(h) }));

import { discardTempPhotos, rememberTempPhotos, tempPhotoCount } from "./tempPhotos";

beforeEach(() => {
  device.files = new Set(["file:///cache/a.jpg", "file:///cache/b.jpg", "file:///cache/c.jpg"]);
  device.broken = new Set();
  discardTempPhotos();
});

describe("photos temporaires du Fil (JPEG non floutés)", () => {
  it("les fichiers donnés sont effacés, les autres restent", () => {
    rememberTempPhotos("file:///cache/a.jpg", "file:///cache/b.jpg", "file:///cache/c.jpg");
    discardTempPhotos(["file:///cache/a.jpg"]);
    expect([...device.files]).toEqual(["file:///cache/b.jpg", "file:///cache/c.jpg"]);
    expect(tempPhotoCount()).toBe(2);
  });
  it("sans argument : tout ce qui est noté part (abandon, départ de l'écran)", () => {
    rememberTempPhotos("file:///cache/a.jpg", "file:///cache/b.jpg");
    discardTempPhotos();
    expect([...device.files]).toEqual(["file:///cache/c.jpg"]);
    expect(tempPhotoCount()).toBe(0);
  });
  it("un fichier qui ne s'efface pas n'empêche pas les autres", () => {
    device.broken.add("file:///cache/a.jpg");
    rememberTempPhotos("file:///cache/a.jpg", "file:///cache/b.jpg");
    expect(() => discardTempPhotos()).not.toThrow();
    expect(device.files.has("file:///cache/b.jpg")).toBe(false);
  });
  it("la purge du cache d'un compte efface ce qui reste", async () => {
    rememberTempPhotos("file:///cache/c.jpg");
    await Promise.all(device.dropped.map((h) => h()));
    expect(device.files.has("file:///cache/c.jpg")).toBe(false);
  });
});
