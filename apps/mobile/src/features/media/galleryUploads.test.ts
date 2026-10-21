import { describe, expect, it } from "vitest";

import { discardGalleryUploads, syncGalleryUploads, type UploadCache } from "./galleryUploads";

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ photo: { uri: `file:///p${i}.jpg` }, rects: [] }));

function fakeApi() {
  const sentUris: string[] = [];
  const removed: string[] = [];
  return {
    sentUris,
    removed,
    send: async (item: { photo: { uri: string } }) => {
      sentUris.push(item.photo.uri);
      return { id: `id-${item.photo.uri}`, key: `key-${item.photo.uri}` };
    },
    remove: async (u: { id: string }) => {
      removed.push(u.id);
    },
  };
}

describe("syncGalleryUploads", () => {
  it("reprend après une panne de publication sans renvoyer les 30 photos", async () => {
    const cache: UploadCache = new Map();
    const api = fakeApi();
    const first = await syncGalleryUploads(photos(30), cache, api.send, api.remove);
    expect(first).toHaveLength(30);
    expect(api.sentUris).toHaveLength(30);
    // La publication échoue : on réessaie avec les mêmes photos.
    const second = await syncGalleryUploads(photos(30), cache, api.send, api.remove);
    expect(second).toEqual(first);
    expect(api.sentUris).toHaveLength(30);
    expect(api.removed).toEqual([]);
  });

  it("garde les envois réussis quand un envoi échoue au milieu", async () => {
    const cache: UploadCache = new Map();
    const api = fakeApi();
    let n = 0;
    const flaky = async (item: { photo: { uri: string } }) => {
      if (++n === 4) throw new Error("coupure");
      return api.send(item);
    };
    await expect(syncGalleryUploads(photos(6), cache, flaky, api.remove)).rejects.toThrow("coupure");
    expect(cache.size).toBe(3);
    await syncGalleryUploads(photos(6), cache, api.send, api.remove);
    expect(api.sentUris).toHaveLength(6); // 3 + 3 restantes, aucune en double
    expect(new Set(api.sentUris).size).toBe(6);
  });

  it("supprime les envois dont la photo a été retirée ou dont les zones ont changé", async () => {
    const cache: UploadCache = new Map();
    const api = fakeApi();
    await syncGalleryUploads(photos(3), cache, api.send, api.remove);
    const next = [photos(3)[0]!, { photo: { uri: "file:///p1.jpg" }, rects: [{ x: 0 }] }];
    const keys = await syncGalleryUploads(next, cache, api.send, api.remove);
    expect(keys).toHaveLength(2);
    expect(api.removed.sort()).toEqual(["id-file:///p1.jpg", "id-file:///p2.jpg"]);
    expect(api.sentUris.filter((u) => u === "file:///p1.jpg")).toHaveLength(2);
    expect(cache.size).toBe(2);
  });
});

describe("discardGalleryUploads", () => {
  it("supprime tout et vide le cache", async () => {
    const cache: UploadCache = new Map();
    const api = fakeApi();
    await syncGalleryUploads(photos(2), cache, api.send, api.remove);
    await discardGalleryUploads(cache, api.remove);
    expect(api.removed).toHaveLength(2);
    expect(cache.size).toBe(0);
  });
});
