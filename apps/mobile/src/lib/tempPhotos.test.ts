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

import { cropAll } from "../features/fil/publish/model";
import { discardTempPhotos, rememberTempPhotos, tempPhotoCount, tempPhotoEpoch } from "./tempPhotos";

beforeEach(() => {
  // D'abord oublier ce que le test d'avant avait noté, ensuite remettre les fichiers.
  device.broken = new Set();
  discardTempPhotos();
  device.files = new Set(["file:///cache/a.jpg", "file:///cache/b.jpg", "file:///cache/c.jpg"]);
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
  it("la purge d'un compte change d'époque : une opération lancée avant n'est plus d'actualité", async () => {
    const before = tempPhotoEpoch();
    await Promise.all(device.dropped.map((h) => h()));
    expect(tempPhotoEpoch()).toBe(before + 1);
  });

  const later = <T>(value: T) => {
    let release: () => void = () => undefined;
    const promise = new Promise<T>((resolve) => {
      release = () => resolve(value);
    });
    return { promise, release };
  };
  const shot = (uri: string) => ({ uri, width: 1080, height: 1350 });
  const src = shot("file:///cache/src.jpg");

  it("purge du compte pendant le deuxième recadrage : le premier JPEG est déjà effacé (noté dès sa création)", async () => {
    const second = later(shot("file:///cache/b.jpg"));
    let calls = 0;
    const epoch = tempPhotoEpoch();
    const run = cropAll(
      [src, src],
      () => (++calls === 1 ? Promise.resolve(shot("file:///cache/a.jpg")) : second.promise),
      () => epoch === tempPhotoEpoch(),
      discardTempPhotos,
      rememberTempPhotos,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(tempPhotoCount()).toBe(1);
    await Promise.all(device.dropped.map((h) => h())); // déconnexion pendant la découpe de la deuxième
    expect(device.files.has("file:///cache/a.jpg")).toBe(false);
    second.release();
    expect(await run).toBeNull();
    expect(device.files.has("file:///cache/b.jpg")).toBe(false);
    expect(tempPhotoCount()).toBe(0);
  });
  it("purge entre la fin de cropAll et la suite de l'appelant : rien n'est gardé, et la re-vérification efface ce qui reste", async () => {
    const epoch = tempPhotoEpoch();
    const cropped = await cropAll(
      [src],
      async () => shot("file:///cache/a.jpg"),
      () => epoch === tempPhotoEpoch(),
      discardTempPhotos,
      rememberTempPhotos,
    );
    expect(cropped).toHaveLength(1);
    await Promise.all(device.dropped.map((h) => h())); // la purge s'intercale avant la suite de l'appelant
    // Ce que fait l'écran juste après `await cropAll` : un résultat caduc est effacé, jamais réenregistré.
    const stale = epoch !== tempPhotoEpoch();
    if (stale) discardTempPhotos((cropped ?? []).map((p) => p.uri));
    else rememberTempPhotos(...(cropped ?? []).map((p) => p.uri));
    expect(stale).toBe(true);
    expect(device.files.has("file:///cache/a.jpg")).toBe(false);
    expect(tempPhotoCount()).toBe(0);
  });
});
