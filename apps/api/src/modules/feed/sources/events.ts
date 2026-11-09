// Source « Événement recommandé » : événements publiés à venir (pas sur invitation), plus ils approchent plus ils
// montent. Date de la carte : la publication, ou 7 jours avant le début si c'est plus tard (jamais après `ref`) ; dans les 48 h
// avant le début : l'instant du parcours (carte « chaude »).
import type { FeedCardKind } from "@orasso/shared";
import { and, desc, eq, ne, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { events, structures } from "../../../db/schema";
import { summaryOf } from "../summary";
import { atBounds, type FeedSource, inDepartments, type LoadedCard, type SourceInput, tsParam } from "./types";

export const source: FeedSource<"event_recommended"> = {
  kind: "event_recommended",
  async load(input: SourceInput): Promise<LoadedCard<"event_recommended">[]> {
    const published = sql`coalesce(${events.publishedAt}, ${events.createdAt})`;
    // Un événement qui commence dans les 48 h est « chaud » : date de la carte = l'instant du parcours.
    const atExpr = sql`(case when ${events.startsAt} <= ${tsParam(input.ref)} + interval '48 hours' then ${tsParam(input.ref)}
      else least(${tsParam(input.ref)}, greatest(${published}, ${events.startsAt} - interval '7 days')) end)`;
    const filters: (SQL | undefined)[] = [
      eq(events.status, "published"),
      ne(events.admission, "invite_only"),
      eq(structures.verification, "verified"),
      sql`${structures.deletedAt} is null`,
      sql`${events.endsAt} >= ${tsParam(input.ref)}`,
      sql`${events.startsAt} <= ${tsParam(input.ref)} + interval '60 days'`,
      sql`${published} <= ${tsParam(input.ref)}`,
      ...atBounds(atExpr, input),
    ];
    if (input.filter === "following") {
      filters.push(
        sql`exists (select 1 from structure_follows sf where sf.structure_id = ${events.structureId} and sf.user_id = ${input.userId})`,
      );
    }
    if (input.filter === "nearby") filters.push(inDepartments(sql`${events.department}`, input.nearby));
    const rows = await db
      .select({ e: events, s: structures, at: sql<Date>`${atExpr}` })
      .from(events)
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(and(...filters))
      .orderBy(desc(atExpr), desc(events.id))
      .limit(input.limit);
    return rows.map((r) => ({
      id: `event_recommended:${r.e.id}`,
      kind: "event_recommended" as const satisfies FeedCardKind,
      at: new Date(r.at),
      department: r.e.department,
      authorId: null,
      structureId: r.e.structureId,
      proId: null,
      categoryIds: r.e.criteria?.categoryIds ?? [],
      payload: { event: summaryOf(r.e, r.s) },
    }));
  },
};
