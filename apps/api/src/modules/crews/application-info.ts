// Le crew vu depuis une candidature (lot 19) : carte Accès du membre et fiche de tri de l'organisateur. Lecture seule ;
// appelé par `applications/queries.ts`.
import {
  type ApplicationCrewForTriage,
  type ApplicationCrewInfo,
  crewConfirmDeadline,
  type EventCrewFilter,
  type LockableEvent,
  lockAt,
} from "@orasso/shared";
import { and, count, eq, inArray, isNotNull, ne } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, crews, profiles } from "../../db/schema";
import { storage } from "../../lib/storage";

type AppLike = {
  id: string;
  crewId: string | null;
  status: (typeof applications.$inferSelect)["status"];
  createdAt: Date;
};

async function crewRows(ids: string[]) {
  if (!ids.length) return new Map<string, { crew: typeof crews.$inferSelect; leaderPseudo: string | null }>();
  const rows = await db
    .select({ crew: crews, pseudo: profiles.pseudo, deletedAt: profiles.deletedAt })
    .from(crews)
    .leftJoin(profiles, eq(profiles.userId, crews.createdBy))
    .where(inArray(crews.id, ids));
  return new Map(rows.map((r) => [r.crew.id, { crew: r.crew, leaderPseudo: r.deletedAt ? null : (r.pseudo ?? null) }]));
}

/** Carte Accès : `(candidature, événement) → infos du crew` (ou `null` hors inscription en crew). */
export async function crewsForApplications(rows: AppLike[]) {
  const byId = await crewRows([...new Set(rows.flatMap((r) => (r.crewId ? [r.crewId] : [])))]);
  return (r: AppLike, event: LockableEvent): ApplicationCrewInfo | null => {
    const found = r.crewId ? byId.get(r.crewId) : undefined;
    if (!found) return null;
    const awaiting = r.status === "awaiting_member";
    return {
      id: found.crew.id,
      slug: found.crew.slug,
      name: found.crew.name,
      leaderPseudo: found.leaderPseudo,
      awaitingMember: awaiting,
      confirmBefore: awaiting ? crewConfirmDeadline(r.createdAt, lockAt(event)).toISOString() : null,
    };
  };
}

/**
 * Fiche de tri : le crew, « confirmés / inscrits » et les candidatures **confirmées** du crew sur l'événement. Les
 * membres qui n'ont pas confirmé ne sont jamais nommés (rien n'est montré à l'organisation sans leur accord).
 */
export async function crewsForTriage(eventId: string, rows: AppLike[]) {
  const ids = [...new Set(rows.flatMap((r) => (r.crewId ? [r.crewId] : [])))];
  const byId = await crewRows(ids);
  const all = ids.length
    ? await db
        .select({
          id: applications.id,
          crewId: applications.crewId,
          status: applications.status,
          confirmedAt: applications.memberConfirmedAt,
          pseudo: profiles.pseudo,
          createdAt: applications.createdAt,
        })
        .from(applications)
        .innerJoin(profiles, eq(profiles.userId, applications.userId))
        .where(and(eq(applications.eventId, eventId), inArray(applications.crewId, ids)))
        .orderBy(applications.createdAt)
    : [];
  return (r: AppLike): ApplicationCrewForTriage | null => {
    const found = r.crewId ? byId.get(r.crewId) : undefined;
    if (!found) return null;
    const mine = all.filter((a) => a.crewId === found.crew.id);
    const confirmed = mine.filter((a) => a.confirmedAt !== null);
    return {
      id: found.crew.id,
      slug: found.crew.slug,
      name: found.crew.name,
      logoUrl: storage.url(found.crew.logoKey),
      confirmed: confirmed.length,
      total: mine.length,
      members: confirmed.map((a) => ({ applicationId: a.id, pseudo: a.pseudo, status: a.status })),
    };
  };
}

/** Filtre du tri : les crews qui ont au moins une candidature confirmée sur l'événement. */
export async function eventCrewFilters(eventId: string): Promise<EventCrewFilter[]> {
  const rows = await db
    .select({ id: crews.id, name: crews.name, n: count() })
    .from(applications)
    .innerJoin(crews, eq(crews.id, applications.crewId))
    .where(
      and(
        eq(applications.eventId, eventId),
        isNotNull(applications.memberConfirmedAt),
        ne(applications.status, "awaiting_member"),
      ),
    )
    .groupBy(crews.id, crews.name)
    .orderBy(crews.name);
  return rows.map((r) => ({ id: r.id, name: r.name, count: r.n }));
}
