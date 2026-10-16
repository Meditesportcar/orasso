// Compte supprimé (anonymisé) : le profil prestataire est retiré et vidé de ce qui l'identifie (lot 21). Appelé par
// `accountService.anonymize`, dans sa transaction ; les candidatures passées gardent leur lien (historique des
// organisateurs). Renvoie les clés des photos à supprimer du stockage après la validation.
import { eq } from "drizzle-orm";

import { providerPhotos, providerProfiles } from "../../db/schema";
import type { Tx } from "../../lib/tx";

export async function anonymizeProviderForDeletedAccount(tx: Tx, userId: string, at: Date): Promise<string[]> {
  const keys: string[] = [];
  const providers = await tx.select().from(providerProfiles).where(eq(providerProfiles.userId, userId));
  for (const provider of providers) {
    const photos = await tx
      .delete(providerPhotos)
      .where(eq(providerPhotos.providerId, provider.id))
      .returning({ key: providerPhotos.storageKey });
    keys.push(...photos.map((p) => p.key));
    await tx
      .update(providerProfiles)
      .set({
        deletedAt: provider.deletedAt ?? at,
        name: "Profil supprimé",
        customType: null,
        description: null,
        phone: null,
        email: null,
        website: null,
        instagram: null,
        portfolioUrl: null,
        departments: [],
        proProfileId: null,
      })
      .where(eq(providerProfiles.id, provider.id));
  }
  return keys;
}
