// Discussion permanente du staff d'une structure (`structure_staff`, lot 20, ARCHITECTURE-SUITE § 5.2) : propriétaire,
// co-organisateurs et staff **actifs** (droit recalculé à chaque appel : un membre retiré perd l'accès). Chacun y
// parle en son nom (pas au nom de la structure). Structure suspendue : lisible, plus d'écriture.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { profiles, structureMembers, structures } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import type { Executor } from "../../../lib/tx";
import { isStructureSuspended } from "./organizer";
import type { KindRules, Reader } from "./types";

/** Membres actifs (organisateurs et staff) d'une structure non supprimée, comptes existants. */
type TeamRole = "owner" | "co_organizer" | "staff";

export async function activeTeam(
  ex: Executor,
  structureId: string,
  roles: readonly TeamRole[] = ["owner", "co_organizer", "staff"],
) {
  return ex
    .select({ userId: structureMembers.userId, role: structureMembers.role, pseudo: profiles.pseudo })
    .from(structureMembers)
    .innerJoin(structures, eq(structures.id, structureMembers.structureId))
    .innerJoin(profiles, eq(profiles.userId, structureMembers.userId))
    .where(
      and(
        eq(structureMembers.structureId, structureId),
        eq(structureMembers.status, "active"),
        inArray(structureMembers.role, [...roles]),
        isNull(structures.deletedAt),
        sql`${profiles.deletedAt} is null`,
      ),
    )
    .orderBy(profiles.pseudo);
}

export async function structureView(ex: Executor, structureId: string | null) {
  if (!structureId) return null;
  const [s] = await ex
    .select({ id: structures.id, slug: structures.slug, name: structures.name, logoKey: structures.logoKey })
    .from(structures)
    .where(and(eq(structures.id, structureId), isNull(structures.deletedAt)));
  return s ? { id: s.id, slug: s.slug, name: s.name, logoUrl: storage.url(s.logoKey) } : null;
}

export const structureStaffRules: KindRules = {
  kind: "structure_staff",

  async readers(ex, conversation) {
    if (!conversation.structureId) return [];
    const team = await activeTeam(ex, conversation.structureId);
    return team.map((m): Reader => ({ userId: m.userId, side: "member" }));
  },

  async writeBlock(ex, conversation) {
    return (await isStructureSuspended(ex, conversation.structureId)) ? "structure_suspended" : null;
  },

  async describe(ex, conversation, viewer) {
    const structure = await structureView(ex, conversation.structureId);
    const team = conversation.structureId ? await activeTeam(ex, conversation.structureId) : [];
    return {
      title: `Staff · ${structure?.name ?? "Structure"}`,
      subtitle: "Discussion permanente du staff",
      avatarUrl: structure?.logoUrl ?? null,
      participants: team.filter((m) => m.userId !== viewer.userId).map((m) => m.pseudo),
      otherUser: null,
      structure,
    };
  },
};
