// Prestataires v2 (lot 46) : lectures communes aux missions, aux candidatures, au tri et à la vitrine — besoins d'un
// événement avec leurs places comblées et leurs retenus, avis des organisateurs d'un prestataire.
import {
  type EventNeedForOrganizer,
  type EventNeedView,
  needRemaining,
  PROVIDER_REVIEW_LATEST,
  type ProviderForTriage,
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
import {
  applications,
  eventNeeds,
  events,
  profiles,
  providerProfiles,
  providerReviews,
  structures,
} from "../../db/schema";
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

/**
 * Vue d'un besoin. `withKey` : la clé de création de l'assistant (correctif 53c), pour l'organisation seulement ; jamais
 * dans les vues des prestataires ni de la page publique.
 */
export function needView(row: NeedRow, filled: number, withKey = false): EventNeedView {
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
    ...(withKey ? { clientKey: row.clientKey } : {}),
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
  return rows.map((r) => needView(r, filled.get(r.id) ?? 0, true));
}

/** Besoins d'un événement vus par l'organisation : qui occupe chaque besoin (retenus), emplacement, avis donné. */
export async function needViewsForOrganizer(eventId: string, ex: Executor = db): Promise<EventNeedForOrganizer[]> {
  const needs = await needViewsOfEvent(eventId, ex);
  if (!needs.length) return [];
  const retained = await ex
    .select({
      id: applications.id,
      needId: applications.needId,
      providerId: providerProfiles.id,
      providerName: providerProfiles.name,
      spotLabel: applications.spotLabel,
      spotNote: applications.spotNote,
      reviewId: providerReviews.id,
    })
    .from(applications)
    .innerJoin(providerProfiles, eq(providerProfiles.id, applications.providerProfileId))
    .leftJoin(providerReviews, eq(providerReviews.applicationId, applications.id))
    .where(
      and(
        inArray(
          applications.needId,
          needs.map((n) => n.id),
        ),
        eq(applications.status, "accepted"),
      ),
    )
    .orderBy(asc(applications.decidedAt), asc(applications.createdAt));
  return needs.map((n) => ({
    ...n,
    retained: retained
      .filter((r) => r.needId === n.id)
      .map((r) => ({
        applicationId: r.id,
        providerId: r.providerId,
        providerName: r.providerName,
        spot: r.spotLabel ? { label: r.spotLabel, note: r.spotNote } : null,
        reviewed: r.reviewId !== null,
      })),
  }));
}

/**
 * Avis visibles (non retirés par la modération) d'un prestataire : moyenne, nombre, les 3 derniers, avec la structure
 * et l'événement seulement — jamais le pseudo de l'auteur : l'avis engage la structure (§ 5.2).
 */
export async function reviewsOf(providerId: string, ex: Executor = db): Promise<ProviderReviewsSummary> {
  const visible = and(eq(providerReviews.providerProfileId, providerId), isNull(providerReviews.hiddenAt));
  const all = await ex.select({ rating: providerReviews.rating }).from(providerReviews).where(visible);
  const latest = await ex
    .select({
      r: providerReviews,
      structureName: structures.name,
      eventTitle: events.title,
      eventEndsAt: events.endsAt,
    })
    .from(providerReviews)
    .innerJoin(structures, eq(structures.id, providerReviews.structureId))
    .innerJoin(events, eq(events.id, providerReviews.eventId))
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
}): ProviderReviewView {
  return {
    id: row.r.id,
    rating: row.r.rating,
    comment: row.r.comment,
    structureName: row.structureName,
    eventTitle: row.eventTitle,
    eventEndsAt: row.eventEndsAt.toISOString(),
    createdAt: row.r.createdAt.toISOString(),
  };
}

export type ApplicationReview = { rating: number; comment: string | null; createdAt: string; authorName: string };

/** Avis (non retirés) des candidatures données, avec le pseudo de l'auteur (« Compte supprimé » s'il l'est). */
export async function reviewsByApplication(
  applicationIds: readonly string[],
  ex: Executor = db,
): Promise<Map<string, ApplicationReview>> {
  const out = new Map<string, ApplicationReview>();
  if (!applicationIds.length) return out;
  const rows = await ex
    .select({ r: providerReviews, pseudo: profiles.pseudo, authorDeletedAt: profiles.deletedAt })
    .from(providerReviews)
    .leftJoin(profiles, eq(profiles.userId, providerReviews.authorId))
    .where(and(inArray(providerReviews.applicationId, [...applicationIds]), isNull(providerReviews.hiddenAt)));
  for (const { r, pseudo, authorDeletedAt } of rows) {
    out.set(r.applicationId, {
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      // Compte supprimé (anonymisé) ou disparu : l'avis reste, sans nom.
      authorName: pseudo && !authorDeletedAt ? pseudo : providerReviewTexts.deletedAuthor,
    });
  }
  return out;
}

type TriageRow = { id: string; kind: string; needId: string | null; spotLabel: string | null; spotNote: string | null };
export type ProviderTriageExtras = Pick<ProviderForTriage, "need" | "spot" | "review">;

/**
 * Tri des prestataires (vue de l'organisation, lot 46) : mission à laquelle chaque candidature répond, emplacement
 * attribué, avis déjà donné. Appelé par `applications/queries.ts` pour la file et la fiche du tri.
 */
export async function providerTriageExtras(
  rows: readonly TriageRow[],
  ex: Executor = db,
): Promise<Map<string, ProviderTriageExtras>> {
  const providers = rows.filter((r) => r.kind === "provider");
  const out = new Map<string, ProviderTriageExtras>();
  if (!providers.length) return out;
  const needIds = [...new Set(providers.flatMap((r) => (r.needId ? [r.needId] : [])))];
  const needs = needIds.length
    ? await ex
        .select({ id: eventNeeds.id, trade: eventNeeds.trade })
        .from(eventNeeds)
        .where(inArray(eventNeeds.id, needIds))
    : [];
  const needOf = new Map(needs.map((n) => [n.id, n]));
  const reviews = await reviewsByApplication(
    providers.map((r) => r.id),
    ex,
  );
  for (const r of providers) {
    const need = r.needId ? needOf.get(r.needId) : undefined;
    const review = reviews.get(r.id);
    const trade = need?.trade as VendorTypeCode | undefined;
    out.set(r.id, {
      need: need && trade ? { id: need.id, trade, tradeLabel: providerTypeLabel(trade) } : null,
      spot: r.spotLabel ? { label: r.spotLabel, note: r.spotNote } : null,
      review: review ? { rating: review.rating, comment: review.comment, createdAt: review.createdAt } : null,
    });
  }
  return out;
}
