import { describe, expect, it } from "vitest";

import {
  type AlbumItem,
  AlbumSendStopped,
  blurredOf,
  decisionOf,
  PICK_PER_OPEN,
  pickLimit,
  platedCount,
  remaining,
  type SendDeps,
  sendAlbumPhotos,
  signatureOf,
} from "./albumUploads";

const RECT = { x: 0.1, y: 0.1, w: 0.2, h: 0.1 };
const item = (n: number, rects = [] as (typeof RECT)[]): AlbumItem => ({
  clientId: `00000000-0000-4000-8000-00000000000${n}`,
  uri: `file:///photo-${n}.jpg`,
  width: 100,
  height: 50,
  rects,
  detected: true,
});

/** Un faux API : garde les envois et les ajouts, peut tomber en panne à un appel donné. */
function fake(items: AlbumItem[], opts: { failAddAt?: number; failUploadAt?: number } = {}) {
  const log: string[] = [];
  const state = new Map(items.map((i) => [i.clientId, { ...i }]));
  let uploads = 0;
  let adds = 0;
  const retired: string[] = [];
  const deps: SendDeps = {
    upload: async (it, rects) => {
      uploads++;
      if (opts.failUploadAt === uploads) throw new Error("réseau coupé (envoi)");
      log.push(`upload ${it.uri} ${rects ? "flouté" : "brut"}`);
      return { id: `u${uploads}`, key: `private/album-uploads/u${uploads}.webp` };
    },
    add: async (it, body) => {
      adds++;
      if (opts.failAddAt === adds) throw new Error("réseau coupé (ajout)");
      log.push(`add ${body.clientId} ${body.plateDecision}`);
      return { id: `p-${it.clientId}` };
    },
    retire: (u) => retired.push(u.id),
    onItem: (id, patch) => state.set(id, { ...(state.get(id) as AlbumItem), ...patch }),
  };
  return { deps, log, retired, current: () => [...state.values()], counts: () => ({ uploads, adds }) };
}

describe("décision de plaque d'un lot", () => {
  it("sans plaque repérée : « aucune plaque » ; avec : le choix du lot (ou rien tant qu'il manque)", () => {
    expect(decisionOf(item(1), null)).toBe("none");
    expect(decisionOf(item(1, [RECT]), null)).toBeNull();
    expect(decisionOf(item(1, [RECT]), "blurred")).toBe("blurred");
    expect(decisionOf(item(1, [RECT]), "kept")).toBe("kept");
  });
  it("compte les photos à plaque, les photos qui restent et les plaques floutées", () => {
    const list = [item(1, [RECT]), item(2), { ...item(3, [RECT]), photoId: "x" }];
    expect(platedCount(list)).toBe(1);
    expect(remaining(list).map((i) => i.uri)).toEqual(["file:///photo-1.jpg", "file:///photo-2.jpg"]);
    expect(blurredOf(list, "blurred")).toBe(2);
    expect(blurredOf(list, "kept")).toBe(0);
  });
  it("le sélecteur : 30 photos par ouverture, jamais au-delà des 200 de l'album", () => {
    expect(pickLimit(0, 0)).toBe(PICK_PER_OPEN);
    expect(pickLimit(190, 3)).toBe(7);
    expect(pickLimit(199, 1)).toBe(0);
    expect(pickLimit(200, 0)).toBe(0);
  });
});

describe("sendAlbumPhotos : une photo à la fois", () => {
  it("envoie puis ajoute chaque photo dans l'ordre ; les cadres ne partent que pour « floutée »", async () => {
    const items = [item(1, [RECT]), item(2), item(3, [RECT])];
    const api = fake(items);
    const progress: [number, number][] = [];
    const n = await sendAlbumPhotos(items, "blurred", { ...api.deps, onProgress: (c, t) => progress.push([c, t]) });
    expect(n).toBe(3);
    expect(api.log).toEqual([
      "upload file:///photo-1.jpg flouté",
      `add ${items[0]?.clientId} blurred`,
      "upload file:///photo-2.jpg brut",
      `add ${items[1]?.clientId} none`,
      "upload file:///photo-3.jpg flouté",
      `add ${items[2]?.clientId} blurred`,
    ]);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(api.current().every((i) => i.photoId && !i.upload)).toBe(true);
  });

  it("« Envoyer telle quelle » : rien n'est flouté à l'envoi, les cadres sont gardés pour l'ajout", async () => {
    const items = [item(1, [RECT])];
    const api = fake(items);
    await sendAlbumPhotos(items, "kept", api.deps);
    expect(api.log).toEqual(["upload file:///photo-1.jpg brut", `add ${items[0]?.clientId} kept`]);
  });

  it("reprise après coupure : les photos faites ne repartent pas, l'envoi réussi mais non ajouté est gardé, le même clientId est rejoué", async () => {
    const items = [item(1), item(2), item(3)];
    const api = fake(items, { failAddAt: 2 });
    await expect(sendAlbumPhotos(items, null, api.deps)).rejects.toThrow("réseau coupé (ajout)");
    // Photo 1 ajoutée ; photo 2 envoyée mais pas ajoutée (coupure) ; photo 3 jamais touchée.
    let state = api.current();
    expect(state[0]?.photoId).toBeTruthy();
    expect(state[1]?.upload?.key).toBe("private/album-uploads/u2.webp");
    expect(state[1]?.photoId).toBeUndefined();
    expect(state[2]?.upload).toBeUndefined();
    // Le réseau revient : la reprise repart de la photo 2, sans la renvoyer.
    const second = fake(state);
    const n = await sendAlbumPhotos(state, null, second.deps);
    expect(n).toBe(2);
    expect(second.counts()).toEqual({ uploads: 1, adds: 2 });
    expect(second.log[0]).toBe(`add ${items[1]?.clientId} none`);
    state = second.current();
    expect(state.every((i) => i.photoId)).toBe(true);
    // Une coupure pendant un envoi : rien n'est ajouté pour cette photo.
    const cut = fake([item(4)], { failUploadAt: 1 });
    await expect(sendAlbumPhotos([item(4)], null, cut.deps)).rejects.toThrow("réseau coupé (envoi)");
    expect(cut.counts().adds).toBe(0);
  });

  it("cache par signature : un envoi dont la décision a changé est retiré puis refait", async () => {
    const base = item(1, [RECT]);
    const first = fake([base]);
    // Envoi « floutée » réussi, ajout coupé.
    const cut = fake([base], { failAddAt: 1 });
    await expect(sendAlbumPhotos([base], "blurred", cut.deps)).rejects.toThrow();
    const [sent] = cut.current();
    expect(sent?.upload?.signature).toBe(signatureOf(base, "blurred"));
    // Le média change d'avis : « telle quelle » : l'ancien envoi (flouté) est retiré, un nouvel envoi brut repart.
    const again = fake([sent as AlbumItem]);
    await sendAlbumPhotos([sent as AlbumItem], "kept", again.deps);
    expect(again.retired).toEqual(["u1"]);
    expect(again.log).toEqual(["upload file:///photo-1.jpg brut", `add ${base.clientId} kept`]);
    expect(first.log).toEqual([]);
  });

  it("la même décision garde l'envoi (aucun renvoi, rien à retirer)", async () => {
    const base = item(1, [RECT]);
    const cut = fake([base], { failAddAt: 1 });
    await expect(sendAlbumPhotos([base], "blurred", cut.deps)).rejects.toThrow();
    const [sent] = cut.current();
    const again = fake([sent as AlbumItem]);
    await sendAlbumPhotos([sent as AlbumItem], "blurred", again.deps);
    expect(again.retired).toEqual([]);
    expect(again.counts()).toEqual({ uploads: 0, adds: 1 });
  });

  it("sans décision pour une photo à plaque : refus avant tout envoi ; fermeture de l'écran : envoi interrompu", async () => {
    const items = [item(1, [RECT])];
    const api = fake(items);
    await expect(sendAlbumPhotos(items, null, api.deps)).rejects.toThrow("Décide du floutage");
    expect(api.counts()).toEqual({ uploads: 0, adds: 0 });
    await expect(sendAlbumPhotos([item(2)], null, { ...api.deps, stopped: () => true })).rejects.toBeInstanceOf(
      AlbumSendStopped,
    );
  });
});
