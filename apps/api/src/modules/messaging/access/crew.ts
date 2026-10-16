// Discussion d'un crew (`crew`, lot 19, ARCHITECTURE-SUITE § 4.2). Lecture et écriture : les membres actifs du crew
// (recalculés à chaque appel depuis `crew_members` : un membre retiré ou parti ne lit plus rien, même abonné). Un crew
// dissous garde sa discussion lisible par ses membres, sans écriture (`closed_at` posé à la dissolution).
import { crewLabels } from "@orasso/shared";
import { and, asc, eq, sql } from "drizzle-orm";

import { crewMembers, crews, profiles } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import type { Executor } from "../../../lib/tx";
import type { KindRules } from "./types";

/** Membres actifs d'un crew (comptes non supprimés), le chef d'abord. */
export async function activeCrewMembers(ex: Executor, crewId: string) {
  return ex
    .select({ userId: profiles.userId, pseudo: profiles.pseudo, role: crewMembers.role })
    .from(crewMembers)
    .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
    .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.status, "active"), sql`${profiles.deletedAt} is null`))
    .orderBy(sql`${crewMembers.role} = 'leader' desc`, asc(crewMembers.joinedAt));
}

async function crewOf(ex: Executor, crewId: string | null) {
  if (!crewId) return null;
  const [row] = await ex.select().from(crews).where(eq(crews.id, crewId));
  return row ?? null;
}

export const crewRules: KindRules = {
  kind: "crew",

  async readers(ex, conversation) {
    if (!conversation.crewId) return [];
    const rows = await activeCrewMembers(ex, conversation.crewId);
    return rows.map((r) => ({ userId: r.userId, side: "member" as const }));
  },

  async writeBlock(ex, conversation) {
    const crew = await crewOf(ex, conversation.crewId);
    return !crew || crew.deletedAt ? "closed" : null;
  },

  async describe(ex, conversation, viewer) {
    const crew = await crewOf(ex, conversation.crewId);
    const members = conversation.crewId ? await activeCrewMembers(ex, conversation.crewId) : [];
    return {
      title: crew?.name ?? crewLabels.crew,
      subtitle: crewLabels.membersCount(members.length),
      avatarUrl: storage.url(crew?.logoKey ?? null),
      participants: members.filter((m) => m.userId !== viewer.userId).map((m) => m.pseudo),
      otherUser: null,
      structure: null,
    };
  },
};
