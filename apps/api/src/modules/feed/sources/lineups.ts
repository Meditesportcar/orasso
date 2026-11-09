// Source « Plateau du jour » : un événement qui commence dans les 12 h, est en cours ou vient de finir (24 h), avec ses
// voitures (même règle que la page « Plateau » : avant la fin les retenues, après la fin les seules entrées pointées ;
// jamais les absents, jamais de plaque : photos masquées). Pas sur invitation.
import { and, desc, eq, ne, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { events, structures } from "../../../db/schema";
import { lineupService } from "../../events/lineup";
import { summaryOf } from "../summary";
import { atBounds, type FeedSource, inDepartments, type LoadedCard, type SourceInput, tsParam } from "./types";

export const source: FeedSource<"lineup"> = {
  kind: "lineup",
  async load(input: SourceInput): Promise<LoadedCard<"lineup">[]> {
    const atExpr = sql`least(${tsParam(input.ref)}, ${events.startsAt})`;
    const filters: (SQL | undefined)[] = [
      eq(events.status, "published"),
      ne(events.admission, "invite_only"),
      eq(structures.verification, "verified"),
      sql`${structures.deletedAt} is null`,
      sql`${events.startsAt} - interval '12 hours' <= ${tsParam(input.ref)}`,
      sql`${events.endsAt} + interval '24 hours' > ${tsParam(input.ref)}`,
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
    const previews = await lineupService.previews(
      rows.map((r) => r.e.id),
      input.userId,
    );
    return rows.flatMap((r): LoadedCard<"lineup">[] => {
      const p = previews.get(r.e.id);
      if (!p || p.count < 1) return [];
      return [
        {
          id: `lineup:${r.e.id}`,
          kind: "lineup",
          at: new Date(r.at),
          department: r.e.department,
          authorId: null,
          structureId: r.e.structureId,
          proId: null,
          categoryIds: r.e.criteria?.categoryIds ?? [],
          payload: { event: summaryOf(r.e, r.s), count: p.count, photoUrls: p.photoUrls },
        },
      ];
    });
  },
};
