// Lot R5a (maquettes R5.1 à R5.3) : marques filtrées par type, catalogue des styles (familles, icônes, masculin, pause,
// synchronisation qui ne ressuscite rien), « Propose-le », catalogue et file de l'administration (droits, transaction,
// 409, journal, notifications, style posé si les règles l'acceptent).
import { fromWallTime, makesForType, type VehicleMake } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createVehicle, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  adminAuditLog,
  categories,
  categoryProposals,
  notifications,
  profileInterests,
  vehicleCategories,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
} from "../../db/schema";
import type { CatalogStyle } from "../../db/seed/style-catalog";
import { syncStyleCatalog } from "./style-sync";

type AdminRow = { id: string; slug: string; family: string; allowedVehicleTypes: string[] | null; position: number };

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 10, day: 26, hour: 15, minute: 0 }));
});

/** Seat (voitures), Honda (une voiture, une moto), Scania (camion), « Autre ». */
async function makes() {
  const make = async (name: string, country: string | null, models: [string, "car" | "moto" | "truck"][]) => {
    const [m] = await db
      .insert(vehicleMakes)
      .values({ name, slug: name.toLowerCase(), country, isOther: name === "Autre" })
      .returning();
    const ids: Record<string, { makeId: string; modelId: string; generationId: string }> = {};
    for (const [model, vehicleType] of models) {
      const [mo] = await db
        .insert(vehicleModels)
        .values({ makeId: m!.id, name: model, slug: model.toLowerCase(), vehicleType })
        .returning();
      const [g] = await db.insert(vehicleGenerations).values({ modelId: mo!.id, name: "Série 1" }).returning();
      ids[model] = { makeId: m!.id, modelId: mo!.id, generationId: g!.id };
    }
    await db
      .insert(vehicleModels)
      .values({ makeId: m!.id, name: "Autre", slug: "autre", vehicleType: "car", isOther: true });
    return ids;
  };
  return {
    seat: await make("Seat", "ES", [["Ibiza", "car"]]),
    honda: await make("Honda", "JP", [
      ["Civic", "car"],
      ["CBR", "moto"],
    ]),
    scania: await make("Scania", "SE", [["R", "truck"]]),
    autre: await make("Autre", null, []),
  };
}

const bySlug = async (slug: string) => {
  const row = await db.query.categories.findFirst({ where: eq(categories.slug, slug) });
  if (!row) throw new Error(slug);
  return row;
};

describe("R5.1 : la liste des marques suit le type", () => {
  it("chaque marque dit les types de ses modèles ; une Seat n'est pas une moto, Honda est dans les deux", async () => {
    await makes();
    const res = await call(null, "GET", "/vehicle-reference/makes");
    expect(res.status).toBe(200);
    const rows = res.json as VehicleMake[];
    const types = Object.fromEntries(rows.map((m) => [m.name, m.vehicleTypes]));
    expect(types).toEqual({ Autre: [], Honda: ["car", "moto"], Scania: ["truck"], Seat: ["car"] });
    const names = (type: "car" | "moto" | "truck") => makesForType(rows, type).map((m) => m.name);
    expect(names("moto")).toEqual(["Honda", "Autre"]);
    expect(names("car")).toEqual(["Honda", "Seat", "Autre"]);
    expect(names("truck")).toEqual(["Scania", "Autre"]);
    // Une réponse ancienne (sans types) : la marque reste partout.
    expect(makesForType([{ isOther: false }], "moto")).toHaveLength(1);
  });
});

describe("R5.2 : catalogue de départ des styles", () => {
  it("adopte les catégories existantes une seule fois, ajoute les nouvelles, ne ressuscite ni ne réécrit rien", async () => {
    // Base d'avant le lot : « Origine », « Moto » actifs, sans famille.
    await db.insert(categories).values([
      { slug: "origine", label: "Origine", position: 13 },
      { slug: "moto", label: "Moto", position: 16 },
      { slug: "youngtimer", label: "Youngtimer", minVehicleAge: 20, position: 0 },
    ]);
    const first = await syncStyleCatalog();
    expect(first.adopted).toBe(3);
    expect(first.inserted).toBeGreaterThan(25);
    expect(await bySlug("origine")).toMatchObject({ label: "D'origine", family: "preparation", icon: "drop" });
    expect(await bySlug("moto")).toMatchObject({ active: false, allowedVehicleTypes: ["moto"] });
    expect(await bySlug("ancienne")).toMatchObject({ label: "Ancienne", labelM: "Ancien", family: "epoque" });
    expect(await bySlug("jdm")).toMatchObject({ family: "pays", allowedCountries: ["JP"] });
    expect(await bySlug("4x4")).toMatchObject({ allowedVehicleTypes: ["offroad"], icon: "mount" });
    // Ordre du catalogue : Époque, Genre, Préparation, Pratique, Pays.
    expect((await bySlug("youngtimer")).position).toBeLessThan((await bySlug("sportive")).position);
    expect((await bySlug("sportive")).position).toBeLessThan((await bySlug("origine")).position);
    expect(await syncStyleCatalog()).toEqual({ inserted: 0, adopted: 0 });

    // L'admin renomme, met en pause, supprime : la synchronisation suivante n'y touche pas.
    await db.update(categories).set({ label: "Stock", active: false }).where(eq(categories.slug, "origine"));
    await db.delete(categories).where(eq(categories.slug, "stunt"));
    const catalog: CatalogStyle[] = [
      { slug: "origine", label: "D'origine", family: "preparation", icon: "drop", types: null },
      { slug: "stunt", label: "Stunt", family: "pratique", icon: "undo", types: ["moto"] },
      { slug: "bobber", label: "Bobber", family: "genre", icon: "moto", types: ["moto"] },
    ];
    expect(await syncStyleCatalog(catalog)).toEqual({ inserted: 1, adopted: 0 });
    expect(await bySlug("origine")).toMatchObject({ label: "Stock", active: false });
    expect(await db.query.categories.findFirst({ where: eq(categories.slug, "stunt") })).toBeUndefined();
    // Un style nouveau du catalogue arrive à la fin.
    const all = await db.select({ position: categories.position }).from(categories);
    expect((await bySlug("bobber")).position).toBe(Math.max(...all.map((r) => r.position)));
  });

  it("l'étape Catégories : famille, icône, masculin pour un camion, un style en pause n'est plus proposé", async () => {
    await syncStyleCatalog();
    const options = async (q: string) =>
      (await call(null, "GET", `/vehicle-reference/categories?${q}`)).json as {
        slug: string;
        label: string;
        family: string;
        icon: string;
        eligible: boolean;
        refusal: string | null;
      }[];
    const truck = await options("vehicleType=truck&year=2008");
    const t = (slug: string) => truck.find((c) => c.slug === slug);
    expect(t("ancienne")).toMatchObject({ label: "Ancien", family: "epoque", icon: "star", refusal: "age" });
    expect(t("preparee")).toMatchObject({ label: "Préparé", eligible: true });
    expect(t("show-truck")).toMatchObject({ eligible: true, family: "preparation" });
    expect(t("roadster")).toMatchObject({ eligible: false, refusal: "type" });
    expect(t("moto")).toBeUndefined();
    const moto = await options("vehicleType=moto&year=2019");
    expect(moto.find((c) => c.slug === "ancienne")).toMatchObject({ label: "Ancienne" });
    expect(moto.find((c) => c.slug === "supermotard")).toMatchObject({ eligible: true, family: "genre" });
    expect(moto.find((c) => c.slug === "drift")).toMatchObject({ refusal: "type" });
    expect(moto.find((c) => c.slug === "utilitaire")).toBeUndefined();
  });

  it("un style en pause reste sur la fiche : modifiable, gardé, mais il ne s'ajoute plus", async () => {
    const m = await makes();
    await syncStyleCatalog();
    const u = await signUp("Moto_66");
    const ref = m.honda.CBR!;
    const v = await createVehicle(u.id, ref, { vehicleType: "moto", year: 2019 });
    const paused = await bySlug("moto");
    const sportive = await bySlug("sportive");
    await db.insert(vehicleCategories).values({ vehicleId: v.id, categoryId: paused.id });
    const mine = await call(u, "GET", `/me/vehicles/${v.id}`);
    expect(mine.json.categories).toEqual([
      expect.objectContaining({ slug: "moto", label: "Moto", family: "genre", icon: "moto", paused: true }),
    ]);
    expect((await call(u, "PATCH", `/me/vehicles/${v.id}`, { year: 2020 })).status).toBe(200);
    const kept = await call(u, "PATCH", `/me/vehicles/${v.id}`, { categoryIds: [paused.id, sportive.id] });
    expect(kept.status).toBe(200);
    expect(kept.json.categories.map((c: { slug: string }) => c.slug).sort()).toEqual(["moto", "sportive"]);
    // Ailleurs, le style en pause ne se pose plus.
    const other = await createVehicle(u.id, ref, { vehicleType: "moto", year: 2019 });
    expect((await call(u, "PATCH", `/me/vehicles/${other.id}`, { categoryIds: [paused.id] })).status).toBe(400);
    // Un camion : le libellé au masculin sur sa fiche.
    const truck = await createVehicle(u.id, m.scania.R!, { vehicleType: "truck", year: 1980 });
    const ancienne = await bySlug("ancienne");
    expect(
      (await call(u, "PATCH", `/me/vehicles/${truck.id}`, { categoryIds: [ancienne.id] })).json.categories,
    ).toEqual([expect.objectContaining({ label: "Ancien", paused: false })]);
  });

  it("un centre d'intérêt mis en pause reste choisi ; il ne se choisit plus", async () => {
    await syncStyleCatalog();
    const u = await signUp("Interets_66");
    const paused = await bySlug("moto");
    const jdm = await bySlug("jdm");
    await db.insert(profileInterests).values({ userId: u.id, categoryId: paused.id });
    expect((await call(u, "PATCH", "/me/preferences", { interests: [paused.id, jdm.id] })).status).toBe(200);
    const other = await signUp("Interets_34");
    expect((await call(other, "PATCH", "/me/preferences", { interests: [paused.id] })).status).toBe(400);
  });
});

describe("« Il manque un style ? Propose-le »", () => {
  it("nom nettoyé, véhicule de l'auteur seulement, pas de doublon, déjà dans la liste : 409, limite par compte", async () => {
    const m = await makes();
    await syncStyleCatalog();
    const u = await signUp("Propose_66");
    const intruder = await signUp("Intrus_66");
    const v = await createVehicle(u.id, m.honda.CBR!, { vehicleType: "moto", year: 2019 });
    expect((await call(null, "POST", "/categories/proposals", { label: "Bobber", vehicleType: "moto" })).status).toBe(
      401,
    );
    const tooShort = await call(u, "POST", "/categories/proposals", { label: " b​ ", vehicleType: "moto" });
    expect(tooShort.status).toBe(400);
    expect(
      (await call(u, "POST", "/categories/proposals", { label: "x".repeat(25), vehicleType: "moto" })).status,
    ).toBe(201);
    const first = await call(u, "POST", "/categories/proposals", { label: "  Bobber​  ", vehicleType: "moto" });
    expect(first.status).toBe(201);
    // Liste blanche de champs.
    expect(Object.keys(first.json).sort()).toEqual(["id", "label", "status"]);
    expect(first.json).toMatchObject({ label: "Bobber", status: "pending" });
    // Même nom autrement écrit : la même proposition, et le véhicule donné cette fois est gardé.
    const again = await call(u, "POST", "/categories/proposals", {
      label: "BOBBER",
      vehicleType: "car",
      vehicleId: v.id,
    });
    expect(again.json.id).toBe(first.json.id);
    const row = await db.query.categoryProposals.findFirst({ where: eq(categoryProposals.id, first.json.id) });
    expect(row).toMatchObject({ vehicleId: v.id, vehicleType: "moto", key: "bobber" });
    // Le véhicule d'un autre : comme inconnu.
    expect(
      (await call(intruder, "POST", "/categories/proposals", { label: "Bobber", vehicleType: "moto", vehicleId: v.id }))
        .status,
    ).toBe(404);
    // Déjà au catalogue pour ce type : 409 ; pour un autre type, la proposition passe.
    const exists = await call(u, "POST", "/categories/proposals", { label: "super-motard", vehicleType: "moto" });
    expect(exists.status).toBe(409);
    expect(exists.json.error.message).toContain("Supermotard");
    expect((await call(u, "POST", "/categories/proposals", { label: "Drift", vehicleType: "moto" })).status).toBe(201);
    for (let i = 0; i < 7; i++)
      await call(u, "POST", "/categories/proposals", { label: `Style ${i}`, vehicleType: "car" });
    expect((await call(u, "POST", "/categories/proposals", { label: "Encore", vehicleType: "car" })).status).toBe(429);
  });

  it("proposé pendant l'ajout : rattaché au véhicule créé", async () => {
    const m = await makes();
    await syncStyleCatalog();
    const u = await signUp("Ajout_66");
    const p = await call(u, "POST", "/categories/proposals", { label: "Bobber", vehicleType: "moto" });
    const created = await call(u, "POST", "/me/vehicles", {
      vehicleType: "moto",
      ...m.honda.CBR,
      year: 2019,
      plate: "mo-123-to",
      styleProposalIds: [p.json.id],
    });
    expect(created.status).toBe(201);
    const row = await db.query.categoryProposals.findFirst({ where: eq(categoryProposals.id, p.json.id) });
    expect(row?.vehicleId).toBe(created.json.id);
  });
});

describe("R5.3 : catalogue des styles et file de l'administration", () => {
  let admin: TestUser;
  beforeEach(async () => {
    admin = await signUp("Damien_Admin", { twoFactor: true, role: "super_admin" });
  });

  it("droits : passionné 403, super admin sans second facteur 403, visiteur 401", async () => {
    const fan = await signUp("Kenji_66");
    const noFactor = await signUp("Admin_Sans_Code", { role: "super_admin" });
    const UUID = "00000000-0000-4000-8000-000000000000";
    const routes: [string, string, unknown?][] = [
      ["GET", "/admin/categories"],
      ["POST", "/admin/categories", { label: "Bobber", family: "genre", icon: "moto", vehicleType: "moto" }],
      ["PATCH", "/admin/categories/order", { vehicleType: "moto", ids: [UUID] }],
      ["PATCH", `/admin/categories/${UUID}`, { label: "Bobber" }],
      ["GET", "/admin/category-proposals"],
      [
        "POST",
        "/admin/category-proposals/bobber/accept",
        { version: "0".repeat(32), label: "Bobber", family: "genre", icon: "moto" },
      ],
      ["POST", "/admin/category-proposals/bobber/merge", { version: "0".repeat(32), categoryId: UUID }],
      ["POST", "/admin/category-proposals/bobber/decline", { version: "0".repeat(32) }],
    ];
    for (const [method, path, body] of routes) {
      expect((await call(null, method, path, body)).status, `${method} ${path}`).toBe(401);
      expect((await call(fan, method, path, body)).status, `${method} ${path}`).toBe(403);
      expect((await call(noFactor, method, path, body)).status, `${method} ${path}`).toBe(403);
    }
  });

  it("ajouter, ajouter un type à un style existant, renommer, masculin, icône de la liste fermée, pause, ordre", async () => {
    await syncStyleCatalog();
    const created = await call(admin, "POST", "/admin/categories", {
      label: "Bobber",
      family: "genre",
      icon: "moto",
      vehicleType: "moto",
    });
    expect(created.status).toBe(201);
    expect(created.json).toEqual({ id: expect.any(String), created: true });
    expect(await bySlug("bobber")).toMatchObject({ allowedVehicleTypes: ["moto"], active: true });
    // « Cabriolet » existe pour les voitures : il s'ajoute aux motos ; une seconde fois : 409.
    const cabriolet = await call(admin, "POST", "/admin/categories", {
      label: "Cabriolet",
      family: "genre",
      icon: "weatherClear",
      vehicleType: "moto",
    });
    expect(cabriolet.json.created).toBe(false);
    expect((await bySlug("cabriolet")).allowedVehicleTypes).toEqual(["car", "moto"]);
    expect(
      (
        await call(admin, "POST", "/admin/categories", {
          label: "cabriolet",
          family: "genre",
          icon: "weatherClear",
          vehicleType: "car",
        })
      ).status,
    ).toBe(409);
    // Icône hors de la liste fermée : 400.
    expect(
      (
        await call(admin, "POST", "/admin/categories", {
          label: "Rat look",
          family: "genre",
          icon: "alert",
          vehicleType: "car",
        })
      ).status,
    ).toBe(400);
    const id = created.json.id as string;
    const renamed = await call(admin, "PATCH", `/admin/categories/${id}`, {
      label: "Bobber custom",
      labelM: "Bobber custom",
      minVehicleAge: 25,
      icon: "spark",
    });
    expect(renamed.status).toBe(200);
    expect(renamed.json).toMatchObject({ label: "Bobber custom", minVehicleAge: 25, icon: "spark" });
    expect((await call(admin, "PATCH", `/admin/categories/${id}`, { active: false })).json.active).toBe(false);
    // Un pays ne change pas de famille.
    expect(
      (await call(admin, "PATCH", `/admin/categories/${(await bySlug("jdm")).id}`, { family: "genre" })).status,
    ).toBe(400);
    // Ordre des styles d'un type (tous, tour 2) : « Supermotard » avant « Roadster », positions distinctes.
    const motoIds = async () =>
      ((await call(admin, "GET", "/admin/categories")).json as AdminRow[])
        .filter((c) => c.family !== "pays" && (c.allowedVehicleTypes ?? ["moto"]).includes("moto"))
        .map((c) => c.id);
    const roadster = await bySlug("roadster");
    const supermotard = await bySlug("supermotard");
    const ids = (await motoIds()).filter((x) => x !== supermotard.id);
    ids.splice(ids.indexOf(roadster.id), 0, supermotard.id);
    const ordered = await call(admin, "PATCH", "/admin/categories/order", { vehicleType: "moto", ids });
    expect(ordered.status).toBe(200);
    expect(await motoIds()).toEqual(ids);
    const positions = (await db.select({ position: categories.position }).from(categories)).map((r) => r.position);
    expect(new Set(positions).size).toBe(positions.length);
    // Une liste incomplète : 400 (recharger la page).
    expect(
      (await call(admin, "PATCH", "/admin/categories/order", { vehicleType: "moto", ids: ids.slice(1) })).status,
    ).toBe(400);
    // Un style des voitures ne se range pas dans les motos.
    expect(
      (
        await call(admin, "PATCH", "/admin/categories/order", {
          vehicleType: "moto",
          ids: [(await bySlug("drift")).id],
        })
      ).status,
    ).toBe(400);
    const list = await call(admin, "GET", "/admin/categories");
    expect(list.json.find((c: { slug: string }) => c.slug === "bobber")).toMatchObject({
      active: false,
      vehicles: { car: 0, moto: 0, truck: 0 },
    });
    const actions = (await db.select({ action: adminAuditLog.action }).from(adminAuditLog)).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "category.create",
        "category.type_add",
        "category.update",
        "category.pause",
        "category.reorder",
      ]),
    );
  });

  it("file regroupée par nom normalisé ; ajouter au catalogue : posé si les règles l'acceptent, chacun prévenu, puis 409", async () => {
    const m = await makes();
    await syncStyleCatalog();
    const a = await signUp("Yamaha_Max");
    const b = await signUp("Lucas_Prades");
    const c = await signUp("Nina_34");
    const va = await createVehicle(a.id, m.honda.CBR!, { vehicleType: "moto", year: 2019 });
    const vb = await createVehicle(b.id, m.honda.CBR!, { vehicleType: "moto", year: 2023 });
    await call(a, "POST", "/categories/proposals", { label: "Bobber", vehicleType: "moto", vehicleId: va.id });
    await call(b, "POST", "/categories/proposals", { label: "bobber", vehicleType: "moto", vehicleId: vb.id });
    await call(c, "POST", "/categories/proposals", { label: "BOBBER ", vehicleType: "car" });
    await call(c, "POST", "/categories/proposals", { label: "Rat look", vehicleType: "car" });
    const queue = await call(admin, "GET", "/admin/category-proposals");
    expect(queue.status).toBe(200);
    expect(queue.json.total).toBe(4);
    const group = queue.json.items[0];
    expect(group).toMatchObject({
      key: "bobber",
      label: "Bobber",
      count: 3,
      withVehicle: 2,
      vehicleTypes: ["car", "moto"],
      existing: null,
    });
    // À égalité, la première proposée d'abord (elle donne le nom proposé à l'admin).
    expect(group.variants).toEqual([
      { text: "Bobber", count: 1 },
      { text: "bobber", count: 1 },
      { text: "BOBBER", count: 1 },
    ]);
    expect(group.authors.sort()).toEqual(["Lucas_Prades", "Nina_34", "Yamaha_Max"]);
    // Empreinte périmée : 409.
    const stale = await call(admin, "POST", "/admin/category-proposals/bobber/accept", {
      version: "0".repeat(32),
      label: "Bobber",
      family: "genre",
      icon: "moto",
    });
    expect(stale.status).toBe(409);
    // Âge minimal de 5 ans : la moto de 2023 ne le reçoit pas, celle de 2019 oui.
    const accepted = await call(admin, "POST", "/admin/category-proposals/bobber/accept", {
      version: group.version,
      label: "Bobber",
      family: "genre",
      icon: "moto",
      minVehicleAge: 5,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.json).toMatchObject({ count: 3, applied: 1 });
    const bobber = await bySlug("bobber");
    expect(bobber).toMatchObject({ allowedVehicleTypes: ["car", "moto"], family: "genre", icon: "moto" });
    const on = async (vehicleId: string) =>
      (
        await db
          .select()
          .from(vehicleCategories)
          .where(and(eq(vehicleCategories.vehicleId, vehicleId), eq(vehicleCategories.categoryId, bobber.id)))
      ).length;
    expect(await on(va.id)).toBe(1);
    expect(await on(vb.id)).toBe(0);
    const notes = await db.select().from(notifications).where(eq(notifications.type, "style_proposal_decided"));
    expect(notes).toHaveLength(3);
    expect(notes.find((n) => n.userId === a.id)?.body).toContain("Il est posé sur");
    expect(notes.find((n) => n.userId === b.id)?.body).not.toContain("Il est posé sur");
    const statuses = await db.select({ status: categoryProposals.status }).from(categoryProposals);
    expect(statuses.filter((s) => s.status === "accepted")).toHaveLength(3);
    // File déjà traitée : 409.
    expect(
      (
        await call(admin, "POST", "/admin/category-proposals/bobber/accept", {
          version: group.version,
          label: "Bobber",
          family: "genre",
          icon: "moto",
        })
      ).status,
    ).toBe(409);
    const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "category.proposal_accept"));
    expect(audit).toHaveLength(1);
  });

  it("rattacher à un style existant (pas en pause) ; refuser ; chaque proposant prévenu", async () => {
    const m = await makes();
    await syncStyleCatalog();
    const a = await signUp("Motard_66");
    const v = await createVehicle(a.id, m.honda.CBR!, { vehicleType: "moto", year: 2019 });
    await call(a, "POST", "/categories/proposals", { label: "Motard", vehicleType: "moto", vehicleId: v.id });
    await call(a, "POST", "/categories/proposals", { label: "Rat look", vehicleType: "moto" });
    const queue = (await call(admin, "GET", "/admin/category-proposals")).json.items as {
      key: string;
      version: string;
    }[];
    const motard = queue.find((g) => g.key === "motard")!;
    const ratlook = queue.find((g) => g.key === "ratlook")!;
    const paused = await bySlug("moto");
    expect(
      (
        await call(admin, "POST", "/admin/category-proposals/motard/merge", {
          version: motard.version,
          categoryId: paused.id,
        })
      ).status,
    ).toBe(400);
    const supermotard = await bySlug("supermotard");
    const merged = await call(admin, "POST", "/admin/category-proposals/motard/merge", {
      version: motard.version,
      categoryId: supermotard.id,
    });
    expect(merged.status).toBe(200);
    expect(merged.json).toMatchObject({ count: 1, applied: 1 });
    const mine = await call(a, "GET", `/me/vehicles/${v.id}`);
    expect(mine.json.categories.map((c: { slug: string }) => c.slug)).toContain("supermotard");
    const declined = await call(admin, "POST", "/admin/category-proposals/ratlook/decline", {
      version: ratlook.version,
    });
    expect(declined.status).toBe(200);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, a.id));
    const bodies = notes.filter((n) => n.type === "style_proposal_decided").map((n) => n.body);
    expect(bodies).toHaveLength(2);
    expect(bodies.some((b) => b.includes("« Motard » au style « Supermotard »"))).toBe(true);
    expect(bodies.some((b) => b.includes("n'a pas retenu « Rat look »"))).toBe(true);
    expect((await call(admin, "GET", "/admin/category-proposals")).json.items).toEqual([]);
    expect(
      (await call(admin, "POST", "/admin/category-proposals/ratlook/decline", { version: ratlook.version })).status,
    ).toBe(409);
    expect(
      (await call(admin, "POST", "/admin/category-proposals/x-y/decline", { version: ratlook.version })).status,
    ).toBe(400);
  });
});
