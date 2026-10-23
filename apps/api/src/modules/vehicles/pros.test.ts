// Lot M5 : « Pour ta … » du Garage (`GET /me/vehicles/:id/pros`) : pros partenaires proches avec la remise à montrer,
// sponsorisé lié au véhicule (ciblé sur une de ses catégories, jamais un emplacement ouvert à tous), affichage compté
// une fois par jour, propriétaire seulement.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createPro, createVehicle, resetDb, seedReference, signUp, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { proDiscounts, profiles, sponsoredPlacements, vehicleCategories } from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;
beforeEach(async () => {
  await resetDb();
  useClock(new Date("2026-10-17T10:00:00Z"));
  ref = await seedReference();
});

async function owner(pseudo: string, grade: "rodage" | "route" | "sport" = "route") {
  const u = await signUp(pseudo);
  await db
    .update(profiles)
    .set({ departments: ["66"], grade })
    .where(eq(profiles.userId, u.id));
  const v = await createVehicle(u.id, ref);
  await db.insert(vehicleCategories).values({ vehicleId: v.id, categoryId: ref.jdm.id });
  return { u, v };
}

async function pro(name: string, at: { lat: number; lng: number } | null, discounts: Record<string, number>) {
  const p = await createPro((await signUp(`Pro_${name.replace(/\W+/g, "_")}`.slice(0, 20))).id, {
    name,
    lat: at?.lat ?? null,
    lng: at?.lng ?? null,
  });
  for (const [grade, percent] of Object.entries(discounts)) {
    await db.insert(proDiscounts).values({ proId: p.id, grade: grade as "route", percent });
  }
  return p;
}

const placement = (proId: string, over: Partial<typeof sponsoredPlacements.$inferInsert> = {}) =>
  db
    .insert(sponsoredPlacements)
    .values({
      proProfileId: proId,
      title: "Polish JDM",
      body: "-15 % sur le polish",
      linkUrl: "https://exemple.fr/offre",
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
      status: "active",
      ...over,
    })
    .returning()
    .then((r) => r[0]!);

describe("pros pour un véhicule", () => {
  it("les partenaires les plus proches, avec la remise du grade (ou celle du grade au-dessus)", async () => {
    const { u, v } = await owner("Garage_Pros");
    // Perpignan et Céret : dans le secteur ; Toulouse : trop loin ; sans remise : pas partenaire.
    await pro("Prepa Perpignan", { lat: 42.6987, lng: 2.8956 }, { route: 8, sport: 10 });
    await pro("Jantes Ceret", { lat: 42.4856, lng: 2.7486 }, { sport: 12 });
    await pro("Loin Toulouse", { lat: 43.6045, lng: 1.4442 }, { route: 20 });
    await pro("Sans Remise", { lat: 42.7, lng: 2.9 }, {});
    const r = await call(u, "GET", `/me/vehicles/${v.id}/pros`);
    expect(r.status).toBe(200);
    const names = r.json.pros.map((p: { name: string }) => p.name);
    expect(names).toEqual(expect.arrayContaining(["Prepa Perpignan", "Jantes Ceret"]));
    expect(names).not.toContain("Loin Toulouse");
    expect(names).not.toContain("Sans Remise");
    const byName = Object.fromEntries(r.json.pros.map((p: { name: string }) => [p.name, p]));
    expect(byName["Prepa Perpignan"].discount).toEqual({ percent: 8, from: null });
    expect(byName["Jantes Ceret"].discount).toEqual({ percent: 12, from: "sport" });
    expect(r.json.sponsored).toBeNull();
  });

  it("sponsorisé : seulement un emplacement ciblé sur une catégorie du véhicule, compté une fois par jour", async () => {
    const { u, v } = await owner("Garage_Sponso");
    const ouvert = await pro("Covering Ouvert", { lat: 42.7, lng: 2.9 }, { route: 5 });
    await placement(ouvert.id, { title: "Ouvert à tous" });
    expect((await call(u, "GET", `/me/vehicles/${v.id}/pros`)).json.sponsored).toBeNull();
    const cible = await pro("Detailing JDM", { lat: 42.7, lng: 2.9 }, { route: 10 });
    const p = await placement(cible.id, { categoryIds: [ref.jdm.id] });
    const r = await call(u, "GET", `/me/vehicles/${v.id}/pros`);
    expect(r.json.sponsored).toMatchObject({ id: p.id, pro: { name: "Detailing JDM" }, discount: { percent: 10 } });
    // Le pro du sponsorisé n'est pas répété dans la liste.
    expect(r.json.pros.map((x: { name: string }) => x.name)).not.toContain("Detailing JDM");
    await call(u, "GET", `/me/vehicles/${v.id}/pros`);
    const row = await db.query.sponsoredPlacements.findFirst({ where: eq(sponsoredPlacements.id, p.id) });
    expect(row?.impressions).toBe(1);
  });

  it("propriétaire seulement", async () => {
    const { v } = await owner("Garage_Proprio");
    const other = await signUp("Curieux_Pros");
    expect((await call(other, "GET", `/me/vehicles/${v.id}/pros`)).status).toBe(404);
    expect((await call(null, "GET", `/me/vehicles/${v.id}/pros`)).status).toBe(401);
  });
});
