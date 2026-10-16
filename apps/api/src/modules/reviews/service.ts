// Avis après l'événement (docs/01 « Découvrir et participer », Validé ; lot 12). Garde-fous : participant pointé,
// fenêtre d'une semaine après la fin, un avis par participant et par événement, réponse publique de l'organisateur,
// moyenne à partir de `REVIEW_MIN_COUNT_FOR_AVERAGE` avis. Un avis masqué par la modération (`hidden_at`) n'est
// plus ni affiché ni compté.
import {
  type EventReview,
  type EventReviews,
  type MyReview,
  REVIEW_MIN_COUNT_FOR_AVERAGE,
  type ReviewCreate,
  reviewAverage,
  reviewDeadline,
  reviewWindowOpen,
} from "@orasso/shared";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, checkins, profiles, reviews } from "../../db/schema";
import { requireOrganizer } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { type EventRow, eventsRepo } from "../events/repo";
import { eventsService } from "../events/service";

type ReviewRow = typeof reviews.$inferSelect;

async function toViews(rows: ReviewRow[]): Promise<EventReview[]> {
  if (!rows.length) return [];
  const people = await db
    .select({ userId: profiles.userId, pseudo: profiles.pseudo })
    .from(profiles)
    .where(
      inArray(
        profiles.userId,
        rows.map((r) => r.userId),
      ),
    );
  const pseudo = new Map(people.map((p) => [p.userId, p.pseudo]));
  return rows.map((r) => ({
    id: r.id,
    pseudo: pseudo.get(r.userId) ?? "",
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    reply: r.reply && r.repliedAt ? { text: r.reply, at: r.repliedAt.toISOString() } : null,
  }));
}

async function forEvent(eventId: string): Promise<EventReviews> {
  const rows = await db.query.reviews.findMany({
    where: and(eq(reviews.eventId, eventId), isNull(reviews.hiddenAt)),
    orderBy: [desc(reviews.createdAt)],
  });
  return {
    count: rows.length,
    average: reviewAverage(rows.map((r) => r.rating)),
    minForAverage: REVIEW_MIN_COUNT_FOR_AVERAGE,
    items: await toViews(rows),
  };
}

export const reviewsService = {
  /** `POST /applications/:id/review` : le participant pointé, pendant la semaine qui suit l'événement. */
  async create(v: Viewer, applicationId: string, input: ReviewCreate): Promise<EventReview> {
    const app = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
    if (!app || app.userId !== v.user.id) throw notFound("Candidature introuvable");
    // Les avis sont ceux des participants avec un véhicule (les prestataires n'en laissent pas, lot 21).
    if (app.kind !== "vehicle") throw forbidden("Les avis sont réservés aux participants");
    const event = await eventsRepo.byId(app.eventId);
    const entry = await db.query.checkins.findFirst({ where: eq(checkins.applicationId, app.id) });
    if (!entry) throw forbidden("Seuls les participants pointés à l'entrée peuvent laisser un avis");
    if (!reviewWindowOpen(event, now())) {
      throw new AppError(423, "locked", "Avis possible pendant une semaine après l'événement", {
        deadline: reviewDeadline(event).toISOString(),
      });
    }
    const [row] = await db
      .insert(reviews)
      .values({ eventId: event.id, userId: v.user.id, applicationId: app.id, ...input })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict("conflict", "Tu as déjà laissé ton avis sur cet événement");
    const [view] = await toViews([row]);
    if (!view) throw new Error("Avis introuvable");
    return view;
  },

  /** `GET /events/by-slug/:slug/reviews` : public, mêmes règles de visibilité que la page de l'événement. */
  async listPublic(slug: string, viewer: Viewer | null): Promise<EventReviews> {
    const event = await eventsService.getPublic(slug, viewer);
    return forEvent(event.id);
  },

  /** `GET /events/:id/reviews` : organisateur (réponses). */
  async listForOrganizer(v: Viewer, eventId: string): Promise<EventReviews> {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    return forEvent(event.id);
  },

  /** `PUT /reviews/:id/reply` : droit de réponse public de l'organisateur (modifiable). */
  async reply(v: Viewer, reviewId: string, text: string): Promise<EventReview> {
    const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) });
    if (!review || review.hiddenAt) throw notFound("Avis introuvable");
    const event = await eventsRepo.byId(review.eventId);
    await requireOrganizer(v, event.structureId);
    const [row] = await db
      .update(reviews)
      .set({ reply: text, repliedAt: now(), repliedBy: v.user.id })
      .where(eq(reviews.id, reviewId))
      .returning();
    const [view] = await toViews(row ? [row] : []);
    if (!view) throw notFound("Avis introuvable");
    return view;
  },

  /** Carnet de route : l'avis de chaque candidature pointée de l'utilisateur. */
  async mine(
    userId: string,
    rows: { id: string; eventId: string }[],
    eventsById: Map<string, EventRow>,
    checkedIn: Set<string>,
  ): Promise<Map<string, MyReview>> {
    const out = new Map<string, MyReview>();
    const eligible = rows.filter((r) => checkedIn.has(r.id));
    if (!eligible.length) return out;
    const given = await db.query.reviews.findMany({
      where: and(
        eq(reviews.userId, userId),
        inArray(
          reviews.eventId,
          eligible.map((r) => r.eventId),
        ),
      ),
    });
    const byEvent = new Map(given.map((g) => [g.eventId, g]));
    const t = now();
    for (const r of eligible) {
      const e = eventsById.get(r.eventId);
      if (!e) continue;
      const g = byEvent.get(e.id);
      out.set(r.id, {
        deadline: reviewDeadline(e).toISOString(),
        canReview: !g && reviewWindowOpen(e, t),
        given: g ? { rating: g.rating, comment: g.comment, reply: g.reply } : null,
      });
    }
    return out;
  },
};
