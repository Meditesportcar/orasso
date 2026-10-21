import { describe, expect, it, vi } from "vitest";

// Le trousseau est simulé par une table en mémoire (comme `cacheScope.test.ts`) : la liste des suppressions par compte
// passe par le vrai cache de `kv.ts`.
const keychain = new Map<string, string>();
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => keychain.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void keychain.set(key, value),
  deleteItemAsync: async (key: string) => void keychain.delete(key),
}));

import { accountGuard, bindCacheScope, cacheGetJson, cacheSetJson, purgeCaches } from "../../lib/kv";
import {
  accountRemovalStore,
  createUploadSession,
  PENDING_REMOVALS_KEY,
  publishContent,
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

/** API simulée avec son vrai plafond : 40 envois en attente (ni consommés ni supprimés) au plus, sinon 429. */
function cappedApi(cap = 40) {
  const waiting = new Set<string>();
  const removed: string[] = [];
  let n = 0;
  return {
    waiting,
    removed,
    send: async () => {
      if (waiting.size >= cap) throw Object.assign(new Error("Trop de fichiers en attente"), { status: 429 });
      n += 1;
      waiting.add(`id${n}`);
      return { id: `id${n}`, key: `key${n}` };
    },
    remove: async (u: SentUpload) => {
      waiting.delete(u.id);
      removed.push(u.id);
    },
  };
}

describe("tour 2 : photos remplacées supprimées avant les nouveaux envois", () => {
  it("publication échouée avec 30 photos, puis les 30 remplacées : pas de 429 au onzième envoi", async () => {
    const api = cappedApi();
    const session = createUploadSession({ remove: api.remove, store: memoryStore() });
    const sync = (list: TestPhoto[]) =>
      session.run((t) => syncGalleryUploads(list, t.cache, api.send, t.retire, undefined, t.stopped, t.release));
    await sync(photos(30)); // la création a échoué ensuite : 30 envois gardés en attente
    expect(api.waiting.size).toBe(30);
    const others = Array.from({ length: 30 }, (_, i) => ({ photo: { uri: `file:///autre${i}.jpg` }, rects: [] }));
    await expect(sync(others)).resolves.toHaveLength(30);
    expect(api.waiting.size).toBe(30);
    expect(api.removed).toHaveLength(30);
  });

  it("par publishContent : la photo retirée part avant le premier nouvel envoi", async () => {
    const order: string[] = [];
    const session = createUploadSession({
      remove: async (u) => void order.push(`suppr ${u.id}`),
      store: memoryStore(),
    });
    let n = 0;
    const send = async () => {
      n += 1;
      order.push(`envoi ${n}`);
      return { id: `id${n}`, key: `key${n}` };
    };
    await session.run((t) => syncGalleryUploads(photos(1), t.cache, send, t.retire));
    await session.run((t) =>
      publishContent(t, {
        photos: [{ photo: { uri: "file:///b.jpg" }, rects: [] }],
        send,
        create: async () => undefined,
      }),
    );
    expect(order).toEqual(["envoi 1", "suppr id1", "envoi 2"]);
  });
});

describe("tour 2 : suppressions bornées, publication jamais retenue", () => {
  it("hors ligne, 30 suppressions à reprendre : arrêt à la première panne réseau (une seule tentative)", async () => {
    const store = memoryStore();
    store.list = Array.from({ length: 30 }, (_, i) => ({ id: `old${i}`, key: `k${i}` }));
    const remove = vi.fn(async () => {
      throw new Error("hors ligne");
    });
    const session = createUploadSession({ remove, store });
    await session.retryRemovals();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(store.list).toHaveLength(30);
  });

  it("une erreur qui n'est pas réseau n'arrête pas la série : l'envoi reste à reprendre, les autres partent", async () => {
    const store = memoryStore();
    store.list = [
      { id: "a", key: "ka" },
      { id: "b", key: "kb" },
    ];
    const session = createUploadSession({
      remove: async (u) => {
        if (u.id === "a") throw Object.assign(new Error("refusé"), { network: false });
      },
      store,
      stopsRemovals: (e) => (e as { network?: boolean }).network !== false,
    });
    await session.retryRemovals();
    expect(store.list).toEqual([{ id: "a", key: "ka" }]);
  });

  it("une publication réussie ne rejoue pas la liste et n'attend pas les anciennes suppressions (lentes)", async () => {
    const store = memoryStore();
    store.list = Array.from({ length: 30 }, (_, i) => ({ id: `old${i}`, key: `k${i}` }));
    const remove = vi.fn(() => new Promise<void>(() => undefined)); // délai réseau sans fin
    const session = createUploadSession({ remove, store });
    void session.retryRemovals(); // ouverture du formulaire : le rejeu reste bloqué sur la première
    const api = fakeApi();
    const create = vi.fn(async () => undefined);
    const published = session.run((t) => publishContent(t, { photos: photos(2), send: api.send, create }));
    const outcome = await Promise.race([
      published.then(() => "publié"),
      tick()
        .then(tick)
        .then(() => "en attente"),
    ]);
    expect(outcome).toBe("publié");
    expect(create).toHaveBeenCalledWith(["key-file:///p0.jpg#1", "key-file:///p1.jpg#2"]);
    expect(remove).toHaveBeenCalledTimes(1); // le rejeu de l'ouverture seulement, jamais relancé par la publication
  });
});

describe("tour 2 : publishContent (chemin du formulaire « Ajouter »)", () => {
  it("fermeture pendant l'attente de fin d'animation : UploadsCancelled, rien de créé, envois supprimés", async () => {
    const api = fakeApi();
    const session = createUploadSession({ remove: api.remove, store: memoryStore() });
    const create = vi.fn(async () => undefined);
    let closed: Promise<void> = Promise.resolve();
    const published = session.run((t) =>
      publishContent(t, {
        photos: photos(2),
        send: api.send,
        create,
        parked: async () => {
          closed = session.discard(); // fermeture du formulaire pendant que la jauge se range
        },
      }),
    );
    await expect(published).rejects.toBeInstanceOf(UploadsCancelled);
    await closed;
    expect(create).not.toHaveBeenCalled();
    expect(api.removed.sort()).toEqual(["id-file:///p0.jpg#1", "id-file:///p1.jpg#2"]);
    expect(session.cache.size).toBe(0);
  });

  it("lien : pas d'envoi, création avec une liste de clés vide", async () => {
    const api = fakeApi();
    const session = createUploadSession({ remove: api.remove, store: memoryStore() });
    const create = vi.fn(async () => undefined);
    await session.run((t) => publishContent(t, { photos: null, send: api.send, create }));
    expect(create).toHaveBeenCalledWith([]);
    expect(api.sentUris).toEqual([]);
  });
});

describe("tour 2 : liste des suppressions liée au compte qui l'a créée", () => {
  const kv = { accountGuard, cacheGetJson, cacheSetJson };

  it("A se déconnecte pendant une suppression, B se connecte : rien de A dans le cache de B, la série s'arrête", async () => {
    keychain.clear();
    await bindCacheScope("compte-a");
    let release!: () => void;
    const hang = new Promise<void>((r) => {
      release = r;
    });
    const calls: string[] = [];
    const session = createUploadSession({
      remove: async (u) => {
        calls.push(u.id);
        await hang;
        throw new Error("hors ligne");
      },
      store: accountRemovalStore(kv),
    });
    for (const u of [
      { id: "a1", key: "cle-photo-a1" },
      { id: "a2", key: "cle-photo-a2" },
    ])
      session.cache.set(u.id, u);
    const closing = session.discard(); // nettoyage commencé sous A
    for (let i = 0; i < 5; i++) await tick();
    expect(calls).toEqual(["a1"]);
    await purgeCaches(); // A se déconnecte…
    await bindCacheScope("compte-b"); // … B se connecte
    await cacheSetJson(PENDING_REMOVALS_KEY, [{ id: "b1", key: "cle-photo-b1" }]);
    release();
    await closing;
    expect(await cacheGetJson(PENDING_REMOVALS_KEY)).toEqual([{ id: "b1", key: "cle-photo-b1" }]);
    expect([...keychain.values()].some((v) => v.includes("cle-photo-a"))).toBe(false);
    // La session créée sous A ne lit ni ne rejoue jamais la liste de B.
    await session.retryRemovals();
    expect(calls).toEqual(["a1"]);
    expect(await cacheGetJson(PENDING_REMOVALS_KEY)).toEqual([{ id: "b1", key: "cle-photo-b1" }]);
  });
});
