// Vidéo de story sur le téléphone (lot R7g, tour 2) : les fichiers temporaires de la galerie et de l'appareil sont notés dès
// qu'ils existent et effacés quand ils ne servent plus (publication, abandon, échec) ; la prise de l'appareil non compressée
// n'est jamais effacée avant la publication.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Asset = { uri: string; duration: number; width: number; height: number };
const device = vi.hoisted(() => ({
  files: new Set<string>(),
  size: 13 * 1024 * 1024,
  durationMs: 12_000,
  h264: true,
  compress: true,
  asset: null as Asset | null,
}));
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
vi.mock("./kv", () => ({ onCacheScopeDropped: () => undefined }));
vi.mock("expo-image-picker", () => ({
  VideoExportPreset: { H264_1280x720: 1 },
  launchImageLibraryAsync: async () =>
    device.asset ? { canceled: false, assets: [device.asset] } : { canceled: true },
}));
vi.mock("./storyVideoPlatform", () => ({
  get canCompress() {
    return device.compress;
  },
  probeVideo: async (uri: string) => ({
    durationMs: device.durationMs,
    width: 720,
    height: 1280,
    h264: uri.includes("Compressor") ? true : device.h264,
  }),
  fileSize: async () => device.size,
  compressVideo: async () => {
    device.files.add("file:///cache/Compressor/out.mp4");
    return "file:///cache/Compressor/out.mp4";
  },
  posterOf: async () => {
    device.files.add("file:///cache/poster.jpg");
    return { uri: "file:///cache/poster.jpg", width: 720, height: 1280 };
  },
}));

import { settleRawTake } from "../features/stories/publish/shotFiles";
import { pickGalleryVideo, prepareStoryVideo, VideoRefused } from "./storyVideo";
import { discardTempPhotos, rememberTempPhotos, tempPhotoCount } from "./tempPhotos";

const GALLERY = "file:///cache/ImagePicker/gallery.mp4";
const RAW = "file:///cache/Camera/take.mp4";
const COMPRESSED = "file:///cache/Compressor/out.mp4";
const POSTER = "file:///cache/poster.jpg";
const stage = () => undefined;
const galleryAsset = (duration = 12_000): Asset => ({ uri: GALLERY, duration, width: 720, height: 1280 });

beforeEach(() => {
  discardTempPhotos();
  device.files = new Set([GALLERY, RAW]);
  device.size = 13 * 1024 * 1024;
  device.durationMs = 12_000;
  device.h264 = true;
  device.compress = true;
  device.asset = galleryAsset();
});

describe("prise de l'appareil", () => {
  it("sans compression, la prise brute est celle qu'on publie : elle n'est pas effacée avant la publication", async () => {
    // Ce que fait l'écran : noter la prise, la préparer, la régler.
    rememberTempPhotos(RAW);
    const clip = await prepareStoryVideo(RAW, {}, stage);
    expect(clip.uri).toBe(RAW);
    expect(clip.compressed).toBe(false);
    settleRawTake(RAW, clip.uri);
    expect(device.files.has(RAW)).toBe(true);
    expect(device.files.has(POSTER)).toBe(true);
    // Publication faite (ou abandon) : tout part.
    discardTempPhotos();
    expect(device.files.has(RAW)).toBe(false);
    expect(device.files.has(POSTER)).toBe(false);
  });

  it("compressée : la prise brute (remplacée) est effacée tout de suite, la copie compressée reste jusqu'à la publication", async () => {
    device.size = 40 * 1024 * 1024;
    rememberTempPhotos(RAW);
    const clip = await prepareStoryVideo(RAW, {}, stage);
    expect(clip.uri).toBe(COMPRESSED);
    settleRawTake(RAW, clip.uri);
    expect(device.files.has(RAW)).toBe(false);
    expect(device.files.has(COMPRESSED)).toBe(true);
    discardTempPhotos();
    expect(device.files.has(COMPRESSED)).toBe(false);
  });

  it("vidéo refusée : la prise brute est effacée", async () => {
    device.durationMs = 45_000;
    rememberTempPhotos(RAW);
    await expect(prepareStoryVideo(RAW, {}, stage)).rejects.toBeInstanceOf(VideoRefused);
    settleRawTake(RAW, null);
    expect(device.files.has(RAW)).toBe(false);
    expect(tempPhotoCount()).toBe(0);
  });
});

describe("vidéo de la galerie", () => {
  it("la copie du sélecteur est notée dès sa réception et effacée à la publication (jamais avant)", async () => {
    const clip = await pickGalleryVideo(stage);
    expect(clip?.uri).toBe(GALLERY);
    expect(tempPhotoCount()).toBe(2); // la copie et la vignette
    expect(device.files.has(GALLERY)).toBe(true);
    discardTempPhotos();
    expect(device.files.has(GALLERY)).toBe(false);
    expect(device.files.has(POSTER)).toBe(false);
  });

  it("compressée : la copie du sélecteur est effacée tout de suite, la vidéo compressée reste notée", async () => {
    device.h264 = false;
    const clip = await pickGalleryVideo(stage);
    expect(clip?.uri).toBe(COMPRESSED);
    expect(device.files.has(GALLERY)).toBe(false);
    expect(device.files.has(COMPRESSED)).toBe(true);
    discardTempPhotos();
    expect(device.files.has(COMPRESSED)).toBe(false);
  });

  it("préparation ratée (trop longue, compression impossible) : la copie du sélecteur n'est pas oubliée", async () => {
    device.durationMs = 45_000;
    device.asset = galleryAsset(45_000);
    await expect(pickGalleryVideo(stage)).rejects.toBeInstanceOf(VideoRefused);
    expect(device.files.has(GALLERY)).toBe(false);
    expect(tempPhotoCount()).toBe(0);

    device.files.add(GALLERY);
    device.durationMs = 12_000;
    device.asset = galleryAsset();
    device.h264 = false;
    device.compress = false;
    await expect(pickGalleryVideo(stage)).rejects.toBeInstanceOf(VideoRefused);
    expect(device.files.has(GALLERY)).toBe(false);
    expect(tempPhotoCount()).toBe(0);
  });

  it("déconnexion : le filet `discardTempPhotos()` efface aussi la copie d'une vidéo en attente de publication", async () => {
    await pickGalleryVideo(stage);
    expect(device.files.has(GALLERY)).toBe(true);
    discardTempPhotos(); // ce que fait `onCacheScopeDropped`
    expect(device.files.has(GALLERY)).toBe(false);
  });

  it("annulé : rien n'est noté", async () => {
    device.asset = null;
    expect(await pickGalleryVideo(stage)).toBeNull();
    expect(tempPhotoCount()).toBe(0);
  });
});
