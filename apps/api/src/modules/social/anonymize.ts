// Compte supprimé (anonymisé) : tout ce que le module social garde de lui disparaît (lot 17, lot R6b). Appelé par
// `accountService.anonymize`, dans sa transaction.
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { friendships, notifications, profiles } from "../../db/schema";
import type { Tx } from "../../lib/tx";
import { followsService } from "./follows";

/**
 * Abonnements et demandes supprimés dans les deux sens, et notifications des autres qui le citent (demande,
 * acceptation, « va à… », « a ajouté… » : son pseudo, son avatar et le lien vers son profil sont dans `title`, `body` et
 * `data`) supprimées. Lot R6b : la table d'archive `friendships` (plus lue depuis D37) perd aussi ses lignes : ce sont des
 * données personnelles ; son compteur d'archive est remis à zéro.
 */
export async function anonymizeSocialForDeletedAccount(tx: Tx, userId: string) {
  await tx.delete(friendships).where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)));
  // Lot R4c : ses abonnements et ses abonnés disparaissent ; tour 2 : seules les alertes « … te suit » des personnes
  // qu'il suivait sont relues (pas tout le type).
  const followed = await followsService.removeAllFor(userId, tx);
  if (followed.length) {
    await tx
      .delete(notifications)
      .where(
        and(
          inArray(notifications.userId, followed),
          eq(notifications.type, "user_followed"),
          sql`${notifications.data} -> 'actorIds' @> jsonb_build_array(${userId}::text)`,
        ),
      );
  }
  await tx.update(profiles).set({ friendsCount: 0 }).where(eq(profiles.userId, userId));
  await tx.delete(notifications).where(sql`${notifications.data} -> 'actor' ->> 'userId' = ${userId}`);
}
