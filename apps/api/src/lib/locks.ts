import { sql } from "drizzle-orm";

import type { Tx } from "./tx";

/**
 * Verrou consultatif des pointages d'un événement (jusqu'à la fin de la transaction) : sérialise les lots des
 * appareils, les pointages en ligne et le règlement de J+2 (qui ne doit pas croiser une entrée en cours d'écriture).
 * Toujours pris avant tout verrou de ligne de l'événement (les insertions d'entrées verrouillent l'événement en
 * partage par clé étrangère).
 */
export async function lockEventCheckins(tx: Tx, eventId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`checkins:${eventId}`}, 0))`);
}
