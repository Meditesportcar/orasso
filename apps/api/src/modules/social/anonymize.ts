// Compte supprimé (anonymisé) : tout ce que le module social garde de lui disparaît (lot 17). Appelé par
// `accountService.anonymize`, dans sa transaction.
import { eq, sql } from "drizzle-orm";

import { notifications, profiles } from "../../db/schema";
import type { Tx } from "../../lib/tx";
import { followsService } from "./follows";
import { socialRepo } from "./repo";

/**
 * Amitiés et demandes supprimées (compteurs des autres recalculés), son propre compteur remis à zéro, et notifications
 * des autres qui le citent (demande, acceptation, « va à… », « a ajouté… » : son pseudo, son avatar et le lien vers son
 * profil sont dans `title`, `body` et `data`) supprimées.
 */
export async function anonymizeSocialForDeletedAccount(tx: Tx, userId: string) {
  await socialRepo.removeAllFor(userId, tx);
  // Lot R4c : ses abonnements et ses abonnés disparaissent, et les alertes « … te suit » regroupées qui le citent.
  await followsService.removeAllFor(userId, tx);
  await tx
    .delete(notifications)
    .where(
      sql`${notifications.type} = 'user_followed' and ${notifications.data} -> 'actorIds' @> jsonb_build_array(${userId}::text)`,
    );
  await tx.update(profiles).set({ friendsCount: 0 }).where(eq(profiles.userId, userId));
  await tx.delete(notifications).where(sql`${notifications.data} -> 'actor' ->> 'userId' = ${userId}`);
}
