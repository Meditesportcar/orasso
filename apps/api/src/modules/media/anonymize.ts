// Compte supprimé (anonymisé) : le profil média est retiré et vidé de ce qui l'identifie, la carte de presse effacée
// (AS-V6), les contenus retirés et leurs photos effacées (lot 45, ARCHITECTURE-SUITE § 1.5 étendu). Appelé par
// `accountService.anonymize`, dans sa transaction ; les accréditations passées gardent leur lien (historique des
// organisateurs). Renvoie les clés des fichiers à supprimer du stockage après la validation.
import { eq, inArray } from "drizzle-orm";

import { mediaContents, mediaProfiles, mediaSavedEvents } from "../../db/schema";
import type { Tx } from "../../lib/tx";

export async function anonymizeMediaForDeletedAccount(tx: Tx, userId: string, at: Date): Promise<string[]> {
  const profiles = await tx.select().from(mediaProfiles).where(eq(mediaProfiles.userId, userId));
  if (!profiles.length) return [];
  const ids = profiles.map((p) => p.id);
  const contents = await tx
    .select({ photoKeys: mediaContents.photoKeys })
    .from(mediaContents)
    .where(inArray(mediaContents.mediaProfileId, ids));
  const keys = [...contents.flatMap((c) => c.photoKeys), ...profiles.flatMap((p) => (p.logoKey ? [p.logoKey] : []))];
  await tx
    .update(mediaContents)
    .set({ deletedAt: at, photoKeys: [], featuredAt: null, title: "Contenu supprimé" })
    .where(inArray(mediaContents.mediaProfileId, ids));
  await tx.delete(mediaSavedEvents).where(inArray(mediaSavedEvents.mediaProfileId, ids));
  for (const p of profiles) {
    await tx
      .update(mediaProfiles)
      .set({
        deletedAt: p.deletedAt ?? at,
        name: "Média supprimé",
        description: null,
        website: null,
        instagram: null,
        youtube: null,
        logoKey: null,
        pressCardNumber: null,
        pressCardVerifiedAt: null,
        departments: [],
      })
      .where(eq(mediaProfiles.id, p.id));
  }
  return keys;
}
