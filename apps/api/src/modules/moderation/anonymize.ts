// Compte supprimé (anonymisé) et modération (lot 32). Appelé une fois par `accountService.anonymize`, dans sa transaction.
//
// La conservation l'emporte sur l'effacement (docs/01 : « un an après la décision, puis suppression, sauf bannissement
// ou procédure en cours ») : les signalements faits par la personne ou visant ses contenus, leurs captures, et ses
// sanctions restent jusqu'à leur échéance (`moderation.purge`). Ils ne contiennent ni e-mail ni coordonnées ; le compte
// lui-même n'est jamais supprimé (seulement anonymisé), les liens restent donc valables.
// Seule chose close ici : une contestation en cours, devenue sans objet (personne pour lire la réponse) — sans cela, la
// règle « sauf procédure en cours » garderait le dossier pour toujours.
import { and, eq } from "drizzle-orm";

import { sanctions } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Tx } from "../../lib/tx";

export async function anonymizeModerationForDeletedAccount(tx: Tx, userId: string): Promise<void> {
  const at = now();
  await tx
    .update(sanctions)
    .set({ contestStatus: "upheld", contestDecidedAt: at, updatedAt: at })
    .where(and(eq(sanctions.userId, userId), eq(sanctions.contestStatus, "pending")));
}
