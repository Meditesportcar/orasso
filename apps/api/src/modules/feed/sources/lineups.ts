// Source « Plateau du jour » : un événement qui commence dans les 12 h, est en cours ou vient de finir (24 h), avec ses
// voitures (même règle que la page « Plateau » : avant la fin les retenues, après la fin les seules entrées pointées ;
// jamais les absents, jamais de plaque : photos masquées). Pas sur invitation.
import { and, desc, eq, ne, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { events, structures } from "../../../db/schema";
import { lineupService } from "../../events/lineup";
import { summaryOf } from "../summary";
import {
  atBounds,
  atMs,
  type FeedSource,
  inDepartments,
  type LoadedCard,
  PAGE_VIEWER_ID,
  type SourceInput,
  type SourceResult,
  sliceRows,
  structureFollowedSql,
  tsParam,
} from "./types";

export const source: FeedSource<"lineup"> = {
  kind: "lineup",
  async load(input: SourceInput): Promise<SourceResult<"lineup">> {
    const atExpr = atMs(sql`least(${tsParam(input.ref)}, ${events.startsAt})`);
    const filters: (SQL | undefined)[] = [
      eq(events.status, "published"),
      ne(events.admission, "invite_only"),
      eq(structures.verification, "verified"),
      sql`${structures.deletedAt} is null`,
      sql`${events.startsAt} - interval '12 hours' <= ${tsParam(input.ref)}`,
      sql`${events.endsAt} + interval '24 hours' > ${tsParam(input.ref)}`,
      ...atBounds(atExpr, sql`${events.id}`, "lineup", input),
    ];
    if (input.filter === "following") {
      filters.push(structureFollowedSql(input, sql`${events.structureId}`));
    }
    if (input.filter === "nearby") filters.push(inDepartments(sql`${events.department}`, input.nearby));
    const raw = await db
      .select({ e: events, s: structures, at: sql<Date>`${atExpr}` })
      .from(events)
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(and(...filters))
      .orderBy(desc(atExpr), desc(events.id))
      .limit(input.limit + 1);
    const { rows, more, tail } = sliceRows(raw, input.limit, (r) => ({ at: new Date(r.at), id: `lineup:${r.e.id}` }));
    const previews = await lineupService.previews(
      rows.map((r) => r.e.id),
      input.page ? PAGE_VIEWER_ID : input.userId,
    );
    const cards = rows.flatMap((r): LoadedCard<"lineup">[] => {
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
          eventId: r.e.id,
          payload: { event: summaryOf(r.e, r.s), count: p.count, photoUrls: p.photoUrls },
        },
      ];
    });
    return { cards, more, tail };
  },
};
