// Prestataires v2 (lot 46) : lectures communes aux missions, aux candidatures et à la vitrine — besoins d'un événement
// avec leurs places comblées, avis des organisateurs d'un prestataire.
import {
  type EventNeedView,
  needRemaining,
  PROVIDER_REVIEW_LATEST,
  type ProviderPower,
  type ProviderReviewsSummary,
  type ProviderReviewView,
  providerReviewAverage,
  providerReviewTexts,
  providerTypeLabel,
  type VendorTypeCode,
} from "@orasso/shared";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, eventNeeds, events, profiles, providerReviews, structures } from "../../db/schema";
import type { Executor } from "../../lib/tx";

export type NeedRow = typeof eventNeeds.$inferSelect;

/** Candidatures retenues rattachées à chaque besoin. */
export async function filledByNeed(needIds: readonly string[], ex: Executor = db): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!needIds.length) return out;
  const rows = await ex
    .select({ needId: applications.needId, n: count() })
    .from(applications)
    .where(and(inArray(applications.needId, [...needIds]), eq(applications.status, "accepted")))
    .groupBy(applications.needId);
  for (const r of rows) if (r.needId) out.set(r.needId, r.n);
  return out;
}

export function needView(row: NeedRow, filled: number): EventNeedView {
  return {
    id: row.id,
    trade: row.trade as VendorTypeCode,
    tradeLabel: providerTypeLabel(row.trade as VendorTypeCode),
    quantity: row.quantity,
    filled,
    remaining: needRemaining(row, filled),
    power: row.power as ProviderPower,
    water: row.water,
    frontageM: row.frontageM,
    installAt: row.installAt?.toISOString() ?? null,
    notes: row.notes,
    position: row.position,
  };
}

/** Les besoins d'un événement, dans l'ordre de l'organisateur. */
export async function needViewsOfEvent(eventId: string, ex: Executor = db): Promise<EventNeedView[]> {
  const rows = await ex
    .select()
    .from(eventNeeds)
    .where(eq(eventNeeds.eventId, eventId))
    .orderBy(asc(eventNeeds.position), asc(eventNeeds.createdAt));
  const filled = await filledByNeed(
    rows.map((r) => r.id),
    ex,
  );
  return rows.map((r) => needView(r, filled.get(r.id) ?? 0));
}

/** Avis visibles (non retirés par la modération) d'un prestataire : moyenne, nombre, les 3 derniers. */
export async function reviewsOf(providerId: string, ex: Executor = db): Promise<ProviderReviewsSummary> {
  const visible = and(eq(providerReviews.providerProfileId, providerId), isNull(providerReviews.hiddenAt));
  const all = await ex.select({ rating: providerReviews.rating }).from(providerReviews).where(visible);
  const latest = await ex
    .select({
      r: providerReviews,
      structureName: structures.name,
      eventTitle: events.title,
      eventEndsAt: events.endsAt,
      pseudo: profiles.pseudo,
      authorDeletedAt: profiles.deletedAt,
    })
    .from(providerReviews)
    .innerJoin(structures, eq(structures.id, providerReviews.structureId))
    .innerJoin(events, eq(events.id, providerReviews.eventId))
    .leftJoin(profiles, eq(profiles.userId, providerReviews.authorId))
    .where(visible)
    .orderBy(desc(providerReviews.createdAt))
    .limit(PROVIDER_REVIEW_LATEST);
  return {
    average: providerReviewAverage(all.map((x) => x.rating)),
    count: all.length,
    latest: latest.map(reviewView),
  };
}

export function reviewView(row: {
  r: typeof providerReviews.$inferSelect;
  structureName: string;
  eventTitle: string;
  eventEndsAt: Date;
  pseudo: string | null;
  authorDeletedAt: Date | null;
}): ProviderReviewView {
  return {
    id: row.r.id,
    rating: row.r.rating,
    comment: row.r.comment,
    structureName: row.structureName,
    eventTitle: row.eventTitle,
    eventEndsAt: row.eventEndsAt.toISOString(),
    // Compte supprimé (anonymisé) ou disparu : l'avis reste, sans nom.
    authorName: row.pseudo && !row.authorDeletedAt ? row.pseudo : providerReviewTexts.deletedAuthor,
    createdAt: row.r.createdAt.toISOString(),
  };
}
