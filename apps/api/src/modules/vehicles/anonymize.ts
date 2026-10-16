// Suppression d'un compte (lot 31) : ce que le garage garde de la personne. Appelée une seule fois par la transaction
// d'anonymisation de `modules/account/service.ts`, après l'effacement des plaques et des photos des véhicules.
import { and, eq, inArray } from "drizzle-orm";

import { certificationRequests, plateTransferRequests, vehicles } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Tx } from "../../lib/tx";
import { plateTransferService } from "./plate-transfer";

export async function anonymizeGarageForDeletedAccount(tx: Tx, userId: string): Promise<void> {
  const owned = await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.ownerId, userId));
  const ids = owned.map((o) => o.id);
  // Demandes de certification : la fiche examinée (description, préparation, photos) et le message sont personnels.
  await tx.delete(certificationRequests).where(eq(certificationRequests.userId, userId));
  if (ids.length) {
    await tx
      .update(vehicles)
      .set({ certifiedAt: null, certifiedLostReason: null, statusNote: null })
      .where(inArray(vehicles.id, ids));
  }
  // Demandes de transfert que la personne avait faites : closes (ses véhicules sont vendus et sans plaque).
  await tx
    .update(plateTransferRequests)
    .set({ status: "refused", decidedAt: now(), note: "Compte supprimé" })
    .where(
      and(eq(plateTransferRequests.toUserId, userId), inArray(plateTransferRequests.status, ["pending", "arbitrated"])),
    );
  // Plaques libérées : les demandes ouvertes d'autres comptes sur ces véhicules suivent la règle commune.
  for (const id of ids) await plateTransferService.plateReleased(tx, id);
}
