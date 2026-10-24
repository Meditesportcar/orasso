// Lot R3c : arrivée idempotente du référentiel dans une base (neuve ou existante), sans toucher aux ajouts de l'équipe ;
// tour 2 : une ligne supprimée ou renommée dans l'admin ne revient pas, transaction et verrou, passe à blanc.
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, resetDb, signUp } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { vehicleGenerations, vehicleMakes, vehicleModels, vehicleReferenceSeen } from "../../db/schema";
import { parseReference, vehicleCatalog } from "../../db/seed/vehicle-catalog";
import { syncVehicleReference } from "./reference-sync";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
});

const totals = async () => {
  const [[makes], [models], [generations], [seen]] = await Promise.all([
    db.select({ n: count() }).from(vehicleMakes),
    db.select({ n: count() }).from(vehicleModels),
    db.select({ n: count() }).from(vehicleGenerations),
    db.select({ n: count() }).from(vehicleReferenceSeen),
  ]);
  return { makes: makes?.n ?? 0, models: models?.n ?? 0, generations: generations?.n ?? 0, seen: seen?.n ?? 0 };
};
const nothing = { makes: 0, models: 0, generations: 0, offroad: 0, added: [] };

const catalogModels = vehicleCatalog.reduce((n, m) => n + m.models.length, 0);
const catalogGenerations = vehicleCatalog.reduce(
  (n, m) => n + m.models.reduce((k, x) => k + x.generations.length, 0),
  0,
);
const expected = () => {
  const makes = vehicleCatalog.length + 1;
  const models = catalogModels + makes; // un « Autre » par marque
  const generations = catalogGenerations + models; // un « Autre » par modèle
  return { makes, models, generations, seen: vehicleCatalog.length + catalogModels + catalogGenerations };
};

const makeBySlug = (slug: string) => db.query.vehicleMakes.findFirst({ where: eq(vehicleMakes.slug, slug) });
const modelOf = async (makeSlug: string, slug: string) => {
  const make = await makeBySlug(makeSlug);
  return make
    ? db.query.vehicleModels.findFirst({ where: and(eq(vehicleModels.makeId, make.id), eq(vehicleModels.slug, slug)) })
    : undefined;
};
const gensOf = async (modelId: string) =>
  (await db.query.vehicleGenerations.findMany({ where: eq(vehicleGenerations.modelId, modelId) })).map((g) => g.name);

describe("synchronisation du référentiel (lot R3c)", () => {
  it("base neuve : toute la liste, plus « Autre » à chaque niveau ; relancée, elle n'ajoute rien", async () => {
    const { seen, ...rows } = expected();
    const first = await syncVehicleReference();
    expect(first).toMatchObject(rows);
    expect(first.added).toContain("Peugeot 207 Phase 1");
    expect(await totals()).toEqual({ ...rows, seen });

    expect((await makeBySlug("autre"))?.isOther).toBe(true);
    const p207 = await modelOf("peugeot", "207");
    expect((await gensOf(p207!.id)).sort()).toEqual(["Autre", "Phase 1", "Phase 2", "RC"]);
    expect((await modelOf("land-rover", "defender"))?.offroad).toBe(true);

    expect(await syncVehicleReference()).toMatchObject(nothing);
    expect(await totals()).toEqual({ ...rows, seen });
  });

  it("base existante : ajoute ce qui manque sans toucher aux noms, aux années ni aux ajouts de l'équipe", async () => {
    const [peugeot] = await db
      .insert(vehicleMakes)
      .values({ name: "Peugeot", slug: "peugeot", country: "FR" })
      .returning();
    const [p205] = await db
      .insert(vehicleModels)
      .values({ makeId: peugeot!.id, name: "205", slug: "205", vehicleType: "car" })
      .returning();
    await db.insert(vehicleGenerations).values([
      { modelId: p205!.id, name: "phase  1", yearFrom: 1983, yearTo: 1988 }, // casse corrigée par l'équipe
      { modelId: p205!.id, name: "Ma série spéciale", yearFrom: 1990, yearTo: 1991 },
    ]);
    const [team] = await db
      .insert(vehicleMakes)
      .values({ name: "Atelier du Roussillon", slug: "atelier-du-roussillon", country: "FR" })
      .returning();
    await db.insert(vehicleModels).values({ makeId: team!.id, name: "Spéciale", slug: "speciale", vehicleType: "car" });
    const [lr] = await db
      .insert(vehicleMakes)
      .values({ name: "Land Rover", slug: "land-rover", country: "GB" })
      .returning();
    await db.insert(vehicleModels).values({ makeId: lr!.id, name: "Defender", slug: "defender", vehicleType: "car" });

    const added = await syncVehicleReference();
    expect(added.offroad).toBe(1);
    const names = await gensOf(p205!.id);
    expect(names).toEqual(expect.arrayContaining(["phase  1", "Ma série spéciale", "Phase 2", "Autre"]));
    expect(names).not.toContain("Phase 1"); // pas de doublon de casse
    expect((await makeBySlug("atelier-du-roussillon"))?.name).toBe("Atelier du Roussillon");
    const teamModels = await db.query.vehicleModels.findMany({ where: eq(vehicleModels.makeId, team!.id) });
    expect(teamModels.map((m) => m.name).sort()).toEqual(["Autre", "Spéciale"]);
    expect(await syncVehicleReference()).toMatchObject(nothing);
  });

  it("une suppression ou un renommage dans l'admin ne revient pas ; une ligne ajoutée au fichier arrive", async () => {
    await syncVehicleReference();
    const admin = await signUp("Damien_Admin", { twoFactor: true, role: "super_admin" });

    // Suppression d'un modèle (et de ses générations), d'une génération, d'une marque.
    const p207 = await modelOf("peugeot", "207");
    expect((await call(admin, "DELETE", `/admin/vehicle-reference/models/${p207!.id}`)).status).toBe(204);
    const p308 = await modelOf("peugeot", "308");
    const t9 = await db.query.vehicleGenerations.findFirst({
      where: and(eq(vehicleGenerations.modelId, p308!.id), eq(vehicleGenerations.name, "II (T9)")),
    });
    expect((await call(admin, "DELETE", `/admin/vehicle-reference/generations/${t9!.id}`)).status).toBe(204);
    const trabant = await makeBySlug("trabant");
    expect((await call(admin, "DELETE", `/admin/vehicle-reference/makes/${trabant!.id}`)).status).toBe(204);

    // Renommages : marque, modèle, génération (casse comprise).
    const zastava = await makeBySlug("zastava");
    expect((await call(admin, "PATCH", `/admin/vehicle-reference/makes/${zastava!.id}`, { name: "Yugo" })).status).toBe(
      200,
    );
    const p405 = await modelOf("peugeot", "405");
    expect(
      (await call(admin, "PATCH", `/admin/vehicle-reference/models/${p405!.id}`, { name: "405 Mi16" })).status,
    ).toBe(200);
    const p106 = await modelOf("peugeot", "106");
    const ph1 = await db.query.vehicleGenerations.findFirst({
      where: and(eq(vehicleGenerations.modelId, p106!.id), eq(vehicleGenerations.name, "Phase 1")),
    });
    expect(
      (await call(admin, "PATCH", `/admin/vehicle-reference/generations/${ph1!.id}`, { name: "phase 1 (1991)" }))
        .status,
    ).toBe(200);

    expect(await syncVehicleReference()).toMatchObject(nothing);
    expect(await modelOf("peugeot", "207")).toBeUndefined();
    expect(await gensOf(p308!.id)).not.toContain("II (T9)");
    expect(await makeBySlug("trabant")).toBeUndefined();
    expect(await makeBySlug("zastava")).toBeUndefined();
    expect(await modelOf("peugeot", "405")).toBeUndefined();
    expect(await gensOf(p106!.id)).not.toContain("Phase 1");

    // Une ligne nouvelle du fichier arrive, même dans une marque déjà vue.
    const extra = parseReference(
      "@ Peugeot | FR\n208 : Hybride 2026-\n9X8 : 2022-\n@ Nouvelle Marque | FR\nUn : 2024-",
    );
    const catalog = [...vehicleCatalog, ...extra];
    const r = await syncVehicleReference({ catalog });
    expect(r.added.sort()).toEqual(
      [
        "Nouvelle Marque",
        "Nouvelle Marque Un",
        "Peugeot 208 Hybride",
        "Peugeot 9X8",
        "Peugeot 9X8 9X8",
        "Nouvelle Marque Un Un",
      ].sort(),
    );
    expect(await syncVehicleReference({ catalog })).toMatchObject(nothing);
  });

  it("passe à blanc : dit ce qui serait ajouté, n'écrit rien", async () => {
    const r = await syncVehicleReference({ dryRun: true });
    expect(r).toMatchObject({ dryRun: true, makes: expected().makes });
    expect(r.added.length).toBeGreaterThan(4000);
    expect(await totals()).toEqual({ makes: 0, models: 0, generations: 0, seen: 0 });
  });

  it("deux synchronisations simultanées : une seule ajoute, la base est complète", async () => {
    const [a, b] = await Promise.all([syncVehicleReference(), syncVehicleReference()]);
    expect([a.makes, b.makes].sort((x, y) => x - y)).toEqual([0, expected().makes]);
    expect(await totals()).toEqual(expected());
  });

  it("un échec au milieu n'écrit rien (transaction annulée)", async () => {
    const broken = [...vehicleCatalog, ...parseReference("@ Casse | FR\nX : 2001-2002")];
    // Une année hors des bornes de la colonne fait échouer l'écriture des générations, après marques et modèles.
    const generation = broken.at(-1)?.models[0]?.generations[0];
    if (generation) generation.yearFrom = 99_999;
    await expect(syncVehicleReference({ catalog: broken })).rejects.toThrow();
    expect(await totals()).toEqual({ makes: 0, models: 0, generations: 0, seen: 0 });
  });
});
