// Compte supprimé (anonymisé) : ce que la communication garde de lui (lot 20). Appelé une fois par
// `accountService.anonymize`, dans sa transaction. Même règle que la messagerie (lot 18) pour ce qui est écrit au nom
// de la structure : le texte reste (historique de la structure, fil public, messages groupés), l'auteur disparaît. Ses
// messages personnels dans les discussions du staff sont traités par la messagerie (« Message supprimé »).
import { eq } from "drizzle-orm";

import { eventAnnouncements, groupMessages } from "../../db/schema";
import type { Tx } from "../../lib/tx";

export async function anonymizeCommunicationForDeletedAccount(tx: Tx, userId: string): Promise<void> {
  await tx.update(eventAnnouncements).set({ authorId: null }).where(eq(eventAnnouncements.authorId, userId));
  await tx.update(groupMessages).set({ authorId: null }).where(eq(groupMessages.authorId, userId));
}
