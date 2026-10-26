// Lot R5a, tour 2 (relectures Opus et Codex) : styles déjà sur une fiche et devenus refusés, synchronisation qui ne
// réécrit rien, liste blanche de Supercar sans seed, fiche certifiée, proposition acceptée avant la création,
// vérification sous verrou, noms uniques, rattachement d'un autre type, positions distinctes, pages de la file.
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createVehicle, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  categories,
  categoryCatalogSeen,
  categoryProposals,
  notifications,
  vehicleCategories,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
  vehicles,
} from "../../db/schema";
import { type CatalogStyle, styleCatalog } from "../../db/seed/style-catalog";
import { syncStyleCatalog } from "./style-sync";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 10, day: 26, hour: 15, minute: 0 }));
});

type Ref = { makeId: string; modelId: string; generationId: string };

async function make(name: string, country: string | null, models: [string, "car" | "moto" | "truck"][]) {
  const [m] = await db.insert(vehicleMakes).values({ name, slug: name.toLowerCase(), country }).returning();
  const ids: Record<string, Ref> = {};
  for (const [model, vehicleType] of models) {
    const [mo] = await db
      .insert(vehicleModels)
      .values({ makeId: m!.id, name: model, slug: model.toLowerCase(), vehicleType })
      .returning();
    const [g] = await db.insert(vehicleGenerations).values({ modelId: mo!.id, name: "Série 1" }).returning();
    ids[model] = { makeId: m!.id, modelId: mo!.id, generationId: g!.id };
  }
  return ids;
}

const bySlug = async (slug: string) => {
  const row = await db.query.categories.findFirst({ where: eq(categories.slug, slug) });
  if (!row) throw new Error(slug);
  return row;
};

const slugsOf = async (vehicleId: string) =>
  (
    await db
      .select({ slug: categories.slug })
      .from(vehicleCategories)
      .innerJoin(categories, eq(categories.id, vehicleCategories.categoryId))
      .where(eq(vehicleCategories.vehicleId, vehicleId))
  )
    .map((r) => r.slug)
    .sort();

const link = (vehicleId: string, categoryId: string) =>
  db.insert(vehicleCategories).values({ vehicleId, categoryId }).onConflictDoNothing();

describe("styles déjà sur une fiche", () => {
  it("« 4x4 » d'un camion (refusé pour le type) reste tant que le type et la marque ne changent pas", async () => {
    const scania = await make("Scania", "SE", [["R", "truck"]]);
    await syncStyleCatalog();
    const u = await signUp("Camion_66");
    const truck = await createVehicle(u.id, scania.R!, { vehicleType: "truck", year: 2008 });
    const fourByFour = await bySlug("4x4");
    const heavy = await bySlug("poids-lourd");
    await link(truck.id, fourByFour.id);
    expect((await call(u, "PATCH", `/me/vehicles/${truck.id}`, { description: "Tracteur de 2008" })).status).toBe(200);
    expect((await call(u, "PATCH", `/me/vehicles/${truck.id}`, { year: 2009 })).status).toBe(200);
    const both = await call(u, "PATCH", `/me/vehicles/${truck.id}`, { categoryIds: [fourByFour.id, heavy.id] });
    expect(both.status).toBe(200);
    expect(await slugsOf(truck.id)).toEqual(["4x4", "poids-lourd"]);
    // Un autre camion ne le reçoit pas.
    const other = await createVehicle(u.id, scania.R!, { vehicleType: "truck", year: 2008 });
    expect((await call(u, "PATCH", `/me/vehicles/${other.id}`, { categoryIds: [fourByFour.id] })).status).toBe(400);
  });

  it("une origine mise en pause reste sur la fiche, et changer la couleur ne fait pas perdre la certification", async () => {
    const honda = await make("Honda", "JP", [["Civic", "car"]]);
    await syncStyleCatalog();
    const u = await signUp("Civic_66");
    const civic = await createVehicle(u.id, honda.Civic!, { year: 1999 });
    const jdm = await bySlug("jdm");
    await link(civic.id, jdm.id);
    await db.update(vehicles).set({ certifiedAt: new Date() }).where(eq(vehicles.id, civic.id));
    await db.update(categories).set({ active: false }).where(eq(categories.id, jdm.id));
    const res = await call(u, "PATCH", `/me/vehicles/${civic.id}`, { color: "Rouge" });
    expect(res.status).toBe(200);
    expect(res.json.categories).toEqual([expect.objectContaining({ slug: "jdm", family: "pays", paused: true })]);
    expect(res.json.certified).toBe(true);
    // Renvoyée telle quelle avec un autre choix, elle reste permise.
    const sport = await bySlug("sportive");
    expect((await call(u, "PATCH", `/me/vehicles/${civic.id}`, { categoryIds: [jdm.id, sport.id] })).status).toBe(200);
  });

  it("les styles en pause ne sont rendus qu'avec ?paused=1, marqués", async () => {
    await syncStyleCatalog();
    const plain = (await call(null, "GET", "/vehicle-reference/categories")).json as { slug: string }[];
    expect(plain.some((c) => c.slug === "moto")).toBe(false);
    const all = (await call(null, "GET", "/vehicle-reference/categories?paused=1")).json as {
      slug: string;
      paused?: boolean;
    }[];
    expect(all.find((c) => c.slug === "moto")).toMatchObject({ paused: true });
    expect(all.find((c) => c.slug === "sportive")?.paused).toBeUndefined();
  });
});

describe("synchronisation du catalogue", () => {
  it("un style créé par l'admin puis entré au catalogue n'est jamais réécrit ni réactivé", async () => {
    await syncStyleCatalog();
    await db.insert(categories).values([
      { slug: "bobber", label: "Bobber perso", labelKey: "bobberperso", active: false, icon: "spark" },
      { slug: "rat-look-admin", label: "Rat look", labelKey: "ratlook" },
    ]);
    const catalog: CatalogStyle[] = [
      ...styleCatalog,
      { slug: "bobber", label: "Bobber", family: "genre", icon: "moto", types: ["moto"] },
      { slug: "rat-look", label: "Rat look", family: "preparation", icon: "layers", types: ["car"] },
    ];
    expect(await syncStyleCatalog(catalog)).toEqual({ inserted: 0, adopted: 0 });
    expect(await bySlug("bobber")).toMatchObject({ label: "Bobber perso", active: false, icon: "spark" });
    expect(await db.query.categories.findFirst({ where: eq(categories.slug, "rat-look") })).toBeUndefined();
    const seen = (await db.select().from(categoryCatalogSeen)).map((r) => r.slug);
    expect(seen).toEqual(expect.arrayContaining(["bobber", "rat-look"]));
  });

  it("base neuve sans seed : la liste blanche de Supercar est posée, complétée par une marque arrivée ensuite", async () => {
    const peugeot = await make("Peugeot", "FR", [["208", "car"]]);
    const ferrari = await make("Ferrari", "IT", [["F40", "car"]]);
    await syncStyleCatalog();
    const supercar = await bySlug("supercar");
    expect(supercar.makeMode).toBe("whitelist");
    const u = await signUp("Super_66");
    const vehicle = (ref: Ref, plate: string) => ({ vehicleType: "car", ...ref, year: 1990, plate });
    const refused = await call(u, "POST", "/me/vehicles", {
      ...vehicle(peugeot["208"]!, "pe-208-aa"),
      categoryIds: [supercar.id],
    });
    expect(refused.status).toBe(400);
    const accepted = await call(u, "POST", "/me/vehicles", {
      ...vehicle(ferrari.F40!, "fe-040-aa"),
      categoryIds: [supercar.id],
    });
    expect(accepted.status).toBe(201);
    const lambo = await make("Lamborghini", "IT", [["Countach", "car"]]);
    await syncStyleCatalog();
    const later = await call(u, "POST", "/me/vehicles", {
      ...vehicle(lambo.Countach!, "la-001-aa"),
      categoryIds: [supercar.id],
    });
    expect(later.status).toBe(201);
  });
});

describe("propositions et administration", () => {
  let admin: TestUser;
  beforeEach(async () => {
    admin = await signUp("Damien_Admin", { twoFactor: true, role: "super_admin" });
  });

  const groupOf = async (key: string) =>
    ((await call(admin, "GET", "/admin/category-proposals")).json.items as { key: string; version: string }[]).find(
      (g) => g.key === key,
    );

  it("une fiche certifiée ou en demande de certification n'est pas touchée ; la notification le dit", async () => {
    const honda = await make("Honda", "JP", [["CBR", "moto"]]);
    await syncStyleCatalog();
    const u = await signUp("Certifie_66");
    const v = await createVehicle(u.id, honda.CBR!, { vehicleType: "moto", year: 2019, certifiedAt: new Date() });
    await call(u, "POST", "/categories/proposals", { label: "Bobber", vehicleType: "moto", vehicleId: v.id });
    const g = await groupOf("bobber");
    const res = await call(admin, "POST", "/admin/category-proposals/bobber/accept", {
      version: g!.version,
      label: "Bobber",
      family: "genre",
      icon: "moto",
    });
    expect(res.status).toBe(200);
    expect(res.json.applied).toBe(0);
    expect(await slugsOf(v.id)).toEqual([]);
    const [note] = await db.select().from(notifications).where(eq(notifications.userId, u.id));
    expect(note?.body).toContain("est certifiée ou en cours de certification : ajoute-le toi-même depuis ta fiche.");
  });

  it("proposition → acceptation → création : le style retenu est posé sur le véhicule créé", async () => {
    const honda = await make("Honda", "JP", [["CBR", "moto"]]);
    await syncStyleCatalog();
    const u = await signUp("Ajout_66");
    const p = await call(u, "POST", "/categories/proposals", { label: "Bobber", vehicleType: "moto" });
    const g = await groupOf("bobber");
    expect(
      (
        await call(admin, "POST", "/admin/category-proposals/bobber/accept", {
          version: g!.version,
          label: "Bobber",
          family: "genre",
          icon: "moto",
        })
      ).status,
    ).toBe(200);
    const created = await call(u, "POST", "/me/vehicles", {
      vehicleType: "moto",
      ...honda.CBR,
      year: 2019,
      plate: "mo-555-to",
      styleProposalIds: [p.json.id],
    });
    expect(created.status).toBe(201);
    expect(await slugsOf(created.json.id)).toEqual(["bobber"]);
    const row = await db.query.categoryProposals.findFirst({ where: eq(categoryProposals.id, p.json.id) });
    expect(row).toMatchObject({ vehicleId: created.json.id, status: "accepted" });
  });

  it("une modification de l'année relit, sous verrou, un style posé entre-temps par l'équipe", async () => {
    const honda = await make("Honda", "JP", [["CBR", "moto"]]);
    await syncStyleCatalog();
    const [old] = await db
      .insert(categories)
      .values({ slug: "vintage-moto", label: "Vintage", labelKey: "vintage", minVehicleAge: 5, family: "epoque" })
      .returning();
    const u = await signUp("Annee_66");
    const v = await createVehicle(u.id, honda.CBR!, { vehicleType: "moto", year: 2019 });
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select id from vehicles where id = $1 for update", [v.id]);
      const patch = call(u, "PATCH", `/me/vehicles/${v.id}`, { year: 2025 });
      await new Promise((r) => setTimeout(r, 400));
      await client.query("insert into vehicle_categories (vehicle_id, category_id) values ($1, $2)", [v.id, old!.id]);
      await client.query("commit");
      const res = await patch;
      expect(res.status).toBe(400);
      expect(res.json.error.message).toContain("Vintage");
    } finally {
      client.release();
    }
    const [row] = await db.select({ year: vehicles.year }).from(vehicles).where(eq(vehicles.id, v.id));
    expect(row?.year).toBe(2019);
  });

  it("noms uniques sans accents, casse ni apostrophe typographique : création, renommage, acceptation", async () => {
    await syncStyleCatalog();
    const create = (label: string, vehicleType = "moto") =>
      call(admin, "POST", "/admin/categories", { label, family: "preparation", icon: "drop", vehicleType });
    expect((await create("D’origine")).status).toBe(409);
    expect((await create("d'ORIGINE", "truck")).status).toBe(409);
    expect((await db.select().from(categories).where(eq(categories.labelKey, "dorigine"))).length).toBe(1);
    const bobber = await create("Bobber");
    expect(bobber.status).toBe(201);
    const renamed = await call(admin, "PATCH", `/admin/categories/${bobber.json.id}`, { label: "D’Origine" });
    expect(renamed.status).toBe(409);
    expect(renamed.json.error.message).toContain("D'origine");
    // Acceptation sous un nom déjà pris.
    const u = await signUp("Nom_66");
    await call(u, "POST", "/categories/proposals", { label: "Stock moto", vehicleType: "moto" });
    const g = await groupOf("stockmoto");
    const taken = await call(admin, "POST", "/admin/category-proposals/stockmoto/accept", {
      version: g!.version,
      label: "D’origine",
      family: "preparation",
      icon: "drop",
    });
    expect(taken.status).toBe(409);
    // Le libellé au masculin compte pour une proposition (« Ancien » d'un camion).
    const ancien = await call(u, "POST", "/categories/proposals", { label: "Ancien", vehicleType: "truck" });
    expect(ancien.status).toBe(409);
    expect(ancien.json.error.message).toContain("« Ancien »");
  });

  it("rattacher à un style d'un autre type : refusé avec la raison", async () => {
    await syncStyleCatalog();
    const u = await signUp("Cabrio_66");
    await call(u, "POST", "/categories/proposals", { label: "Décapotable", vehicleType: "moto" });
    const g = await groupOf("decapotable");
    const res = await call(admin, "POST", "/admin/category-proposals/decapotable/merge", {
      version: g!.version,
      categoryId: (await bySlug("cabriolet")).id,
    });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toBe("« Cabriolet » n'est pas proposé aux motos : ajoute d'abord le type au style.");
  });

  it("deux ajouts simultanés reçoivent des positions distinctes", async () => {
    await syncStyleCatalog();
    const [a, b] = await Promise.all(
      ["Bobber", "Chopper"].map((label) =>
        call(admin, "POST", "/admin/categories", { label, family: "genre", icon: "moto", vehicleType: "moto" }),
      ),
    );
    expect([a?.status, b?.status]).toEqual([201, 201]);
    const rows = await db
      .select({ position: categories.position })
      .from(categories)
      .where(and(eq(categories.family, "genre")));
    const positions = rows.map((r) => r.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("la file se lit par pages de 50 groupes", async () => {
    const u = await signUp("Pages_66");
    await db.insert(categoryProposals).values(
      Array.from({ length: 55 }, (_, i) => ({
        authorId: u.id,
        label: `Style ${i}`,
        key: `style${i}`,
        vehicleType: "car" as const,
      })),
    );
    const first = await call(admin, "GET", "/admin/category-proposals");
    expect(first.json.items).toHaveLength(50);
    expect(first.json.total).toBe(55);
    expect(first.json.nextCursor).toBe("50");
    const second = await call(admin, "GET", "/admin/category-proposals?cursor=50");
    expect(second.json.items).toHaveLength(5);
    expect(second.json.nextCursor).toBeNull();
  });
});
