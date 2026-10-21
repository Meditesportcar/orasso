import { describe, expect, it } from "vitest";

import {
  createUploadSession,
  type RemovalStore,
  type SentUpload,
  syncGalleryUploads,
  UploadsCancelled,
} from "./galleryUploads";

type TestPhoto = { photo: { uri: string }; rects: unknown[] };
const photos = (n: number): TestPhoto[] =>
  Array.from({ length: n }, (_, i) => ({ photo: { uri: `file:///p${i}.jpg` }, rects: [] }));
const tick = () => new Promise((r) => setTimeout(r, 0));

function memoryStore(): RemovalStore & { list: SentUpload[] } {
  const store = {
    list: [] as SentUpload[],
    read: async () => [...store.list],
    write: async (l: SentUpload[]) => {
      store.list = [...l];
    },
  };
  return store;
}

function fakeApi() {
  const sentUris: string[] = [];
  const removed: string[] = [];
  const state = { offline: false };
  let n = 0;
  return {
    sentUris,
    removed,
    state,
    send: async (item: { photo: { uri: string } }) => {
      sentUris.push(item.photo.uri);
      n += 1;
      return { id: `id-${item.photo.uri}#${n}`, key: `key-${item.photo.uri}#${n}` };
    },
    remove: async (u: { id: string }) => {
      if (state.offline) throw new Error("hors ligne");
      removed.push(u.id);
    },
  };
}

function setup() {
  const api = fakeApi();
  const store = memoryStore();
  const session = createUploadSession({ remove: api.remove, store });
  const sync = (list: TestPhoto[]) =>
    session.run((t) => syncGalleryUploads(list, t.cache, api.send, t.retire, undefined, t.stopped));
  return { api, store, session, sync };
}

describe("syncGalleryUploads", () => {
  it("reprend après une panne de publication sans renvoyer les 30 photos", async () => {
    const { api, sync } = setup();
    const first = await sync(photos(30));
    expect(first).toHaveLength(30);
    expect(api.sentUris).toHaveLength(30);
    const second = await sync(photos(30));
    expect(second).toEqual(first);
    expect(api.sentUris).toHaveLength(30);
    expect(api.removed).toEqual([]);
  });

  it("garde les envois réussis quand un envoi échoue au milieu", async () => {
    const { api, session } = setup();
    let n = 0;
    const flaky = async (item: { photo: { uri: string } }) => {
      if (++n === 4) throw new Error("coupure");
      return api.send(item);
    };
    await expect(session.run((t) => syncGalleryUploads(photos(6), t.cache, flaky, t.retire))).rejects.toThrow(
      "coupure",
    );
    expect(session.cache.size).toBe(3);
    await session.run((t) => syncGalleryUploads(photos(6), t.cache, api.send, t.retire));
    expect(api.sentUris).toHaveLength(6);
    expect(new Set(api.sentUris).size).toBe(6);
  });

  it("supprime les envois dont la photo a été retirée ou dont les zones ont changé", async () => {
    const { api, session, sync } = setup();
    await sync(photos(3));
    const next = [photos(3)[0]!, { photo: { uri: "file:///p1.jpg" }, rects: [{ x: 0 }] }];
    const keys = await sync(next);
    expect(keys).toHaveLength(2);
    expect(api.removed.sort()).toEqual(["id-file:///p1.jpg#2", "id-file:///p2.jpg#3"]);
    expect(api.sentUris.filter((u) => u === "file:///p1.jpg")).toHaveLength(2);
    expect(session.cache.size).toBe(2);
  });
});

describe("createUploadSession : fermeture et nettoyage", () => {
  it("supprime tout et vide le cache", async () => {
    const { api, session, sync } = setup();
    await sync(photos(2));
    await session.discard();
    expect(api.removed).toHaveLength(2);
    expect(session.cache.size).toBe(0);
  });

  it("la fermeture attend la fin d'une publication en cours ; la reprise ne réutilise pas un envoi supprimé", async () => {
    const { api, session } = setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    // Publication en cours : le 2e envoi attend.
    const publishing = session.run((t) =>
      syncGalleryUploads(
        photos(3),
        t.cache,
        async (item) => {
          if (item.photo.uri.endsWith("p1.jpg")) await gate;
          return api.send(item);
        },
        t.retire,
        undefined,
        t.stopped,
      ),
    );
    await tick();
    const closed = session.discard(); // fermeture pendant la publication
    // Réouverture et reprise tout de suite, avec les mêmes photos.
    const reopened = session.run((t) =>
      syncGalleryUploads(photos(3), t.cache, api.send, t.retire, undefined, t.stopped),
    );
    release();
    await expect(publishing).rejects.toBeInstanceOf(UploadsCancelled);
    await closed;
    const keys = await reopened;
    // Aucune clé rendue à la reprise n'a été supprimée entre-temps.
    for (const key of keys) expect(api.removed).not.toContain(key.replace("key-", "id-"));
    expect(api.removed).toEqual(expect.arrayContaining(["id-file:///p0.jpg#1", "id-file:///p1.jpg#2"]));
    expect(session.cache.size).toBe(3);
  });

  it("publication réussie puis fermeture : les fichiers consommés ne sont pas supprimés", async () => {
    const { api, session } = setup();
    await session.run(async (t) => {
      await syncGalleryUploads(photos(2), t.cache, api.send, t.retire, undefined, t.stopped);
      t.keepNothing(); // contenu créé
    });
    await session.discard();
    expect(api.removed).toEqual([]);
  });
});

describe("createUploadSession : suppressions à reprendre", () => {
  it("hors ligne, les suppressions restent à reprendre (pas réutilisables) puis partent au retour du réseau", async () => {
    const { api, store, session, sync } = setup();
    await sync(photos(3));
    api.state.offline = true;
    await session.discard();
    expect(api.removed).toEqual([]);
    expect(store.list).toHaveLength(3);
    expect(session.cache.size).toBe(0);
    // Les envois à supprimer ne sont jamais réutilisés : la galerie suivante renvoie ses photos.
    await sync(photos(1));
    expect(api.sentUris.filter((u) => u === "file:///p0.jpg")).toHaveLength(2);
    // Réseau revenu : la reprise vide la liste.
    api.state.offline = false;
    await session.retryRemovals();
    expect(store.list).toEqual([]);
    expect(api.removed.sort()).toEqual(["id-file:///p0.jpg#1", "id-file:///p1.jpg#2", "id-file:///p2.jpg#3"]);
  });

  it("les suppressions à reprendre survivent à une nouvelle session (redémarrage de l'appli)", async () => {
    const first = setup();
    await first.sync(photos(2));
    first.api.state.offline = true;
    await first.session.discard();
    const api = fakeApi();
    const session = createUploadSession({ remove: api.remove, store: first.store });
    await session.retryRemovals();
    expect(api.removed.sort()).toEqual(["id-file:///p0.jpg#1", "id-file:///p1.jpg#2"]);
    expect(first.store.list).toEqual([]);
  });
});
