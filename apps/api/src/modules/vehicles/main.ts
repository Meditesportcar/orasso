// Lot R4c (maquette R4.5) : le véhicule principal. Une seule colonne (`profiles.main_vehicle_id`), donc jamais deux
// principaux ; lue par `effectiveMainVehicleId` (un principal archivé ou supprimé cède sa place au plus ancien actif).
import { effectiveMainVehicleId } from "@orasso/shared";
import { and, asc, eq } from "drizzle-orm";

import { db } from "../../db/client";
import { profiles, vehicles } from "../../db/schema";
import { conflict, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";
import { vehiclesRepo } from "./repo";

/** Le principal effectif d'une personne, `null` sans véhicule actif. */
export async function mainVehicleIdOf(userId: string, chosenId: string | null, ex: Executor = db) {
  const active = await ex
    .select({ id: vehicles.id, status: vehicles.status })
    .from(vehicles)
    .where(and(eq(vehicles.ownerId, userId), eq(vehicles.status, "active")))
    .orderBy(asc(vehicles.createdAt));
  return effectiveMainVehicleId(active, chosenId);
}

export const mainVehicleService = {
  /** `PUT /me/main-vehicle` : seulement un véhicule actif à soi. */
  async set(v: Viewer, vehicleId: string): Promise<{ mainVehicleId: string }> {
    const row = await vehiclesRepo.byId(vehicleId);
    if (!row || row.ownerId !== v.user.id) throw notFound("Véhicule introuvable");
    if (row.status !== "active") {
      throw conflict("conflict", "Seul un véhicule de ton garage (actif) peut être ton véhicule principal.");
    }
    await db.update(profiles).set({ mainVehicleId: vehicleId }).where(eq(profiles.userId, v.user.id));
    return { mainVehicleId: vehicleId };
  },
};
