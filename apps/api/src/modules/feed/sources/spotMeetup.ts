// Source « Rendez-vous au spot » du Fil (lot R7i) : les rendez-vous en cours ou à venir dont la personne est **invitée**
// (abonnés acceptés de l'auteur, ou membres actifs du crew), jamais ceux de tout le monde, jamais le sien, jamais d'un
// compte hors règle. La carte est datée de la création : fraîche, elle arrive en tête (auteur suivi : affinité 1,5). Le lieu
// est servi aux invités seuls (même vue que l'API des rendez-vous) ; fini, il n'y a plus de carte.
import { and, desc, eq, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { profiles, spotMeetups } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { buildViews, invitedSql } from "../../spot-meetups/views";
import { profileOkSql } from "../access";
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

export const source: FeedSource<"spot_meetup"> = {
  kind: "spot_meetup",
  async load(input: SourceInput): Promise<SourceResult<"spot_meetup">> {
    const atExpr = atMs(sql`${spotMeetups.createdAt}`);
    const filters: (SQL | undefined)[] = [
      sql`${spotMeetups.cancelledAt} is null`,
      sql`${spotMeetups.purgedAt} is null`,
      sql`${spotMeetups.endsAt} > ${tsParam(input.ref)}`,
      sql`${spotMeetups.createdAt} <= ${tsParam(input.ref)}`,
      sql`${spotMeetups.authorId} <> ${input.userId}`,
      profileOkSql("profiles", input.ref),
      invitedSql(input.userId),
      ...atBounds(atExpr, sql`${spotMeetups.id}`, "spot_meetup", input),
    ];
    if (input.filter === "following") {
      filters.push(
        sql`exists (select 1 from user_follows uf where uf.follower_id = ${input.userId} and uf.followed_id = ${spotMeetups.authorId} and uf.status = 'accepted')`,
      );
    }
    if (input.filter === "nearby") filters.push(inDepartments(sql`${profiles.departments}[1]`, input.nearby));
    const raw = await db
      .select({ m: spotMeetups, p: profiles, at: sql<Date>`${atExpr}` })
      .from(spotMeetups)
      .innerJoin(profiles, eq(profiles.userId, spotMeetups.authorId))
      .where(and(...filters))
      .orderBy(desc(atExpr), desc(spotMeetups.id))
      .limit(input.limit + 1);
    const { rows, more, tail } = sliceRows(raw, input.limit, (r) => ({
      at: new Date(r.at),
      id: `spot_meetup:${r.m.id}`,
    }));
    // Le lieu est décidé à l'instant réel : un rendez-vous fini depuis le début du parcours ne montre plus son lieu.
    const views = await buildViews(
      db,
      rows.map((r) => r.m),
      input.userId,
      now(),
    );
    const byId = new Map(views.map((v) => [v.id, v]));
    const cards = rows.flatMap((r): LoadedCard<"spot_meetup">[] => {
      const meetup = byId.get(r.m.id);
      if (!meetup) return [];
      return [
        {
          id: `spot_meetup:${r.m.id}`,
          kind: "spot_meetup",
          at: new Date(r.at),
          department: r.p.departments[0] ?? null,
          authorId: r.m.authorId,
          structureId: null,
          proId: null,
          categoryIds: [],
          authorPseudo: r.p.pseudo,
          payload: { meetup },
        },
      ];
    });
    return { cards, more, tail };
  },
};
