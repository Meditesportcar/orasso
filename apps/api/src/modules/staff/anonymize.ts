// Compte supprimé (anonymisé) : ce que le staff côté site et la boutique gardent de lui (lot 24). Appelé une fois par
// `accountService.anonymize`, dans sa transaction. Les demandes et invitations de staff tombent avec ses appartenances
// (déjà passées à « removed » par l'anonymisation). Reste l'historique des événements (main courante, contrôle des
// billets, compteur d'entrées) : il perd l'auteur ; une position d'alerte encore gardée est effacée.
import { eq } from "drizzle-orm";

import { incidents, staffAlerts, ticketScans, tickets, visitorEntries } from "../../db/schema";
import type { Tx } from "../../lib/tx";

export async function anonymizeStaffForDeletedAccount(tx: Tx, userId: string): Promise<void> {
  await tx.update(staffAlerts).set({ userId: null, lat: null, lng: null }).where(eq(staffAlerts.userId, userId));
  await tx.update(incidents).set({ reporterUserId: null }).where(eq(incidents.reporterUserId, userId));
  await tx.update(ticketScans).set({ staffUserId: null }).where(eq(ticketScans.staffUserId, userId));
  await tx.update(visitorEntries).set({ staffUserId: null }).where(eq(visitorEntries.staffUserId, userId));
  await tx.update(tickets).set({ usedBy: null, usedByDeviceId: null }).where(eq(tickets.usedBy, userId));
}
