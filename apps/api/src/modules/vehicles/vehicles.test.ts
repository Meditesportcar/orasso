import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, resetDb, seedReference, signUp, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { plateTransferRequests, vehicleEngines, vehicles } from "../../db/schema";

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

  it("les catégories du référentiel sont publiques (page événement des visiteurs)", async () => {
    const res = await app.request("/api/vehicle-reference/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
    // Marques et modèles aussi (lot 13) : le formulaire d'inscription express les lit avant la création du compte.
    expect((await app.request("/api/vehicle-reference/makes")).status).toBe(200);
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

describe("motorisations d'une génération (lot M1)", () => {
  const engines = (id: string) => app.request(`/api/vehicle-reference/generations/${id}/engines`);

  it("publique, liste vide pour une génération sans motorisation", async () => {
    const res = await engines(ref.generationId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("triée par position, puis puissance décroissante, puis nom, au format VehicleEngine", async () => {
    await db.insert(vehicleEngines).values([
      { generationId: ref.generationId, name: "2.5 L6", powerHp: 192, weightKg: 1300, drivetrain: "rwd", position: 1 },
      {
        generationId: ref.generationId,
        name: "3.2 L6 (S50)",
        powerHp: 321,
        weightKg: 1460,
        drivetrain: "rwd",
        position: 0,
      },
      { generationId: ref.generationId, name: "1.8 L4 B", powerHp: 140, weightKg: null, drivetrain: null, position: 1 },
      {
        generationId: ref.generationId,
        name: "1.8 L4 A",
        powerHp: 140,
        weightKg: 1230,
        drivetrain: "fwd",
        position: 1,
      },
      {
        generationId: ref.generationId,
        name: "Inconnue",
        powerHp: null,
        weightKg: null,
        drivetrain: null,
        position: 1,
      },
    ]);
    const res = await engines(ref.generationId);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Record<string, unknown>[];
    expect(list.map((e) => e.name)).toEqual(["3.2 L6 (S50)", "2.5 L6", "1.8 L4 A", "1.8 L4 B", "Inconnue"]);
    expect(list[0]).toEqual({
      id: expect.any(String),
      generationId: ref.generationId,
      name: "3.2 L6 (S50)",
      powerHp: 321,
      weightKg: 1460,
      drivetrain: "rwd",
    });
    expect(list[4]).toMatchObject({ powerHp: null, weightKg: null, drivetrain: null });
  });

  it("identifiant qui n'est pas un uuid : 400", async () => {
    expect((await engines("pas-un-uuid")).status).toBe(400);
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

  it("plaque unique parmi les véhicules actifs : doublon chez soi refusé (409), chez un autre = demande de transfert", async () => {
    const a = await signUp("Proprio_01");
    const b = await signUp("Acheteur_02");
    expect((await call(a, "POST", "/me/vehicles", car())).status).toBe(201);
    const own = await call(a, "POST", "/me/vehicles", { ...car(), plate: "AB 123 CD" });
    expect(own.status).toBe(409);
    expect(own.json.error.code).toBe("plate_taken");
    // Lot 31 : le véhicule du demandeur est créé en attente de transfert (le détail est dans garage.test.ts).
    const dup = await call(b, "POST", "/me/vehicles", { ...car(), plate: "AB 123 CD" });
    expect(dup.status).toBe(201);
    expect(dup.json.plateTransfer.status).toBe("pending");
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

  it("lot M2 : toute saisie de plaque est stockée sous une seule forme, rendue lisible ; une étrangère passe", async () => {
    const u = await signUp("Garage_M2");
    const first = await call(u, "POST", "/me/vehicles", { ...car(), plate: "ae 665gh" });
    expect(first.status).toBe(201);
    expect(first.json.plate).toBe("AE-665-GH");
    const row = await db.query.vehicles.findFirst({ where: eq(vehicles.id, first.json.id) });
    expect(row).toMatchObject({ plate: "AE-665-GH", plateNormalized: "AE665GH" });
    // Même plaque écrite autrement : doublon reconnu.
    const again = await call(u, "POST", "/me/vehicles", { ...car(), plate: "AE-665-GH" });
    expect(again.status).toBe(409);
    // W garage et plaque étrangère : acceptées.
    const w = await call(u, "PATCH", `/me/vehicles/${first.json.id}`, { plate: "w623 ax" });
    expect(w.status).toBe(200);
    expect(w.json.plate).toBe("W-623-AX");
    const foreign = await call(u, "PATCH", `/me/vehicles/${first.json.id}`, { plate: "m-ab  1234" });
    expect(foreign.status).toBe(200);
    expect(foreign.json.plate).toBe("M-AB 1234");
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, first.json.id) }))?.plateNormalized).toBe(
      "MAB1234",
    );
  });

  it("la fiche vue par un autre n'a jamais la plaque", async () => {
    const a = await signUp("Garage_04");
    const b = await signUp("Garage_05");
    const v = await call(a, "POST", "/me/vehicles", car());
    expect(v.json.plate).toBe("AB-123-CD"); // saisie « ab-123-cd », rendue lisible (lot M2)
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
