import { describe, expect, it } from "vitest";
import type { AlbumPhotoView } from "../schemas/albums";
import {
  type AlbumItem,
  AlbumSendStopped,
  blurredOf,
  canReopen,
  decideAll,
  decidedCounts,
  decisionOf,
  detectionPatch,
  isPhotoLocked,
  PICK_PER_OPEN,
  pickLimit,
  pickNotice,
  platedCount,
  reappearedPhotos,
  reconcile,
  remaining,
  removeAlbumItem,
  reopenDecisions,
  type SendDeps,
  sendAlbumPhotos,
  signatureOf,
} from "./albumUploads";
import { createRemovalQueue, isDefinitiveStatus, type QueuedOp } from "./removalQueue";

const RECT = { x: 0.1, y: 0.1, w: 0.2, h: 0.1 };
const item = (n: number, rects = [] as (typeof RECT)[], over: Partial<AlbumItem> = {}): AlbumItem => ({
  clientId: `00000000-0000-4000-8000-00000000000${n}`,
  uri: `file:///photo-${n}.jpg`,
  width: 100,
  height: 50,
  rects,
  detected: true,
  ...over,
});

/** Un faux API : garde les envois et les ajouts, peut tomber en panne à un appel donné. */
function fake(items: AlbumItem[], opts: { failAddAt?: number; failUploadAt?: number } = {}) {
  const log: string[] = [];
  const state = new Map(items.map((i) => [i.clientId, { ...i }]));
  let uploads = 0;
  let adds = 0;
  const retired: string[] = [];
  let toRelease = false;
  let releases = 0;
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
      return { id: `p-${it.clientId}`, url: `/api/albums/a/photos/${it.clientId}.webp` };
    },
    retire: (u) => {
      retired.push(u.id);
      toRelease = true;
    },
    release: async () => {
      releases++;
      if (toRelease) log.push("release");
      toRelease = false;
    },
    onItem: (id, patch) => state.set(id, { ...(state.get(id) as AlbumItem), ...patch }),
  };
  return {
    deps,
    log,
    retired,
    current: () => [...state.values()],
    counts: () => ({ uploads, adds }),
    releases: () => releases,
  };
}

describe("décision de plaque, par photo", () => {
  it("sans plaque repérée : « aucune plaque » ; avec : sa décision (ou rien tant qu'il manque)", () => {
    expect(decisionOf(item(1))).toBe("none");
    expect(decisionOf(item(1, [RECT]))).toBeNull();
    expect(decisionOf(item(1, [RECT], { decision: "blurred" }))).toBe("blurred");
    expect(decisionOf(item(1, [RECT], { decision: "kept" }))).toBe("kept");
  });
  it("compte les photos à plaque sans décision, les photos qui restent et les plaques floutées", () => {
    const list = [item(1, [RECT]), item(2), item(3, [RECT], { photoId: "x", decision: "blurred" })];
    expect(platedCount(list)).toBe(1);
    expect(remaining(list).map((i) => i.uri)).toEqual(["file:///photo-1.jpg", "file:///photo-2.jpg"]);
    expect(blurredOf(list)).toBe(1);
    expect(blurredOf(decideAll(list, "blurred"))).toBe(2);
    expect(blurredOf(decideAll(list, "kept"))).toBe(1);
  });
  it("le sélecteur : 30 photos par ouverture, jamais au-delà des 200 de l'album", () => {
    expect(pickLimit(0, 0)).toBe(PICK_PER_OPEN);
    expect(pickLimit(190, 3)).toBe(7);
    expect(pickLimit(199, 1)).toBe(0);
    expect(pickLimit(200, 0)).toBe(0);
  });

  it("une photo à plaque ajoutée après une décision ne l'hérite pas : le bloc se rouvre pour elle seule", () => {
    let list = decideAll([item(1, [RECT]), item(2, [RECT])], "kept");
    expect(platedCount(list)).toBe(0);
    expect(decidedCounts(list)).toEqual({ blurred: 0, kept: 2 });
    list = [...list, item(3, [RECT])];
    expect(platedCount(list)).toBe(1);
    // Choisir pour la nouvelle ne touche pas aux deux premières.
    list = decideAll(list, "blurred");
    expect(list.map((i) => i.decision)).toEqual(["kept", "kept", "blurred"]);
    expect(decidedCounts(list)).toEqual({ blurred: 1, kept: 2 });
    // Une photo sans plaque n'a jamais de décision à prendre.
    expect(platedCount([...list, item(4)])).toBe(0);
  });

  it("« Changer » : rouvre les décisions des photos dont l'ajout n'est pas parti, jamais celles d'un ajout parti (même sans réponse)", () => {
    const list: AlbumItem[] = [
      item(1, [RECT], { decision: "kept" }),
      item(2, [RECT], { decision: "kept", attempted: true }),
      item(3, [RECT], { decision: "kept", photoId: "p3" }),
    ];
    expect(canReopen(list)).toBe(true);
    const reopened = reopenDecisions(list);
    expect(reopened.map((i) => i.decision)).toEqual([undefined, "kept", "kept"]);
    expect(isPhotoLocked(reopened[1] as AlbumItem)).toBe(true);
    // Plus rien à rouvrir quand tout est figé : « Changer » disparaît.
    expect(canReopen(reopened.map((i) => ({ ...i, attempted: true })))).toBe(false);
    // Le total des floutées reste juste quand l'album mêle deux décisions.
    expect(decidedCounts(decideAll(reopened, "blurred"))).toEqual({ blurred: 1, kept: 2 });
  });
});

describe("détection et cadres posés à la main", () => {
  it("un résultat de détection n'écrase jamais un cadre posé à la main, et un résultat vide ne l'efface pas", () => {
    const manual = item(1, [RECT], { edited: true, detected: false });
    expect(detectionPatch(manual, [])).toEqual({ detected: true });
    expect(detectionPatch(manual, [{ ...RECT, x: 0.5 }])).toEqual({ detected: true });
    // Cadres réglés puis tous retirés à la main : encore « à la main », la détection tardive ne revient pas.
    expect(detectionPatch(item(2, [], { edited: true, detected: false }), [RECT])).toEqual({ detected: true });
    // Rien posé : la détection propose ses cadres.
    expect(detectionPatch(item(3, [], { detected: false }), [RECT])).toEqual({ detected: true, rects: [RECT] });
  });
});

describe("rapprochement par clientId", () => {
  it("une photo ajoutée dont la réponse s'est perdue est retrouvée dans l'album (sans fantôme)", () => {
    const list = [item(1, [], { attempted: true, upload: { id: "u1", key: "k", signature: "s" } }), item(2)];
    const back = reconcile(list, [
      { id: "ph1", url: "/api/albums/a/photos/ph1.webp", clientId: list[0]?.clientId },
      { id: "ph9", url: "/x", clientId: "00000000-0000-4000-8000-000000000099" },
    ]);
    expect(back[0]).toMatchObject({ photoId: "ph1", serverUrl: "/api/albums/a/photos/ph1.webp", attempted: true });
    expect(back[0]?.upload).toBeUndefined();
    expect(back[1]?.photoId).toBeUndefined();
  });
});

describe("sendAlbumPhotos : une photo à la fois", () => {
  it("envoie puis ajoute chaque photo dans l'ordre ; les cadres ne partent que pour « floutée »", async () => {
    const items = decideAll([item(1, [RECT]), item(2), item(3, [RECT])], "blurred");
    const api = fake(items);
    const progress: [number, number][] = [];
    const n = await sendAlbumPhotos(items, { ...api.deps, onProgress: (c, t) => progress.push([c, t]) });
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
    // Chaque photo ajoutée porte la version du serveur (floutée), jamais l'original local.
    expect(api.current().every((i) => i.photoId && !i.upload && i.serverUrl?.startsWith("/api/albums/"))).toBe(true);
  });

  it("« Envoyer telle quelle » : rien n'est flouté à l'envoi, les cadres sont gardés pour l'ajout", async () => {
    const items = decideAll([item(1, [RECT])], "kept");
    const api = fake(items);
    await sendAlbumPhotos(items, api.deps);
    expect(api.log).toEqual(["upload file:///photo-1.jpg brut", `add ${items[0]?.clientId} kept`]);
  });

  it("chaque photo part avec sa décision : deux lots de décisions différentes dans le même album", async () => {
    let list = decideAll([item(1, [RECT])], "kept");
    list = decideAll([...list, item(2, [RECT])], "blurred");
    const api = fake(list);
    await sendAlbumPhotos(list, api.deps);
    expect(api.log.filter((l) => l.startsWith("add"))).toEqual([
      `add ${list[0]?.clientId} kept`,
      `add ${list[1]?.clientId} blurred`,
    ]);
  });

  it("l'ajout parti fige la décision (même sans réponse) : la reprise rejoue la même décision, « Changer » ne rouvre rien", async () => {
    const items = decideAll([item(1, [RECT])], "kept");
    const lost = fake(items, { failAddAt: 1 });
    await expect(sendAlbumPhotos(items, lost.deps)).rejects.toThrow("réseau coupé (ajout)");
    const [sent] = lost.current();
    expect(sent).toMatchObject({ attempted: true, decision: "kept" });
    expect(canReopen([sent as AlbumItem])).toBe(false);
    // « Changer » ne change rien : la décision reste « telle quelle », le même clientId est rejoué avec elle.
    const reopened = reopenDecisions([sent as AlbumItem]);
    expect(reopened[0]?.decision).toBe("kept");
    const again = fake(reopened);
    await sendAlbumPhotos(reopened, again.deps);
    expect(again.log).toEqual([`add ${items[0]?.clientId} kept`]);
    expect(again.retired).toEqual([]);
  });

  it("reprise après coupure : les photos faites ne repartent pas, l'envoi réussi mais non ajouté est gardé, le même clientId est rejoué", async () => {
    const items = [item(1), item(2), item(3)];
    const api = fake(items, { failAddAt: 2 });
    await expect(sendAlbumPhotos(items, api.deps)).rejects.toThrow("réseau coupé (ajout)");
    // Photo 1 ajoutée ; photo 2 envoyée mais pas ajoutée (coupure) ; photo 3 jamais touchée.
    let state = api.current();
    expect(state[0]?.photoId).toBeTruthy();
    expect(state[1]?.upload?.key).toBe("private/album-uploads/u2.webp");
    expect(state[1]?.photoId).toBeUndefined();
    expect(state[2]?.upload).toBeUndefined();
    // Le réseau revient : la reprise repart de la photo 2, sans la renvoyer, et dit « 2 / 3 » (pas « 1 / 2 »).
    const second = fake(state);
    const progress: [number, number][] = [];
    const n = await sendAlbumPhotos(state, { ...second.deps, onProgress: (c, t) => progress.push([c, t]) });
    expect(n).toBe(2);
    expect(progress).toEqual([
      [2, 3],
      [3, 3],
    ]);
    expect(second.counts()).toEqual({ uploads: 1, adds: 2 });
    expect(second.log[0]).toBe(`add ${items[1]?.clientId} none`);
    state = second.current();
    expect(state.every((i) => i.photoId)).toBe(true);
    // Une coupure pendant un envoi : rien n'est ajouté pour cette photo.
    const cut = fake([item(4)], { failUploadAt: 1 });
    await expect(sendAlbumPhotos([item(4)], cut.deps)).rejects.toThrow("réseau coupé (envoi)");
    expect(cut.counts().adds).toBe(0);
  });

  it("cache par signature : des cadres changés avant l'ajout retirent l'envoi, la place est libérée AVANT le nouvel envoi", async () => {
    const base = decideAll([item(1, [RECT])], "blurred")[0] as AlbumItem;
    // Envoi « floutée » réussi, ajout non parti (coupure pendant l'envoi suivant).
    const cut = fake([base], { failAddAt: 1 });
    await expect(sendAlbumPhotos([base], cut.deps)).rejects.toThrow();
    const [sent] = cut.current();
    expect(sent?.upload?.signature).toBe(signatureOf(base, "blurred"));
    // Le cache d'un envoi dont l'ajout n'est pas parti : on repart d'une photo non figée avec d'autres cadres.
    const moved: AlbumItem = { ...(sent as AlbumItem), attempted: undefined, rects: [{ ...RECT, x: 0.4 }] };
    const again = fake([moved]);
    await sendAlbumPhotos([moved], again.deps);
    expect(again.retired).toEqual(["u1"]);
    expect(again.log).toEqual(["release", "upload file:///photo-1.jpg flouté", `add ${base.clientId} blurred`]);
  });

  it("la même décision garde l'envoi (aucun renvoi, rien à retirer)", async () => {
    const base = decideAll([item(1, [RECT])], "blurred")[0] as AlbumItem;
    const cut = fake([base], { failAddAt: 1 });
    await expect(sendAlbumPhotos([base], cut.deps)).rejects.toThrow();
    const [sent] = cut.current();
    const again = fake([sent as AlbumItem]);
    await sendAlbumPhotos([sent as AlbumItem], again.deps);
    expect(again.retired).toEqual([]);
    expect(again.counts()).toEqual({ uploads: 0, adds: 1 });
  });

  it("sans décision pour une photo à plaque : refus avant tout envoi ; fermeture de l'écran : envoi interrompu", async () => {
    const items = [item(1, [RECT])];
    const api = fake(items);
    await expect(sendAlbumPhotos(items, api.deps)).rejects.toThrow("Décide du floutage");
    expect(api.counts()).toEqual({ uploads: 0, adds: 0 });
    await expect(sendAlbumPhotos([item(2)], { ...api.deps, stopped: () => true })).rejects.toBeInstanceOf(
      AlbumSendStopped,
    );
  });
});

describe("le plafond coupe la sélection", () => {
  it("dit combien de photos sont gardées, ne dit rien quand tout passe, et ne dit jamais « 0 premières » (album plein)", () => {
    expect(pickNotice(30, 12)).toBeNull();
    expect(pickNotice(30, 30)).toBeNull();
    expect(pickNotice(7, 12)).toBe(
      "Seules les 7 premières photos ont été gardées sur 12 (30 par ouverture, 200 par album).",
    );
    expect(pickNotice(1, 3)).toContain("la première photo a été gardée sur 3");
    const full = pickNotice(0, 3);
    expect(full).toBe("L'album compte déjà 200 photos : aucune photo n'a été ajoutée.");
    expect(full).not.toContain("0 premières");
  });
});

describe("tout nouvel envoi attend derrière le nettoyage requis (retrait lent → remplacement, quota plein)", () => {
  it("un retrait lent : l'envoi de la remplaçante ne part qu'après la suppression ; quota plein, il n'est jamais refusé", async () => {
    const order: string[] = [];
    let quota = 40; // envois en attente : plein
    let finishRemoval!: () => void;
    const slow = new Promise<void>((r) => {
      finishRemoval = r;
    });
    const queue = createRemovalQueue({
      remove: async (u) => {
        order.push(`suppression ${u.id} commence`);
        await slow;
        quota -= 1;
        order.push(`suppression ${u.id} finie`);
      },
      store: { read: async () => [], write: async () => undefined },
    });
    // « Retirer » : l'envoi retiré part en file, sans attendre (l'écran reste réactif).
    queue.retire({ id: "u1", key: "k1" });
    const first = queue.release();
    // La remplaçante est envoyée tout de suite : son envoi attend la fin du nettoyage.
    const items = [item(1)];
    const deps: SendDeps = {
      upload: async () => {
        if (quota >= 40) throw new Error("quota d'envois en attente plein");
        order.push("envoi remplaçante");
        return { id: "u2", key: "private/album-uploads/u2.webp" };
      },
      add: async (it) => ({ id: `p-${it.clientId}` }),
      retire: () => undefined,
      release: () => queue.release(),
      onItem: () => undefined,
    };
    const sending = sendAlbumPhotos(items, deps);
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["suppression u1 commence"]);
    finishRemoval();
    await Promise.all([first, sending]);
    expect(order).toEqual(["suppression u1 commence", "suppression u1 finie", "envoi remplaçante"]);
  });

  it("le nettoyage est attendu avant chaque envoi, pas seulement avant un remplacement", async () => {
    const items = [item(1), item(2)];
    const api = fake(items);
    await sendAlbumPhotos(items, api.deps);
    expect(api.releases()).toBe(2);
  });
});

describe("retirer une photo : l'opération entre dans la file AVANT son premier appel réseau, et n'en sort que sur une réponse qui prouve son issue", () => {
  const net = new TypeError("réseau coupé");
  const status = (code: number) => Object.assign(new Error(`HTTP ${code}`), { status: code });
  const stopsOn = (e: unknown) => e === net || [401, 403].includes((e as { status?: number }).status ?? 0);
  const finalOn = (e: unknown) => isDefinitiveStatus((e as { status?: number }).status ?? 0);
  /** Une file dont le stockage est en mémoire (journal des écritures et des appels, dans l'ordre) et dont `current` peut changer. */
  function harness(remove: (op: QueuedOp) => Promise<unknown>) {
    const journal: string[] = [];
    let stored: QueuedOp[] = [];
    let session = "A";
    const queue = createRemovalQueue({
      remove: async (op) => {
        journal.push(`appel ${op.id}`);
        return remove(op);
      },
      store: {
        current: () => session === "A",
        read: async () => [...stored],
        write: async (l) => {
          stored = [...l];
          journal.push(`écrit [${l.map((o) => o.id).join(",")}]`);
        },
      },
      stops: stopsOn,
      final: finalOn,
    });
    return { queue, journal, stored: () => stored.map((o) => o.id), changeSession: () => (session = "B") };
  }
  const added = (n: number, over: Partial<AlbumItem> = {}) => item(n, [], { attempted: true, ...over });

  it("l'annulation est en mémoire ET persistée avant son premier appel ; pendant l'attente, `hasPending()` est vrai et la publication est bloquée jusqu'à l'issue (DELETE retardé)", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => {
      release = r;
    });
    const h = harness(async () => slow);
    const photo = added(1, { photoId: "p1" });
    const done = removeAlbumItem(photo, { albumId: "A", queue: h.queue });
    // Avant même que l'appel ne parte : en mémoire (synchrone), puis persistée, puis l'appel.
    expect(h.queue.hasPending()).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.journal).toEqual([`écrit [cancel:A:${photo.clientId}]`, `appel cancel:A:${photo.clientId}`]);
    // La transition « Publier » attend la file : elle ne passe pas devant la suppression en route.
    const canPublish = async () => {
      await h.queue.release();
      return !h.queue.hasPending();
    };
    let published: boolean | null = null;
    const attempt = canPublish().then((ok) => {
      published = ok;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(published).toBeNull();
    release();
    expect(await done).toEqual({ status: "removed" });
    await attempt;
    expect(published).toBe(true);
    expect(h.stored()).toEqual([]);
  });

  it("ajout parti (réponse perdue après validation) : l'annulation est confirmée par l'API (204), la tuile part, l'envoi est supprimé après", async () => {
    const h = harness(async () => undefined);
    const lost = added(1, { upload: { id: "u1", key: "k1", signature: "s" } });
    const result = await removeAlbumItem(lost, { albumId: "A", queue: h.queue });
    expect(result).toEqual({ status: "removed" });
    await new Promise((r) => setTimeout(r, 0));
    expect(h.journal.filter((j) => j.startsWith("appel"))).toEqual([`appel cancel:A:${lost.clientId}`, "appel u1"]);
  });

  it("hors ligne : l'annulation reste en file (mémoire + persistance), la tuile part ; rejouée au retour du réseau, confirmée, jamais perdue", async () => {
    let online = false;
    const h = harness(async () => {
      if (!online) throw net;
    });
    const it1 = added(1, { photoId: "p1" });
    expect(await removeAlbumItem(it1, { albumId: "A", queue: h.queue })).toEqual({ status: "queued" });
    expect(h.queue.hasPending()).toBe(true);
    expect(h.stored()).toEqual([`cancel:A:${it1.clientId}`]);
    online = true;
    await h.queue.replay();
    expect(h.queue.hasPending()).toBe(false);
    expect(h.stored()).toEqual([]);
  });

  it("session expirée (401) pendant une annulation hors ligne : elle RESTE en file ; reconnexion du même compte : rejouée, photo retirée", async () => {
    let step: "expiree" | "reconnecte" = "expiree";
    const h = harness(async () => {
      if (step === "expiree") throw status(401);
    });
    const it1 = added(1, { photoId: "p1" });
    expect(await removeAlbumItem(it1, { albumId: "A", queue: h.queue })).toEqual({ status: "queued" });
    expect(h.queue.takeDropped()).toEqual([]);
    expect(h.queue.hasPending()).toBe(true);
    expect(h.stored()).toEqual([`cancel:A:${it1.clientId}`]);
    // 403 (droits en cours de rétablissement) : même chose.
    step = "expiree";
    await h.queue.replay();
    expect(h.queue.hasPending()).toBe(true);
    step = "reconnecte";
    await h.queue.replay();
    expect(h.queue.hasPending()).toBe(false);
    expect(h.stored()).toEqual([]);
  });

  it("refus définitif au rejeu (retrait hors ligne → 409) : arrêt des rejeux, état d'échec visible, l'album relu : la photo réapparaît ; droits rétablis : elle se retire de nouveau", async () => {
    let mode: "hors-ligne" | "refus" | "ok" = "hors-ligne";
    const h = harness(async () => {
      if (mode === "hors-ligne") throw net;
      if (mode === "refus") throw status(409);
    });
    const gone = added(1, { photoId: "p1" });
    expect(await removeAlbumItem(gone, { albumId: "A", queue: h.queue })).toEqual({ status: "queued" });
    mode = "refus";
    await h.queue.replay();
    // Plus rejoué, mais pas oublié : l'échec est visible (`takeDropped`), la file est vide.
    expect(h.queue.hasPending()).toBe(false);
    const failures = h.queue.takeDropped();
    expect(failures.map((f) => f.op.id)).toEqual([`cancel:A:${gone.clientId}`]);
    // L'album relu rend la photo : elle réapparaît dans la grille (version du serveur) avant toute publication.
    const albumPhotos = [{ id: "p1", url: "/api/albums/A/photos/p1.webp", clientId: gone.clientId } as AlbumPhotoView];
    expect(reappearedPhotos(albumPhotos, { photoIds: [], clientIds: [] }).map((p) => p.id)).toEqual(["p1"]);
    // Droits rétablis : « Retirer » repart (nouvelle opération), confirmée.
    mode = "ok";
    expect(await removeAlbumItem(gone, { albumId: "A", queue: h.queue })).toEqual({ status: "removed" });
  });

  it("refus définitif d'un retrait demandé à l'instant (409 : dernière photo d'un album publié) : la photo reste, l'erreur remonte, rien ne reste en file", async () => {
    const refused = status(409);
    const h = harness(async () => {
      throw refused;
    });
    const result = await removeAlbumItem(added(1, { photoId: "p1" }), { albumId: "A", queue: h.queue });
    expect(result).toEqual({ status: "refused", error: refused });
    expect(h.queue.hasPending()).toBe(false);
    expect(h.queue.takeDropped()).toEqual([]);
    expect(h.stored()).toEqual([]);
  });

  it("session changée (autre compte, autre onglet) : la file ne joue plus, n'écrit plus, n'efface rien du stockage du compte quitté", async () => {
    const h = harness(async () => {
      throw net;
    });
    const gone = added(1, { photoId: "p1" });
    expect(await removeAlbumItem(gone, { albumId: "A", queue: h.queue })).toEqual({ status: "queued" });
    const before = h.stored();
    const calls = h.journal.length;
    h.changeSession();
    await h.queue.replay();
    expect(await h.queue.enqueue({ id: "x", albumId: "A", clientId: "y" })).toBe("pending");
    expect(h.journal.length).toBe(calls);
    expect(h.stored()).toEqual(before);
  });

  it("photo dont l'ajout n'est pas parti : aucune annulation côté serveur, seulement son envoi retiré", async () => {
    const h = harness(async () => undefined);
    const result = await removeAlbumItem(item(1, [], { upload: { id: "u9", key: "k9", signature: "s" } }), {
      albumId: "A",
      queue: h.queue,
    });
    expect(result).toEqual({ status: "removed" });
    await new Promise((r) => setTimeout(r, 0));
    expect(h.journal.filter((j) => j.startsWith("appel"))).toEqual(["appel u9"]);
  });

  it("les photos réapparues ne doublent pas celles déjà montrées ni celles dont le retrait attend encore", () => {
    const photos = [
      { id: "a", url: "u", clientId: "ca" },
      { id: "b", url: "u", clientId: "cb" },
      { id: "c", url: "u", clientId: "cc" },
    ] as AlbumPhotoView[];
    expect(reappearedPhotos(photos, { photoIds: ["a"], clientIds: ["cb"] }).map((p) => p.id)).toEqual(["c"]);
  });
});
