// « Il manque un style ? Propose-le » (lot R5a, maquette R5.2) : un membre propose un style au catalogue, pour un type de
// véhicule et, s'il le donne, pour son véhicule (le style y sera posé s'il est retenu et si les règles l'acceptent).
// Une proposition en attente par auteur, nom normalisé et type : la même proposition renvoyée ne crée pas de doublon.
import {
  type CategoryProposalInput,
  type CategoryProposalResult,
  categoryLabelFor,
  styleFitsType,
  styleKey,
  type VehicleType,
} from "@orasso/shared";
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client";
import { categories, categoryProposals, vehicles } from "../../db/schema";
import { conflict, notFound, validation } from "../../lib/errors";
import type { Viewer } from "../../lib/session";

const result = (r: {
  id: string;
  label: string;
  status: CategoryProposalResult["status"];
}): CategoryProposalResult => ({
  id: r.id,
  label: r.label,
  status: r.status,
});

const isUnique = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

export const styleProposalsService = {
  async propose(v: Viewer, input: CategoryProposalInput): Promise<CategoryProposalResult> {
    let vehicleType: VehicleType = input.vehicleType;
    if (input.vehicleId) {
      const vehicle = await db.query.vehicles.findFirst({ where: eq(vehicles.id, input.vehicleId) });
      // Le véhicule d'un autre compte répond comme un véhicule inconnu.
      if (!vehicle || vehicle.ownerId !== v.user.id) throw notFound("Véhicule introuvable");
      vehicleType = vehicle.vehicleType;
    }
    const key = styleKey(input.label);
    if (key.length < 2) throw validation("Le nom du style fait 2 à 24 caractères", { field: "label" });
    // Un style actif de même nom pour ce type existe déjà : rien à proposer, il est dans la liste.
    const same = (await db.select().from(categories).where(eq(categories.active, true))).find(
      // Tour 2 : le libellé au masculin compte aussi (« Ancien » pour « Ancienne »).
      (c) =>
        (styleKey(c.label) === key || (c.labelM !== null && styleKey(c.labelM) === key)) &&
        c.family !== "pays" &&
        styleFitsType(c.allowedVehicleTypes, vehicleType),
    );
    if (same) {
      throw conflict("conflict", `« ${categoryLabelFor(same, vehicleType)} » existe déjà : choisis-le dans la liste.`);
    }
    const pending = () =>
      db.query.categoryProposals.findFirst({
        where: and(
          eq(categoryProposals.authorId, v.user.id),
          eq(categoryProposals.key, key),
          eq(categoryProposals.vehicleType, vehicleType),
          eq(categoryProposals.status, "pending"),
        ),
      });
    const existing = await pending();
    if (existing) {
      // Déjà proposé : le véhicule donné cette fois est gardé s'il n'y en avait pas.
      if (input.vehicleId && !existing.vehicleId) {
        await db
          .update(categoryProposals)
          .set({ vehicleId: input.vehicleId })
          .where(eq(categoryProposals.id, existing.id));
      }
      return result(existing);
    }
    try {
      const [row] = await db
        .insert(categoryProposals)
        .values({ authorId: v.user.id, vehicleId: input.vehicleId ?? null, label: input.label, key, vehicleType })
        .returning();
      if (!row) throw new Error("Proposition non enregistrée");
      return result(row);
    } catch (error) {
      // Deux envois simultanés : le second renvoie la proposition du premier.
      if (isUnique(error)) {
        const again = await pending();
        if (again) return result(again);
      }
      throw error;
    }
  },
};
