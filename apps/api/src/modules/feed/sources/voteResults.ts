// Source « Résultat du vote » : le podium du prix du public d'un événement terminé depuis moins de 14 jours (lit
// `audience_prize_results`, posé au règlement du vote ; le lot R7l1 ajoutera les votes à thème). Le prix n'existe que
// s'il a un gagnant (au moins 2 véhicules et 3 voix). Pseudo, véhicule et photo masquée (plaque traitée), comme le
// classement affiché après le vote ; les comptes hors règle sont écartés. Le pseudo d'un compte privé que la personne ne
// suit pas n'est pas donné (la voiture seule, photo masquée).
import { maskedPhoto } from "@orasso/shared";
import { and, asc, desc, eq, inArray, ne, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { applications, audiencePrizeResults, events, profiles, structures, userFollows } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import { vehiclesRepo } from "../../vehicles/repo";
import { vehicleLabel } from "../../vehicles/serializers";
import { profileOkSql } from "../access";
import { summaryOf } from "../summary";
import {
  atBounds,
  atMs,
  type FeedSource,
  inDepartments,
  type LoadedCard,
  type SourceInput,
  type SourceResult,
  sliceRows,
  tsParam,
} from "./types";

/** L'événement a fini il y a 16 jours au plus (le prix du public se règle dans les 14 jours qui suivent, avec une marge). */
const ENDED_WITHIN_DAYS = 16;

/** Lot R7l1 : la carte ne parle que du prix du public (« Toutes catégories ») ; celles des votes à thème viendront à part. */
const allCategoriesVotes = sql.raw("select id from event_votes where kind = 'all_categories'");

export const source: FeedSource<"vote_result"> = {
  kind: "vote_result",
  async load(input: SourceInput): Promise<SourceResult<"vote_result">> {
    const winnerAt = atMs(
      sql`(select min(r.created_at) from audience_prize_results r where r.event_id = ${events.id} and r.vote_id in (${allCategoriesVotes}))`,
    );
    const filters: (SQL | undefined)[] = [
      eq(events.status, "published"),
      ne(events.admission, "invite_only"),
      sql`${structures.deletedAt} is null`,
      sql`${events.endsAt} <= ${tsParam(input.ref)}`,
      // Le prix se règle peu après la fin : borner la fin de l'événement évite de calculer le règlement de tous les événements passés.
      sql`${events.endsAt} >= ${tsParam(input.ref)} - interval '${sql.raw(String(ENDED_WITHIN_DAYS))} days'`,
      sql`exists (select 1 from audience_prize_results r where r.event_id = ${events.id} and r.winner and r.vote_id in (${allCategoriesVotes}))`,
      sql`${winnerAt} <= ${tsParam(input.ref)}`,
      sql`${winnerAt} >= ${tsParam(input.ref)} - interval '14 days'`,
      ...atBounds(winnerAt, sql`${events.id}`, "vote_result", input),
    ];
    if (input.filter === "following") {
      filters.push(
        sql`exists (select 1 from structure_follows sf where sf.structure_id = ${events.structureId} and sf.user_id = ${input.userId})`,
      );
    }
    if (input.filter === "nearby") filters.push(inDepartments(sql`${events.department}`, input.nearby));
    const raw = await db
      .select({ e: events, s: structures, at: sql<Date>`${winnerAt}` })
      .from(events)
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(and(...filters))
      .orderBy(desc(winnerAt), desc(events.id))
      .limit(input.limit + 1);
    const { rows, more, tail } = sliceRows(raw, input.limit, (r) => ({
      at: new Date(r.at),
      id: `vote_result:${r.e.id}`,
    }));
    if (!rows.length) return { cards: [], more, tail };

    const podiumRows = await db
      .select({
        eventId: audiencePrizeResults.eventId,
        rank: audiencePrizeResults.rank,
        votes: audiencePrizeResults.votes,
        vehicleId: applications.vehicleId,
        userId: profiles.userId,
        pseudo: profiles.pseudo,
        visibility: profiles.visibility,
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
          sql`${audiencePrizeResults.voteId} in (${allCategoriesVotes})`,
          profileOkSql("profiles", input.ref),
        ),
      )
      .orderBy(asc(audiencePrizeResults.rank));
    // Compte privé : son pseudo ne sort que pour lui-même ou ses abonnés acceptés.
    const privateIds = [...new Set(podiumRows.filter((p) => p.visibility !== "public").map((p) => p.userId))];
    const followed = new Set(
      privateIds.length
        ? (
            await db
              .select({ id: userFollows.followedId })
              .from(userFollows)
              .where(
                and(
                  eq(userFollows.followerId, input.userId),
                  inArray(userFollows.followedId, privateIds),
                  eq(userFollows.status, "accepted"),
                ),
              )
          ).map((r) => r.id)
        : [],
    );
    const vehicleIds = [...new Set(podiumRows.flatMap((p) => (p.vehicleId ? [p.vehicleId] : [])))];
    const full = new Map((await vehiclesRepo.findFullByIds(vehicleIds)).map((v) => [v.id, v]));

    const cards = rows.flatMap((r): LoadedCard<"vote_result">[] => {
      const podium = podiumRows
        .filter((p) => p.eventId === r.e.id)
        .flatMap((p) => {
          const v = p.vehicleId ? full.get(p.vehicleId) : undefined;
          if (!v) return [];
          return [
            {
              rank: p.rank,
              vehicleLabel: vehicleLabel(v),
              pseudo:
                p.visibility === "public" || p.userId === input.userId || followed.has(p.userId) ? p.pseudo : null,
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
          eventId: r.e.id,
          payload: { event: summaryOf(r.e, r.s), podium },
        },
      ];
    });
    return { cards, more, tail };
  },
};
