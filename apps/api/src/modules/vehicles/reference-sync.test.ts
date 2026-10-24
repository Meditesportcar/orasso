// Lot R3c : arrivée idempotente du référentiel dans une base (neuve ou existante), sans toucher aux ajouts de l'équipe.
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { vehicleGenerations, vehicleMakes, vehicleModels } from "../../db/schema";
import { vehicleCatalog } from "../../db/seed/vehicle-catalog";
import { syncVehicleReference } from "./reference-sync";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
});

const totals = async () => {
  const [[makes], [models], [generations]] = await Promise.all([
    db.select({ n: count() }).from(vehicleMakes),
    db.select({ n: count() }).from(vehicleModels),
    db.select({ n: count() }).from(vehicleGenerations),
  ]);
  return { makes: makes?.n ?? 0, models: models?.n ?? 0, generations: generations?.n ?? 0 };
};

const catalogModels = vehicleCatalog.reduce((n, m) => n + m.models.length, 0);
const catalogGenerations = vehicleCatalog.reduce(
  (n, m) => n + m.models.reduce((k, x) => k + x.generations.length, 0),
  0,
);

describe("synchronisation du référentiel (lot R3c)", () => {
  it("base neuve : toute la liste, plus « Autre » à chaque niveau ; relancée, elle n'ajoute rien", async () => {
    const first = await syncVehicleReference();
    const makes = vehicleCatalog.length + 1;
    const models = catalogModels + makes; // un « Autre » par marque
    const generations = catalogGenerations + models; // un « Autre » par modèle
    expect(first).toMatchObject({ makes, models, generations });
    expect(await totals()).toEqual({ makes, models, generations });

    const other = await db.query.vehicleMakes.findFirst({ where: eq(vehicleMakes.isOther, true) });
    expect(other?.name).toBe("Autre");
    const peugeot = await db.query.vehicleMakes.findFirst({ where: eq(vehicleMakes.slug, "peugeot") });
    const p207 = await db.query.vehicleModels.findFirst({
      where: and(eq(vehicleModels.makeId, peugeot!.id), eq(vehicleModels.slug, "207")),
    });
    const p207gens = await db.query.vehicleGenerations.findMany({ where: eq(vehicleGenerations.modelId, p207!.id) });
    expect(p207gens.map((g) => g.name).sort()).toEqual(["Autre", "Phase 1", "Phase 2", "RC"]);
    const defender = await db.query.vehicleModels.findFirst({ where: eq(vehicleModels.name, "Defender") });
    expect(defender?.offroad).toBe(true);

    expect(await syncVehicleReference()).toEqual({ makes: 0, models: 0, generations: 0, offroad: 0 });
    expect(await totals()).toEqual({ makes, models, generations });
  });

  it("base existante : ajoute ce qui manque sans toucher aux noms, aux années ni aux ajouts de l'équipe", async () => {
    // Base d'avant le lot : Peugeot et ses 205 (années corrigées par l'équipe), une marque ajoutée dans l'admin.
    const [peugeot] = await db
      .insert(vehicleMakes)
      .values({ name: "Peugeot", slug: "peugeot", country: "FR" })
      .returning();
    const [p205] = await db
      .insert(vehicleModels)
      .values({ makeId: peugeot!.id, name: "205", slug: "205", vehicleType: "car" })
      .returning();
    await db.insert(vehicleGenerations).values([
      { modelId: p205!.id, name: "Phase 1", yearFrom: 1983, yearTo: 1988 },
      { modelId: p205!.id, name: "Ma série spéciale", yearFrom: 1990, yearTo: 1991 },
    ]);
    const [team] = await db
      .insert(vehicleMakes)
      .values({ name: "Atelier du Roussillon", slug: "atelier-du-roussillon", country: "FR" })
      .returning();
    await db.insert(vehicleModels).values({ makeId: team!.id, name: "Spéciale", slug: "speciale", vehicleType: "car" });
    const [defenderMake] = await db
      .insert(vehicleMakes)
      .values({ name: "Land Rover", slug: "land-rover", country: "GB" })
      .returning();
    await db
      .insert(vehicleModels)
      .values({ makeId: defenderMake!.id, name: "Defender", slug: "defender", vehicleType: "car" });

    const added = await syncVehicleReference();
    expect(added.offroad).toBe(1);

    const gens = await db.query.vehicleGenerations.findMany({ where: eq(vehicleGenerations.modelId, p205!.id) });
    const byName = new Map(gens.map((g) => [g.name, g]));
    expect(byName.get("Phase 1")).toMatchObject({ yearFrom: 1983, yearTo: 1988 }); // non écrasée
    expect(byName.has("Ma série spéciale")).toBe(true);
    expect(byName.has("Phase 2")).toBe(true);
    expect(byName.has("Autre")).toBe(true);
    expect(
      await db.query.vehicleMakes.findFirst({ where: eq(vehicleMakes.slug, "atelier-du-roussillon") }),
    ).toMatchObject({
      name: "Atelier du Roussillon",
    });
    const teamModels = await db.query.vehicleModels.findMany({ where: eq(vehicleModels.makeId, team!.id) });
    expect(teamModels.map((m) => m.name).sort()).toEqual(["Autre", "Spéciale"]);
    const peugeotModels = await db.query.vehicleModels.findMany({ where: eq(vehicleModels.makeId, peugeot!.id) });
    expect(peugeotModels.map((m) => m.name)).toEqual(expect.arrayContaining(["207", "308", "3008", "Autre"]));

    expect(await syncVehicleReference()).toEqual({ makes: 0, models: 0, generations: 0, offroad: 0 });
  });
});
