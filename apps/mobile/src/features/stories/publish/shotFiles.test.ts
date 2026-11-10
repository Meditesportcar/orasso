import { beforeEach, describe, expect, it, vi } from "vitest";

const device = vi.hoisted(() => ({ files: new Set<string>() }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
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
      device.files.delete(this.uri);
    }
  },
}));
vi.mock("../../../lib/kv", () => ({ onCacheScopeDropped: () => undefined }));

import { discardTempPhotos, tempPhotoCount } from "../../../lib/tempPhotos";
import { cameraMessage, noteRawShot, withRawShot } from "./shotFiles";

const RAW = "file:///cache/Camera/raw.jpg";

beforeEach(() => {
  discardTempPhotos();
  device.files = new Set([RAW, "file:///cache/other.jpg"]);
});

describe("photo brute de l'appareil", () => {
  it("écran quitté entre la prise et l'envoi à l'écran : le fichier est effacé tout de suite", () => {
    expect(noteRawShot(RAW, () => false)).toBe(false);
    expect(device.files.has(RAW)).toBe(false);
    expect(tempPhotoCount()).toBe(0);
  });
  it("écran ouvert : le fichier est noté (le départ de l'écran l'effacera)", () => {
    expect(noteRawShot(RAW, () => true)).toBe(true);
    expect(device.files.has(RAW)).toBe(true);
    expect(tempPhotoCount()).toBe(1);
    discardTempPhotos();
    expect(device.files.has(RAW)).toBe(false);
  });
  it("recadrage réussi : la brute est effacée, le résultat reste", async () => {
    noteRawShot(RAW, () => true);
    const out = await withRawShot({ uri: RAW }, async () => "file:///cache/other.jpg");
    expect(out).toBe("file:///cache/other.jpg");
    expect(device.files.has(RAW)).toBe(false);
    expect(device.files.has("file:///cache/other.jpg")).toBe(true);
  });
  it("recadrage raté (fitStory échoue) : la brute est effacée quand même et l'erreur remonte", async () => {
    noteRawShot(RAW, () => true);
    await expect(
      withRawShot({ uri: RAW }, async () => {
        throw new Error("recadrage impossible");
      }),
    ).rejects.toThrow("recadrage impossible");
    expect(device.files.has(RAW)).toBe(false);
    expect(tempPhotoCount()).toBe(0);
  });
});

describe("message de l'appareil", () => {
  it("le refus d'une vidéo de la galerie s'affiche sur l'appareil, l'échec de la prise passe devant", () => {
    expect(cameraMessage(null, "Une story vidéo dure 30 secondes au plus.")).toBe(
      "Une story vidéo dure 30 secondes au plus.",
    );
    expect(cameraMessage("La vidéo n'a pas pu être enregistrée.", "autre")).toBe(
      "La vidéo n'a pas pu être enregistrée.",
    );
    expect(cameraMessage(null, null)).toBeNull();
    expect(cameraMessage(null, undefined)).toBeNull();
  });
});
