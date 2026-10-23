// Envoi de l'ajout de véhicule (lot M1, tour 2) avec une API simulée : décision de plaque exigée, recadrage après un
// échec partiel, photo retirée après un envoi partiel, réponse perdue, création idempotente.
import type { PlateRect, VehicleCreate, VehicleFull } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { type Draft, type DraftPhoto, emptyDraft, STEP } from "./model";
import { DraftIncomplete, newSendMemo, photoPlan, photoSignature, runSend, type SendApi } from "./send";

const RECT: PlateRect = { x: 0.1, y: 0.6, w: 0.3, h: 0.1 };
const RECT2: PlateRect = { x: 0.5, y: 0.5, w: 0.2, h: 0.1 };

const photo = (key: string, over: Partial<DraftPhoto> = {}): DraftPhoto => ({
  key,
  uri: `file:///${key}.jpg`,
  width: 1600,
  height: 1600,
  rects: [RECT],
  detection: "found",
  ...over,
});

const draft = (photos: DraftPhoto[], over: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(),
  makeId: "mk",
  modelId: "md",
  generationId: null,
  plate: "GA-662-KS",
  photos,
  ...over,
});

type Stored = { id: string; uri: string; rects: PlateRect[] | null; noPlate: boolean };

/** API simulée : un véhicule en mémoire ; `failUpload(n)` fait échouer le n-ième envoi de photo (réseau). */
function fakeApi() {
  const calls: string[] = [];
  let photos: Stored[] = [];
  let seq = 0;
  let uploads = 0;
  const failing = new Set<number>();
  let loseNextUpload = false;
  const created = new Map<string, string>();
  let fiche: Partial<VehicleCreate> = {};
  const vehicle = (id: string): VehicleFull =>
    ({
      ...fiche,
      id,
      categories: (fiche.categoryIds ?? []).map((c) => ({ id: c })),
      photos: photos.map((p, i) => ({
        id: p.id,
        position: i + 1,
        url: p.uri,
        width: 1,
        height: 1,
        plateBlurred: false,
      })),
      plateTransfer: null,
    }) as unknown as VehicleFull;
  const api: SendApi = {
    create: async (body: VehicleCreate) => {
      calls.push(`create:${body.clientKey}`);
      fiche = body;
      const existing = body.clientKey ? created.get(body.clientKey) : undefined;
      if (existing) return vehicle(existing);
      const id = `v${++seq}`;
      if (body.clientKey) created.set(body.clientKey, id);
      return vehicle(id);
    },
    update: async (id) => {
      calls.push("update");
      return vehicle(id);
    },
    get: async (id) => {
      calls.push("get");
      return vehicle(id);
    },
    upload: async (id, p, fields) => {
      uploads++;
      calls.push(`upload:${p.key}:${"plateRects" in fields ? "rects" : "noPlate"}`);
      if (failing.has(uploads)) throw Object.assign(new Error("Pas de connexion"), { status: 0 });
      photos = [
        ...photos,
        {
          id: `p${++seq}`,
          uri: p.uri,
          rects: "plateRects" in fields ? fields.plateRects : null,
          noPlate: "noPlate" in fields,
        },
      ];
      if (loseNextUpload) {
        loseNextUpload = false;
        throw Object.assign(new Error("Réponse perdue"), { status: 0 });
      }
      return vehicle(id);
    },
    blur: async (id, photoId) => {
      calls.push(`blur:${photoId}`);
      return vehicle(id);
    },
    remove: async (id, photoId) => {
      calls.push(`remove:${photoId}`);
      photos = photos.filter((p) => p.id !== photoId);
      return vehicle(id);
    },
    reorder: async (id, ids) => {
      calls.push(`reorder:${ids.join(",")}`);
      photos = ids.map((x) => photos.find((p) => p.id === x) as Stored);
      return vehicle(id);
    },
  };
  return {
    api,
    calls,
    photos: () => photos,
    failUpload: (n: number) => failing.add(n),
    loseNextUpload: () => {
      loseNextUpload = true;
    },
  };
}

describe("envoi (lot M1, tour 2)", () => {
  it("rien ne part si une photo n'a ni cadre ni « aucune plaque » confirmé (import arrivé après l'étape Plaque)", async () => {
    const fake = fakeApi();
    const memo = newSendMemo("k1");
    const late = draft([photo("a"), photo("b", { rects: [], detection: "none" })]);
    await expect(runSend(late, [], memo, fake.api)).rejects.toMatchObject({ step: STEP.plate });
    await expect(runSend(late, [], memo, fake.api)).rejects.toBeInstanceOf(DraftIncomplete);
    const pending = draft([photo("a"), photo("b", { rects: [], detection: "pending" })]);
    await expect(runSend(pending, [], memo, fake.api)).rejects.toMatchObject({ step: STEP.plate });
    expect(fake.calls).toEqual([]);
  });

  it("chaque photo part avec sa décision : cadres, ou « aucune plaque » confirmé", async () => {
    const fake = fakeApi();
    const d = draft([photo("a"), photo("b", { rects: [], noPlate: true })]);
    await runSend(d, [], newSendMemo("k1"), fake.api);
    expect(fake.calls.filter((c) => c.startsWith("upload"))).toEqual(["upload:a:rects", "upload:b:noPlate"]);
    expect(fake.photos().map((p) => [p.rects, p.noPlate])).toEqual([
      [[RECT], false],
      [null, true],
    ]);
  });

  it("recadrage après un échec partiel : la photo déjà envoyée est remplacée, avec ses nouveaux masques", async () => {
    const fake = fakeApi();
    const memo = newSendMemo("k1");
    fake.failUpload(2);
    const first = draft([photo("a"), photo("b")]);
    await expect(runSend(first, [], memo, fake.api)).rejects.toMatchObject({ status: 0 });
    expect(fake.photos().map((p) => p.uri)).toEqual(["file:///a.jpg"]);
    const oldA = fake.photos()[0]?.id;

    // La personne revient à l'étape Photos et recadre la photo a : nouveau carré, nouveaux cadres.
    const recropped = draft([photo("a", { uri: "file:///a-2.jpg", rects: [RECT2] }), photo("b")]);
    const done = await runSend(recropped, [], memo, fake.api);
    expect(fake.calls).toContain(`remove:${oldA}`);
    expect(fake.photos().map((p) => [p.uri, p.rects])).toEqual([
      ["file:///a-2.jpg", [RECT2]],
      ["file:///b.jpg", [RECT]],
    ]);
    expect(done.photos.map((p) => p.url)).toEqual(["file:///a-2.jpg", "file:///b.jpg"]);
    // Une seule création : la reprise ne recrée pas le véhicule.
    expect(fake.calls.filter((c) => c.startsWith("create"))).toHaveLength(1);

    // Rejouer sans changement n'envoie plus rien.
    const before = fake.calls.length;
    await runSend(recropped, [], memo, fake.api);
    expect(fake.calls.slice(before).filter((c) => c.startsWith("upload") || c.startsWith("remove"))).toEqual([]);
  });

  it("cadres changés sur une photo déjà envoyée : elle est remplacée aussi", () => {
    const memo = newSendMemo("k1");
    const a = photo("a");
    memo.uploaded.set("a", { id: "p1", sig: photoSignature(a) });
    expect(photoPlan(draft([a]), [], memo, new Set(["p1"]))).toEqual([]);
    expect(photoPlan(draft([{ ...a, rects: [RECT2] }]), [], memo, new Set(["p1"]))).toEqual([
      { kind: "remove", photoId: "p1" },
      { kind: "upload", key: "a", sig: photoSignature({ ...a, rects: [RECT2] }), rects: [RECT2], noPlate: false },
    ]);
  });

  it("photo retirée après un envoi partiel : retirée en ligne aussi", async () => {
    const fake = fakeApi();
    const memo = newSendMemo("k1");
    fake.failUpload(2);
    await expect(runSend(draft([photo("a"), photo("b")]), [], memo, fake.api)).rejects.toBeTruthy();
    const a = fake.photos()[0]?.id;
    await runSend(draft([photo("b")]), [], memo, fake.api);
    expect(fake.calls).toContain(`remove:${a}`);
    expect(fake.photos().map((p) => p.uri)).toEqual(["file:///b.jpg"]);
  });

  it("réponse perdue pendant l'envoi d'une photo : retrouvée, pas de doublon", async () => {
    const fake = fakeApi();
    const memo = newSendMemo("k1");
    fake.loseNextUpload();
    await expect(runSend(draft([photo("a"), photo("b")]), [], memo, fake.api)).rejects.toBeTruthy();
    await runSend(draft([photo("a"), photo("b")]), [], memo, fake.api);
    expect(fake.photos().map((p) => p.uri)).toEqual(["file:///a.jpg", "file:///b.jpg"]);
  });

  it("création idempotente : la clé client part avec la création", async () => {
    const fake = fakeApi();
    const memo = newSendMemo("8d3c1b5e-4f7a-4c2e-9b1d-2a6f0e8c7d45");
    await runSend(draft([photo("a")]), [], memo, fake.api);
    expect(fake.calls[0]).toBe("create:8d3c1b5e-4f7a-4c2e-9b1d-2a6f0e8c7d45");
    // Réponse de création perdue : la tentative suivante renvoie la même clé, l'API rend le même véhicule.
    const lost = newSendMemo("8d3c1b5e-4f7a-4c2e-9b1d-2a6f0e8c7d45");
    const again = await runSend(draft([photo("a")]), [], lost, fake.api);
    expect(again.id).toBe(memo.vehicleId);
  });

  it("modification : photos d'avant retirées, floutage d'une photo en ligne une seule fois", async () => {
    const fake = fakeApi();
    const v = { id: "v0", photos: [{ id: "r1" }, { id: "r2" }] } as unknown as VehicleFull;
    const memo = newSendMemo("k1", v);
    const remote = photo("r1", { remoteId: "r1", rects: [RECT] });
    const plan = photoPlan(draft([remote]), v.photos, memo, new Set(["r1", "r2"]));
    expect(plan).toEqual([
      { kind: "remove", photoId: "r2" },
      { kind: "blur", key: "r1", photoId: "r1", rects: [RECT], sig: JSON.stringify([RECT]) },
    ]);
    memo.blurred.set("r1", JSON.stringify([RECT]));
    expect(photoPlan(draft([remote]), v.photos, memo, new Set(["r1"]))).toEqual([]);
  });
});
