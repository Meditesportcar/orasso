// Les responsables d'une structure (lot R9d) : le propriétaire et les co-organisateurs **actifs**. Une seule fonction pour
// tout ce qui prévient « les responsables » (demande de staff, collaboration, mention, commentaire, candidature à trier) :
// avant, trois copies disaient presque la même chose (`organizersOf`, `recipientsOf`, la clause de `lib/authorship.ts`).
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { profiles, structureMembers, structures } from "../db/schema";
import { now } from "./deps";
import type { Executor } from "./tx";

/**
 * Les `user_id` des responsables d'une structure non supprimée.
 * - Ni le staff, ni un membre `requested` ou `invited`, ni un ancien membre.
 * - Un compte supprimé, banni ou suspendu en ce moment est exclu : il n'est pas prévenu.
 * - Une structure suspendue n'émet rien (`includeSuspended: false`, le défaut) ; la lecture de son Activité reste possible
 *   (`includeSuspended: true`).
 */
export async function structureManagers(
  ex: Executor,
  structureId: string,
  opts: { includeSuspended?: boolean; userId?: string } = {},
): Promise<string[]> {
  const at = now();
  const rows = await ex
    .select({ userId: structureMembers.userId })
    .from(structureMembers)
    .innerJoin(structures, eq(structures.id, structureMembers.structureId))
    .innerJoin(profiles, eq(profiles.userId, structureMembers.userId))
    .where(
      and(
        eq(structureMembers.structureId, structureId),
        opts.userId ? eq(structureMembers.userId, opts.userId) : undefined,
        eq(structureMembers.status, "active"),
        inArray(structureMembers.role, ["owner", "co_organizer"]),
        isNull(structures.deletedAt),
        opts.includeSuspended ? undefined : sql`${structures.verification} <> 'suspended'`,
        isNull(profiles.deletedAt),
        isNull(profiles.bannedAt),
        sql`(${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${at.toISOString()}::timestamptz)`,
      ),
    )
    // Ordre stable : les verrous pris par responsable se prennent toujours dans le même ordre.
    .orderBy(structureMembers.userId);
  return rows.map((r) => r.userId);
}

/**
 * Cette personne est-elle responsable de la structure **à l'instant** ? Une seule requête indexée (membre actif, propriétaire ou
 * co-organisateur) : sert à revérifier chaque livraison d'une ligne de structure, sans cache.
 */
export async function isStructureManager(
  ex: Executor,
  structureId: string,
  userId: string,
  opts: { includeSuspended?: boolean } = {},
): Promise<boolean> {
  return (await structureManagers(ex, structureId, { ...opts, userId })).length > 0;
}
