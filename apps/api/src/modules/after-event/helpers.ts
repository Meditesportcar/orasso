// Briques communes de « Après l'événement et badge de structure » (lot 27).
import { isIP } from "node:net";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import { profiles, structureMembers } from "../../db/schema";
import type { Executor } from "../../lib/tx";

/** Propriétaire et co-organisateurs actifs d'une structure (comptes ni supprimés ni bannis) : ceux qu'on prévient. */
export async function organizerIds(structureId: string, ex: Executor = db): Promise<string[]> {
  const rows = await ex
    .select({ userId: structureMembers.userId })
    .from(structureMembers)
    .innerJoin(profiles, eq(profiles.userId, structureMembers.userId))
    .where(
      and(
        eq(structureMembers.structureId, structureId),
        eq(structureMembers.status, "active"),
        inArray(structureMembers.role, ["owner", "co_organizer"]),
        isNull(profiles.deletedAt),
        isNull(profiles.bannedAt),
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * Adresse IP pour le journal : le dernier hôte de `x-forwarded-for` (celui qu'ajoute nginx ; le début de la liste vient
 * du client), rien si ce n'est pas une adresse valide (la colonne `inet` refuserait l'écriture).
 */
export function clientIp(header: (name: string) => string | undefined): string | null {
  const raw = (header("x-forwarded-for")?.split(",").at(-1) ?? header("x-real-ip") ?? "").trim();
  return isIP(raw) ? raw : null;
}
