import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, resetDb, seedReference, signUp, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { plateTransferRequests } from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  useClock(new Date("2026-10-15T10:00:00Z"));
  ref = await seedReference();
});

const car = () => ({
  vehicleType: "car",
  makeId: ref.makeId,
  modelId: ref.modelId,
  generationId: ref.generationId,
  year: 1995,
  plate: "ab-123-cd",
});

describe("inscription et profil", () => {
  it("l'inscription crée le profil avec le pseudo demandé", async () => {
    const kenji = await signUp("Kenji_66");
    const me = await call(kenji, "GET", "/me");
    expect(me.status).toBe(200);
    expect(me.json.profile.pseudo).toBe("Kenji_66");
    expect(me.json.profile.grade).toBe("rodage");
    expect(me.json.twoFactorRequired).toBe(false);
  });

  it("pseudo déjà pris (casse ignorée) : un autre est proposé, et la modification est refusée", async () => {
    await signUp("Lea_11");
    const other = await signUp("lea_11");
    expect(other.pseudo).not.toBe("lea_11");
    const res = await call(other, "PATCH", "/me/profile", { pseudo: "LEA_11" });
    expect(res.status).toBe(409);
  });

  it("disponibilité du pseudo (public, casse ignorée, format vérifié)", async () => {
    await signUp("Kenji_66");
    const get = (pseudo: string) => app.request(`/api/pseudo-available?pseudo=${encodeURIComponent(pseudo)}`);
    expect(await (await get("kenji_66")).json()).toEqual({ valid: true, available: false });
    expect(await (await get("Libre_77")).json()).toEqual({ valid: true, available: true });
    expect(await (await get("a b")).json()).toEqual({ valid: false, available: false });
    expect(await (await get("")).json()).toEqual({ valid: false, available: false });
  });

  it("profil privé : pseudo, grade, marque et modèle seulement", async () => {
    const a = await signUp("Prive_01");
    const b = await signUp("Curieux_02");
    await call(a, "POST", "/me/vehicles", car());
    await call(a, "PATCH", "/me/profile", { visibility: "private", bio: "secret", departments: ["66"] });
    const res = await call(b, "GET", "/users/Prive_01");
    expect(res.status).toBe(200);
    expect(res.json.bio).toBeNull();
    expect(res.json.departments).toBeNull();
    expect(res.json.vehicles[0].label).toBe("BMW Série 3");
    expect(res.text).not.toContain("AB-123-CD");
    expect(res.text.toLowerCase()).not.toContain("ab-123-cd");
  });

  it("profils réservés aux utilisateurs connectés", async () => {
    await signUp("Public_03");
    expect((await call(null, "GET", "/users/Public_03")).status).toBe(401);
  });
});

describe("garage", () => {
  it("plaque obligatoire pour un véhicule actif, sauf non immatriculé", async () => {
    const u = await signUp("Garage_01");
    const { plate: _p, ...noPlate } = car();
    expect((await call(u, "POST", "/me/vehicles", noPlate)).status).toBe(400);
    const res = await call(u, "POST", "/me/vehicles", { ...noPlate, unregistered: true });
    expect(res.status).toBe(201);
    expect(res.json.plate).toBeNull();
    expect(res.json.unregistered).toBe(true);
  });

  it("plaque unique parmi les véhicules actifs : 409 et demande de transfert", async () => {
    const a = await signUp("Proprio_01");
    const b = await signUp("Acheteur_02");
    expect((await call(a, "POST", "/me/vehicles", car())).status).toBe(201);
    const dup = await call(b, "POST", "/me/vehicles", { ...car(), plate: "AB 123 CD" });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("plate_taken");
    const requests = await db.select().from(plateTransferRequests).where(eq(plateTransferRequests.toUserId, b.id));
    expect(requests).toHaveLength(1);
  });

  it("une plaque redevient libre quand le véhicule est vendu", async () => {
    const a = await signUp("Vendeur_01");
    const b = await signUp("Repreneur_02");
    const v = await call(a, "POST", "/me/vehicles", car());
    expect((await call(a, "PATCH", `/me/vehicles/${v.json.id}`, { status: "sold" })).json.archivedAt).not.toBeNull();
    expect((await call(b, "POST", "/me/vehicles", car())).status).toBe(201);
  });

  it("modèle d'une autre marque, ou type incohérent : refusé", async () => {
    const u = await signUp("Garage_02");
    expect((await call(u, "POST", "/me/vehicles", { ...car(), modelId: ref.motoModelId })).status).toBe(400);
  });

  it("catégorie incohérente avec l'âge du véhicule : refusée", async () => {
    const u = await signUp("Garage_03");
    const res = await call(u, "POST", "/me/vehicles", { ...car(), year: 2015, categoryIds: [ref.youngtimer.id] });
    expect(res.status).toBe(400);
    const ok = await call(u, "POST", "/me/vehicles", { ...car(), year: 1995, categoryIds: [ref.youngtimer.id] });
    expect(ok.status).toBe(201);
    expect(ok.json.categories[0].slug).toBe("youngtimer");
  });

  it("la fiche vue par un autre n'a jamais la plaque", async () => {
    const a = await signUp("Garage_04");
    const b = await signUp("Garage_05");
    const v = await call(a, "POST", "/me/vehicles", car());
    expect(v.json.plate).toBe("ab-123-cd");
    const seen = await call(b, "GET", `/vehicles/${v.json.id}`);
    expect(seen.status).toBe(200);
    expect(seen.json.plate).toBeUndefined();
    expect(seen.text.toUpperCase()).not.toContain("AB-123-CD");
  });

  it("compte privé : la fiche d'un véhicule ne montre que marque et modèle", async () => {
    const a = await signUp("Garage_07");
    const b = await signUp("Garage_08");
    const v = await call(a, "POST", "/me/vehicles", { ...car(), color: "Rouge" });
    await call(a, "PATCH", "/me/profile", { visibility: "private" });
    const seen = await call(b, "GET", `/vehicles/${v.json.id}`);
    expect(seen.json).toMatchObject({ label: "BMW Série 3", photoUrl: null });
    expect(seen.json.color).toBeUndefined();
    expect((await call(a, "GET", `/vehicles/${v.json.id}`)).json.color).toBe("Rouge");
  });

  it("photos : recompressées en WebP, 8 au plus, réordonnées et supprimées", async () => {
    const u = await signUp("Photo_01");
    const v = await call(u, "POST", "/me/vehicles", car());
    const jpeg = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#d4a017" } })
      .jpeg()
      .toBuffer();
    const upload = async () => {
      const form = new FormData();
      form.append("photo", new File([new Uint8Array(jpeg)], "auto.jpg", { type: "image/jpeg" }));
      return app.request(`/api/me/vehicles/${v.json.id}/photos`, {
        method: "POST",
        body: form,
        headers: { cookie: u.cookie },
      });
    };
    const first = await upload();
    expect(first.status).toBe(201);
    const body = (await first.json()) as { photos: { id: string; width: number; url: string }[] };
    expect(body.photos[0]?.width).toBe(2048);
    expect(body.photos[0]?.url).toMatch(/\.webp$/);
    for (let i = 0; i < 7; i++) expect((await upload()).status).toBe(201);
    expect((await upload()).status).toBe(409);

    const list = await call(u, "GET", `/me/vehicles/${v.json.id}`);
    const ids: string[] = list.json.photos.map((p: { id: string }) => p.id);
    const reordered = await call(u, "PUT", `/me/vehicles/${v.json.id}/photos/order`, { photoIds: [...ids].reverse() });
    expect(reordered.status).toBe(200);
    expect(reordered.json.photos[0].id).toBe(ids[7]);
    const removed = await call(u, "DELETE", `/me/vehicles/${v.json.id}/photos/${ids[0]}`);
    expect(removed.json.photos.map((p: { position: number }) => p.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const file = await app.request(removed.json.photos[0].url);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/webp");
  });

  it("suppression réelle d'un véhicule qui n'a jamais candidaté", async () => {
    const u = await signUp("Garage_06");
    const v = await call(u, "POST", "/me/vehicles", car());
    expect((await call(u, "DELETE", `/me/vehicles/${v.json.id}`)).status).toBe(204);
    expect((await call(u, "GET", `/me/vehicles/${v.json.id}`)).status).toBe(404);
  });
});
