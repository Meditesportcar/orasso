// Façade du prix du public (lot 49, @deprecated depuis le lot R7l1, retrait en R8). Le prix du public est devenu le vote
// « Toutes catégories » (`modules/votes`) : les quatre routes `/events/:id/audience-prize*` restent pour l'appli en ligne
// (APK R6-police) et lui répondent avec les formes d'avant, tirées de ce vote. Aucune règle ici.
import type { AudienceCandidates, AudiencePrizeBoard, AudiencePrizeMine, VoteView } from "@orasso/shared";
import { podiumPoints } from "@orasso/shared";

import { and, eq } from "drizzle-orm";

import { db } from "../../db/client";
import { audiencePrizeResults } from "../../db/schema";
import type { Viewer } from "../../lib/session";
import { settingsStore } from "../../lib/settings";
import { enteredVehicles } from "../votes/context";
import { votesLifecycle } from "../votes/lifecycle";
import { canVoteNow as canVoteNowImpl, visibleEvent, votesService } from "../votes/service";

/**
 * @deprecated Invalidation de la grille et constat d'ouverture après un pointage. Le temps réel et la vie des votes sont
 * dans `modules/votes` ; gardée sous ce nom pour les pointages.
 */
export async function announceCandidatesChanged(eventId: string) {
  await votesLifecycle.entriesChanged(eventId);
}

/** La personne peut-elle voter maintenant dans un vote de l'événement ? (La présence par GPS l'annonce.) */
export const canVoteNow = canVoteNowImpl;

const emptyMine = (closesAt: Date): AudiencePrizeMine => ({
  canVote: false,
  reason: "vote_closed",
  open: false,
  closesAt: closesAt.toISOString(),
  checkedInAt: null,
  votedFor: null,
  votedAt: null,
  ownApplicationIds: [],
});

/** Le vote « Toutes catégories » vu par la personne, ou `null` si l'organisateur l'a retiré. */
async function allCategories(v: Viewer, eventId: string): Promise<VoteView | null> {
  const row = await votesService.allCategoriesOf(eventId);
  return row ? votesService.get(v, eventId, row.id) : null;
}

export const audiencePrizeService = {
  /** @deprecated `PUT /events/:id/audience-prize/vote` → `PUT /events/:id/votes/:voteId/vote`. */
  async vote(v: Viewer, eventId: string, applicationId: string): Promise<AudiencePrizeMine> {
    const event = await visibleEvent(eventId, v);
    const row = await votesService.allCategoriesOf(eventId);
    if (!row) return emptyMine(event.endsAt);
    await votesService.cast(v, eventId, row.id, applicationId);
    return this.mine(v, eventId);
  },

  /** @deprecated `GET /events/:id/audience-prize/mine`. */
  async mine(v: Viewer, eventId: string): Promise<AudiencePrizeMine> {
    const event = await visibleEvent(eventId, v);
    const vote = await allCategories(v, eventId);
    if (!vote) return emptyMine(event.endsAt);
    return {
      canVote: vote.canVote,
      reason: vote.reason,
      open: vote.state === "open",
      closesAt: vote.closesAt,
      checkedInAt: vote.checkedInAt,
      votedFor: vote.myVote,
      votedAt: vote.votedAt,
      ownApplicationIds: vote.ownApplicationIds,
    };
  },

  /** @deprecated `GET /events/:id/audience-prize/candidates`. */
  async candidates(v: Viewer, eventId: string, cursor: number): Promise<AudienceCandidates> {
    await visibleEvent(eventId, v);
    const row = await votesService.allCategoriesOf(eventId);
    if (!row) return { items: [], next: null };
    const page = await votesService.candidates(v, eventId, row.id, cursor);
    return {
      items: page.items
        .filter((c) => c.eligible)
        .map(({ applicationId, vehicleLabel, pseudo, photoUrl }) => ({
          applicationId,
          vehicleLabel,
          pseudo,
          photoUrl,
        })),
      next: page.next,
    };
  },

  /** @deprecated `GET /events/:id/audience-prize`. */
  async board(v: Viewer, eventId: string): Promise<AudiencePrizeBoard> {
    const event = await visibleEvent(eventId, v);
    const vote = await allCategories(v, eventId);
    const entered = await enteredVehicles(db, eventId);
    const winnerPoints = podiumPoints({ "points.vote_first": await settingsStore.get("points.vote_first") }, 1);
    if (!vote) {
      return {
        eventId,
        open: false,
        closesAt: event.endsAt.toISOString(),
        settled: false,
        total: 0,
        vehicles: entered.length,
        winnerPoints,
        rankingHidden: false,
        entries: [],
        winner: null,
      };
    }
    const entries = vote.ranking ?? [];
    // Le gagnant n'existe qu'une fois les résultats figés et le prix décerné (2 véhicules et 3 voix au moins).
    const winnerRow = vote.settled
      ? await db.query.audiencePrizeResults.findFirst({
          where: and(eq(audiencePrizeResults.voteId, vote.id), eq(audiencePrizeResults.winner, true)),
        })
      : undefined;
    return {
      eventId,
      open: vote.state === "open",
      closesAt: vote.closesAt,
      settled: vote.settled,
      total: vote.total,
      vehicles: entered.length,
      winnerPoints,
      rankingHidden: vote.ranking === null,
      entries,
      winner: winnerRow ? (entries.find((e) => e.applicationId === winnerRow.applicationId) ?? null) : null,
    };
  },

  /** Rang d'une personne dans « Toutes catégories » (meilleur de ses véhicules entrés) : le récap. */
  rankOf: (eventId: string, userId: string) => votesService.rankOf(eventId, userId),

  /** Abonnement au canal `event:{id}:votes`. */
  canSubscribe: (userId: string, channel: string) => votesService.canSubscribe(userId, channel),
};
