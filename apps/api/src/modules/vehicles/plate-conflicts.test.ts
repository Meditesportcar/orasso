// Lot C7 : l'équipe Orasso résout les conflits de plaque laissés par la forme unique (lot M2) : liste, application de
// la forme unique quand plus personne ne la porte, classement, journal de l'équipe ; réservé au super admin.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createVehicle, resetDb, seedReference, signUp } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { adminAuditLog, plateNormalizationConflicts, vehicles } from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
});

/** Comme après la migration 0052 : « GA-662-KS 66 » garde GA662KS66, GA662KS est déjà actif chez un autre compte. */
async function collision() {
  const a = await signUp("Conf_01");
  const b = await signUp("Conf_02");
  const dup = await createVehicle(a.id, ref, { plate: "GA-662-KS 66", plateNormalized: "GA662KS66" });
  const holder = await createVehicle(b.id, ref, { plate: "GA-662-KS", plateNormalized: "GA662KS" });
  const [row] = await db
    .insert(plateNormalizationConflicts)
    .values({ vehicleId: dup.id, keptNormalized: "GA662KS66", wantedNormalized: "GA662KS" })
    .returning();
  return { a, b, dup, holder, conflictId: row!.id };
}

describe("conflits de plaque (équipe Orasso)", () => {
  it("réservé au super admin ; la file dit qui porte déjà la forme unique", async () => {
    const { a, dup } = await collision();
    const admin = await signUp("Admin_C7", { twoFactor: true, role: "super_admin" });
    expect((await call(a, "GET", "/admin/plate-conflicts")).status).toBe(403);
    const list = await call(admin, "GET", "/admin/plate-conflicts");
    expect(list.status).toBe(200);
    expect(list.json).toMatchObject([
      {
        kind: "vehicle",
        vehicleId: dup.id,
        keptNormalized: "GA662KS66",
        wantedNormalized: "GA662KS",
        ownerPseudo: "Conf_01",
        holder: { pseudo: "Conf_02" },
      },
    ]);
  });

  it("appliquer : refusé tant qu'un autre véhicule actif porte la plaque, accepté une fois qu'il l'a quittée", async () => {
    const { dup, holder, conflictId } = await collision();
    const admin = await signUp("Admin_C7b", { twoFactor: true, role: "super_admin" });
    const refused = await call(admin, "POST", `/admin/plate-conflicts/${conflictId}/resolve`, { action: "apply" });
    expect(refused.status).toBe(409);
    await db.update(vehicles).set({ status: "sold" }).where(eq(vehicles.id, holder.id));
    const ok = await call(admin, "POST", `/admin/plate-conflicts/${conflictId}/resolve`, {
      action: "apply",
      note: "Vendue par son ancien propriétaire",
    });
    expect(ok.status).toBe(200);
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, dup.id) }))?.plateNormalized).toBe("GA662KS");
    expect(await db.select().from(plateNormalizationConflicts)).toEqual([]);
    const audit = await db
      .select()
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.action, "plate_conflict.apply"), eq(adminAuditLog.targetId, dup.id)));
    expect(audit).toHaveLength(1);
    expect(
      (await call(admin, "POST", `/admin/plate-conflicts/${conflictId}/resolve`, { action: "apply" })).status,
    ).toBe(404);
  });

  it("classer : la ligne disparaît, la plaque garde son ancienne forme", async () => {
    const { dup, conflictId } = await collision();
    const admin = await signUp("Admin_C7c", { twoFactor: true, role: "super_admin" });
    const res = await call(admin, "POST", `/admin/plate-conflicts/${conflictId}/resolve`, { action: "dismiss" });
    expect(res.status).toBe(200);
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, dup.id) }))?.plateNormalized).toBe("GA662KS66");
    expect(await db.select().from(plateNormalizationConflicts)).toEqual([]);
  });
});
