// Règlement des votes à J+2 (lot R7l1, D38), appelé par `pointsService.settleEvent` dans sa transaction. Pour chaque vote :
// résultats (les dix premiers), trophées du podium (rangs 1 à 3), puis une ligne de points `vote_podium` **par voiture** =
// son meilleur rang de l'événement (15 / 10 / 5, lus dans les réglages), le compteur et le tampon rare au premier de
// « Toutes catégories » seulement, `vote_won` au premier de chaque vote, `vote_podium` (Journal) aux deuxième et troisième.
// Idempotent : chaque écriture est protégée par une contrainte d'unicité, et une notification ne part que pour une ligne neuve.
import {
  AUDIENCE_PRIZE_RESULTS_KEPT,
  type AudienceRanked,
  bestRankPerVehicle,
  type PointKind,
  podiumPoints,
  votePodium,
  voteTexts,
} from "@orasso/shared";
import { eq, sql } from "drizzle-orm";

import { audiencePrizeResults, vehicles, vehicleTrophies } from "../../db/schema";
import { settingsStore } from "../../lib/settings";
import type { Executor } from "../../lib/tx";
import type { EventRow } from "../events/repo";
import { notificationsService } from "../notifications/service";
import { closeDueVotes, eventVoteRows, loadEventVotes, rankVote, ruleOfVote, type VoteRow } from "./context";

export type Award = (entry: {
  userId: string;
  kind: PointKind;
  points: number;
  eventId: string;
  applicationId: string;
}) => Promise<unknown | null>;

type PlanVote = {
  vote: VoteRow;
  ranked: AudienceRanked[];
  total: number;
  podium: AudienceRanked[];
  who: Map<string, { userId: string; vehicleId: string | null }>;
};

/** Ce que le règlement écrira, calculé sans rien écrire (le récap s'en sert pour projeter les points). */
export async function planEvent(ex: Executor, event: EventRow): Promise<PlanVote[]> {
  const l = await loadEventVotes(ex, event);
  const rows = await eventVoteRows(ex, event.id);
  const out: PlanVote[] = [];
  for (const vote of l.votes) {
    const { candidates } = ruleOfVote(l, vote);
    const { ranked, total } = rankVote(
      rows.filter((r) => r.voteId === vote.id),
      candidates,
    );
    out.push({
      vote,
      ranked,
      total,
      podium: votePodium(ranked, total),
      who: new Map(candidates.map((c) => [c.applicationId, { userId: c.userId, vehicleId: c.vehicleId }])),
    });
  }
  return out;
}

/** Meilleur podium de chaque voiture de l'événement (« une voiture garde son meilleur podium »). */
export function bestPodiums(plan: readonly PlanVote[]) {
  const flat = plan.flatMap((p) =>
    p.podium.map((r) => ({
      key: p.who.get(r.applicationId)?.vehicleId ?? r.applicationId,
      rank: r.rank,
      voteId: p.vote.id,
      applicationId: r.applicationId,
      userId: p.who.get(r.applicationId)?.userId ?? "",
    })),
  );
  return bestRankPerVehicle(flat);
}

async function podiumSettings() {
  return {
    "points.vote_first": await settingsStore.get("points.vote_first"),
    "points.vote_second": await settingsStore.get("points.vote_second"),
    "points.vote_third": await settingsStore.get("points.vote_third"),
  };
}

/** Points que le règlement donnerait à une personne (projection du récap) : le meilleur rang de chacune de ses voitures. */
export async function projectedPodiumPoints(ex: Executor, event: EventRow, userId: string): Promise<number> {
  const plan = await planEvent(ex, event);
  const settings = await podiumSettings();
  let total = 0;
  for (const best of bestPodiums(plan).values()) if (best.userId === userId) total += podiumPoints(settings, best.rank);
  return total;
}

export const votesSettle = {
  /**
   * Règle tous les votes de l'événement. Renvoie les comptes qui ont reçu des points (leur grade sera recalculé) et le
   * premier de « Toutes catégories » (tampon rare du passeport) : le nouveau, ou celui d'un règlement déjà fait.
   */
  async settleEvent(ex: Executor, event: EventRow, award: Award) {
    await closeDueVotes(ex, event);
    const plan = await planEvent(ex, event);
    const settings = await podiumSettings();
    const awarded = new Set<string>();
    let winner: { userId: string; applicationId: string } | null = null;

    // 1. Résultats et trophées, vote par vote.
    const freshTrophy = new Set<string>();
    for (const p of plan) {
      const first = p.podium[0];
      const kept = p.ranked.filter((r) => r.votes > 0).slice(0, AUDIENCE_PRIZE_RESULTS_KEPT);
      if (kept.length) {
        await ex
          .insert(audiencePrizeResults)
          .values(
            kept.map((r) => ({
              eventId: event.id,
              voteId: p.vote.id,
              applicationId: r.applicationId,
              rank: r.rank,
              votes: r.votes,
              winner: first?.applicationId === r.applicationId,
            })),
          )
          .onConflictDoNothing();
      }
      for (const r of p.podium) {
        const who = p.who.get(r.applicationId);
        if (!who?.vehicleId) continue;
        const [row] = await ex
          .insert(vehicleTrophies)
          .values({
            vehicleId: who.vehicleId,
            voteId: p.vote.id,
            eventId: event.id,
            eventTitle: event.title,
            voteTitle: p.vote.title,
            rank: r.rank,
            awardedAt: event.endsAt,
          })
          .onConflictDoNothing()
          .returning({ id: vehicleTrophies.id });
        if (row) freshTrophy.add(`${p.vote.id}:${r.applicationId}`);
      }
      if (p.vote.rareStamp && first) {
        const who = p.who.get(first.applicationId);
        if (who) winner = { userId: who.userId, applicationId: first.applicationId };
        // Le compteur de la voiture ne monte qu'avec un trophée neuf (un règlement rejoué ne le recompte pas).
        if (who?.vehicleId && freshTrophy.has(`${p.vote.id}:${first.applicationId}`)) {
          await ex
            .update(vehicles)
            .set({ audiencePrizes: sql`${vehicles.audiencePrizes} + 1` })
            .where(eq(vehicles.id, who.vehicleId));
        }
      }
    }

    // 2. Une ligne de points par voiture : son meilleur rang de l'événement.
    const best = bestPodiums(plan);
    for (const b of best.values()) {
      const points = podiumPoints(settings, b.rank);
      // Barème à 0 : le podium est décerné (trophée, notification), sans ligne de points.
      if (points <= 0) continue;
      const entry = await award({
        userId: b.userId,
        kind: "vote_podium",
        points,
        eventId: event.id,
        applicationId: b.applicationId,
      });
      if (entry) awarded.add(b.userId);
    }

    // 3. Notifications : une par trophée neuf.
    const bestVoteOf = new Map([...best.values()].map((b) => [b.applicationId, b]));
    for (const p of plan) {
      for (const r of p.podium) {
        if (!freshTrophy.has(`${p.vote.id}:${r.applicationId}`)) continue;
        const who = p.who.get(r.applicationId);
        if (!who) continue;
        const mine = bestVoteOf.get(r.applicationId);
        const points = mine && mine.voteId === p.vote.id ? podiumPoints(settings, r.rank) : 0;
        const common = {
          eventId: event.id,
          data: { eventId: event.id, voteId: p.vote.id, applicationId: r.applicationId, rank: r.rank, screen: "recap" },
          link: { label: "Voir mon récap", path: `/app/recap/${event.id}` },
        };
        if (r.rank === 1) {
          await notificationsService.notify(ex, who.userId, "vote_won", {
            ...common,
            title: voteTexts.wonTitle(p.vote.title),
            body: voteTexts.wonBody(p.vote.title, event.title, points, p.vote.rareStamp),
          });
        } else {
          await notificationsService.notify(ex, who.userId, "vote_podium", {
            ...common,
            title: voteTexts.podiumTitle(p.vote.title, r.rank),
            body: voteTexts.podiumBody(p.vote.title, event.title, r.rank),
          });
        }
      }
    }

    return { awardedUserIds: awarded, winner };
  },
};
