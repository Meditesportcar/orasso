// Source « Annonce » : annonces publiques (jamais celles réservées aux participants) des structures que la personne
// suit, sur un événement publié et public, publiées depuis moins de 14 jours.
import { and, desc, eq, ne, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { eventAnnouncements, events, structures } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import { summaryOf } from "../summary";
import {
  atBounds,
  atMs,
  type FeedSource,
  inDepartments,
  type SourceInput,
  type SourceResult,
  sliceRows,
  tsParam,
} from "./types";

const BODY_MAX = 280;

export const source: FeedSource<"announcement"> = {
  kind: "announcement",
  async load(input: SourceInput): Promise<SourceResult<"announcement">> {
    const atExpr = atMs(sql`${eventAnnouncements.publishedAt}`);
    const filters: (SQL | undefined)[] = [
      eq(eventAnnouncements.audience, "public"),
      eq(eventAnnouncements.kind, "announcement"),
      sql`${eventAnnouncements.deletedAt} is null`,
      eq(events.status, "published"),
      ne(events.admission, "invite_only"),
      sql`${structures.deletedAt} is null`,
      sql`exists (select 1 from structure_follows sf where sf.structure_id = ${events.structureId} and sf.user_id = ${input.userId})`,
      sql`${eventAnnouncements.publishedAt} <= ${tsParam(input.ref)}`,
      sql`${eventAnnouncements.publishedAt} >= ${tsParam(input.ref)} - interval '14 days'`,
      ...atBounds(atExpr, sql`${eventAnnouncements.id}`, "announcement", input),
    ];
    if (input.filter === "nearby") filters.push(inDepartments(sql`${events.department}`, input.nearby));
    const raw = await db
      .select({ a: eventAnnouncements, e: events, s: structures, at: sql<Date>`${atExpr}` })
      .from(eventAnnouncements)
      .innerJoin(events, eq(events.id, eventAnnouncements.eventId))
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(and(...filters))
      .orderBy(desc(atExpr), desc(eventAnnouncements.id))
      .limit(input.limit + 1);
    const { rows, more, tail } = sliceRows(raw, input.limit, (r) => ({
      at: new Date(r.at),
      id: `announcement:${r.a.id}`,
    }));
    const cards = rows.map((r) => ({
      id: `announcement:${r.a.id}`,
      kind: "announcement" as const,
      at: r.a.publishedAt,
      department: r.e.department,
      authorId: null,
      structureId: r.e.structureId,
      proId: null,
      categoryIds: [],
      payload: {
        event: summaryOf(r.e, r.s),
        announcement: {
          id: r.a.id,
          body: r.a.body.length > BODY_MAX ? `${r.a.body.slice(0, BODY_MAX - 1).trimEnd()}…` : r.a.body,
          imageUrl: storage.url(r.a.imageKey),
          publishedAt: r.a.publishedAt.toISOString(),
        },
      },
    }));
    return { cards, more, tail };
  },
};
