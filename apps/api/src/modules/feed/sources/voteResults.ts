// Source « Résultat du vote » : le podium du prix du public d'un événement terminé depuis moins de 14 jours (lit
// `audience_prize_results`, posé au règlement du vote ; le lot R7l1 ajoutera les votes à thème). Le prix n'existe que
// s'il a un gagnant (au moins 2 véhicules et 3 voix). Pseudo, véhicule et photo masquée (plaque traitée), comme le
// classement affiché après le vote ; les comptes hors règle sont écartés.
import { maskedPhoto } from "@orasso/shared";
import { and, asc, desc, eq, inArray, ne, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { applications, audiencePrizeResults, events, profiles, structures } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import { vehiclesRepo } from "../../vehicles/repo";
import { vehicleLabel } from "../../vehicles/serializers";
import { profileOkSql } from "../access";
import { summaryOf } from "../summary";
import { atBounds, type FeedSource, inDepartments, type LoadedCard, type SourceInput, tsParam } from "./types";

export const source: FeedSource<"vote_result"> = {
  kind: "vote_result",
  async load(input: SourceInput): Promise<LoadedCard<"vote_result">[]> {
    const winnerAt = sql`(select min(r.created_at) from audience_prize_results r where r.event_id = ${events.id})`;
    const filters: (SQL | undefined)[] = [
      eq(events.status, "published"),
      ne(events.admission, "invite_only"),
      sql`${structures.deletedAt} is null`,
      sql`${events.endsAt} <= ${tsParam(input.ref)}`,
      sql`exists (select 1 from audience_prize_results r where r.event_id = ${events.id} and r.winner)`,
      sql`${winnerAt} <= ${tsParam(input.ref)}`,
      sql`${winnerAt} >= ${tsParam(input.ref)} - interval '14 days'`,
      ...atBounds(winnerAt, input),
    ];
    if (input.filter === "following") {
      filters.push(
        sql`exists (select 1 from structure_follows sf where sf.structure_id = ${events.structureId} and sf.user_id = ${input.userId})`,
      );
    }
    if (input.filter === "nearby") filters.push(inDepartments(sql`${events.department}`, input.nearby));
    const rows = await db
      .select({ e: events, s: structures, at: sql<Date>`${winnerAt}` })
      .from(events)
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(and(...filters))
      .orderBy(desc(winnerAt), desc(events.id))
      .limit(input.limit);
    if (!rows.length) return [];

    const podiumRows = await db
      .select({
        eventId: audiencePrizeResults.eventId,
        rank: audiencePrizeResults.rank,
        votes: audiencePrizeResults.votes,
        vehicleId: applications.vehicleId,
        pseudo: profiles.pseudo,
      })
      .from(audiencePrizeResults)
      .innerJoin(applications, eq(applications.id, audiencePrizeResults.applicationId))
      .innerJoin(profiles, eq(profiles.userId, applications.userId))
      .where(
        and(
          inArray(
            audiencePrizeResults.eventId,
            rows.map((r) => r.e.id),
          ),
          sql`${audiencePrizeResults.rank} <= 3`,
          profileOkSql("profiles", input.ref),
        ),
      )
      .orderBy(asc(audiencePrizeResults.rank));
    const vehicleIds = [...new Set(podiumRows.flatMap((p) => (p.vehicleId ? [p.vehicleId] : [])))];
    const full = new Map((await vehiclesRepo.findFullByIds(vehicleIds)).map((v) => [v.id, v]));

    return rows.flatMap((r): LoadedCard<"vote_result">[] => {
      const podium = podiumRows
        .filter((p) => p.eventId === r.e.id)
        .flatMap((p) => {
          const v = p.vehicleId ? full.get(p.vehicleId) : undefined;
          if (!v) return [];
          return [
            {
              rank: p.rank,
              vehicleLabel: vehicleLabel(v),
              pseudo: p.pseudo,
              photoUrl: storage.url(maskedPhoto(v.photos, v.unregistered)?.storageKey ?? null),
              votes: p.votes,
            },
          ];
        });
      // Pas de carte sans gagnant visible.
      if (!podium.some((p) => p.rank === 1)) return [];
      return [
        {
          id: `vote_result:${r.e.id}`,
          kind: "vote_result",
          at: new Date(r.at),
          department: r.e.department,
          authorId: null,
          structureId: r.e.structureId,
          proId: null,
          categoryIds: [],
          payload: { event: summaryOf(r.e, r.s), podium },
        },
      ];
    });
  },
};
