// Le Fil (lot R7e1) : l'événement d'une carte ou d'une publication, en liste blanche (`FeedEventSummary`).
import type { FeedEventSummary } from "@orasso/shared";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { events, structures } from "../../db/schema";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import { eventPhotoUrl, eventPosterUrl } from "../events/card";
import type { EventRow } from "../events/repo";

type StructureRow = typeof structures.$inferSelect;

export function summaryOf(e: EventRow, s: Pick<StructureRow, "slug" | "name" | "logoKey">): FeedEventSummary {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    format: e.format,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    city: e.city,
    department: e.department,
    posterUrl: eventPosterUrl(e),
    photoUrl: eventPhotoUrl(e),
    structure: { slug: s.slug, name: s.name, logoUrl: storage.url(s.logoKey) },
  };
}

/** Événements publiés et publics (ni brouillon, ni annulé, ni sur invitation), d'une structure en règle. */
export async function eventSummariesByIds(ex: Executor, ids: string[]): Promise<Map<string, FeedEventSummary>> {
  const out = new Map<string, FeedEventSummary>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  const rows = await ex
    .select({ e: events, s: structures })
    .from(events)
    .innerJoin(structures, eq(structures.id, events.structureId))
    .where(
      and(
        inArray(events.id, unique),
        eq(events.status, "published"),
        ne(events.admission, "invite_only"),
        sql`${structures.deletedAt} is null`,
      ),
    );
  for (const r of rows) out.set(r.e.id, summaryOf(r.e, r.s));
  return out;
}
