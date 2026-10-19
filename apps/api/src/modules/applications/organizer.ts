// La structure organisatrice telle que l'appli l'affiche sur un ticket ou une carte d'accueil (lot 43) : nom, logo,
// « Structure validée ». Aucune coordonnée.
import type { structures } from "../../db/schema";
import { storage } from "../../lib/storage";

export type OrganizerView = { name: string; logoUrl: string | null; verified: boolean };

export function organizerOf(
  s: Pick<typeof structures.$inferSelect, "name" | "logoKey" | "verification"> | undefined,
): OrganizerView | null {
  return s ? { name: s.name, logoUrl: storage.url(s.logoKey), verified: s.verification === "verified" } : null;
}
