// Conversation entre une personne et une structure (`organizer`, ARCHITECTURE-SUITE § 3.2). Lecture et écriture : la
// personne, et tout propriétaire ou co-organisateur **actif** de la structure (droit recalculé à chaque appel : un
// co-organisateur retiré perd l'accès). Le côté structure exige en plus la double authentification de la session
// (contrôlée par le service). Le super admin n'y a pas accès : Orasso ne lit pas les messages (docs/01).
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  applications,
  conversationParticipants,
  conversations,
  events,
  profiles,
  structureFollows,
  structureMembers,
  structures,
} from "../../../db/schema";
import { storage } from "../../../lib/storage";
import type { Executor } from "../../../lib/tx";
import type { KindRules, Reader } from "./types";

const DAY = 86_400_000;

/** La personne est-elle propriétaire ou co-organisateur actif de cette structure (non supprimée) ? */
export async function isStructureOrganizer(ex: Executor, userId: string, structureId: string): Promise<boolean> {
  const [row] = await ex
    .select({ id: structureMembers.id })
    .from(structureMembers)
    .innerJoin(structures, eq(structures.id, structureMembers.structureId))
    .where(
      and(
        eq(structureMembers.structureId, structureId),
        eq(structureMembers.userId, userId),
        eq(structureMembers.status, "active"),
        inArray(structureMembers.role, ["owner", "co_organizer"]),
        isNull(structures.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * S10 : une structure peut écrire la première à une personne qui la suit, ou qui a une candidature en cours (en
 * attente, retenue, liste d'attente, offre) à un de ses événements fini depuis moins de 7 jours — la même audience que
 * celle des profils (relecture du lot 17).
 */
export async function structureCanReach(ex: Executor, structureId: string, userId: string, at: Date) {
  const [follow] = await ex
    .select({ userId: structureFollows.userId })
    .from(structureFollows)
    .where(and(eq(structureFollows.structureId, structureId), eq(structureFollows.userId, userId)))
    .limit(1);
  if (follow) return true;
  const [application] = await ex
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(events, eq(events.id, applications.eventId))
    .where(
      and(
        eq(applications.userId, userId),
        eq(events.structureId, structureId),
        inArray(applications.status, ["pending", "accepted", "waitlisted", "offered"]),
        sql`${events.endsAt} >= ${new Date(at.getTime() - 7 * DAY)}`,
      ),
    )
    .limit(1);
  return Boolean(application);
}

/** La personne (côté membre) de la conversation, si son compte existe encore. */
async function memberOf(ex: Executor, conversationId: string) {
  const [row] = await ex
    .select({ userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
    .from(conversationParticipants)
    .innerJoin(profiles, eq(profiles.userId, conversationParticipants.userId))
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.role, "member"),
        isNull(conversationParticipants.leftAt),
        sql`${profiles.deletedAt} is null`,
      ),
    )
    .limit(1);
  return row ?? null;
}

async function structureOf(ex: Executor, structureId: string | null) {
  if (!structureId) return null;
  const [row] = await ex
    .select({ id: structures.id, slug: structures.slug, name: structures.name, logoKey: structures.logoKey })
    .from(structures)
    .where(and(eq(structures.id, structureId), isNull(structures.deletedAt)));
  return row ?? null;
}

export const organizerRules: KindRules = {
  kind: "organizer",

  async readers(ex, conversation) {
    const out: Reader[] = [];
    const member = await memberOf(ex, conversation.id);
    if (member) out.push({ userId: member.userId, side: "member" });
    if (!conversation.structureId) return out;
    const organizers = await ex
      .select({ userId: structureMembers.userId })
      .from(structureMembers)
      .innerJoin(structures, eq(structures.id, structureMembers.structureId))
      .innerJoin(profiles, eq(profiles.userId, structureMembers.userId))
      .where(
        and(
          eq(structureMembers.structureId, conversation.structureId),
          eq(structureMembers.status, "active"),
          inArray(structureMembers.role, ["owner", "co_organizer"]),
          isNull(structures.deletedAt),
          sql`${profiles.deletedAt} is null`,
        ),
      );
    for (const o of organizers) if (o.userId !== member?.userId) out.push({ userId: o.userId, side: "structure" });
    return out;
  },

  async writeBlock(ex, conversation) {
    return (await memberOf(ex, conversation.id)) ? null : "account_deleted";
  },

  async describe(ex, conversation, viewer) {
    const structure = await structureOf(ex, conversation.structureId);
    const structureView = structure
      ? { id: structure.id, slug: structure.slug, name: structure.name, logoUrl: storage.url(structure.logoKey) }
      : null;
    if (viewer.side === "member") {
      return {
        title: structure?.name ?? "Structure",
        subtitle: null,
        avatarUrl: structureView?.logoUrl ?? null,
        participants: structure ? [structure.name] : [],
        otherUser: null,
        structure: structureView,
      };
    }
    const member = await memberOf(ex, conversation.id);
    const avatarUrl = storage.url(member?.avatarKey ?? null);
    return {
      title: member?.pseudo ?? "Compte supprimé",
      subtitle: structure?.name ?? null,
      avatarUrl,
      participants: member ? [member.pseudo] : [],
      otherUser: member ? { userId: member.userId, pseudo: member.pseudo, avatarUrl } : null,
      structure: structureView,
    };
  },

  async extraConversationIds(ex, userId) {
    const rows = await ex
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(structureMembers, eq(structureMembers.structureId, conversations.structureId))
      .innerJoin(structures, eq(structures.id, conversations.structureId))
      .where(
        and(
          eq(conversations.kind, "organizer"),
          eq(structureMembers.userId, userId),
          eq(structureMembers.status, "active"),
          inArray(structureMembers.role, ["owner", "co_organizer"]),
          isNull(structures.deletedAt),
        ),
      );
    return rows.map((r) => r.id);
  },
};
