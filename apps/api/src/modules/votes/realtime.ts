// Temps réel des votes (canal `event:{id}:votes`) : aucun classement ne circule, seulement « quelque chose a changé ».
// `votes.changed { voteId, total, state, top3: [] }` (`top3` toujours vide : l'APK R6-police l'applique sans le tester, retrait
// en R8) **pour « Toutes catégories » seulement** (tour 2 : l'APK en ligne affiche ce total comme celui du prix du public) ;
// les votes à thème émettent `theme_votes.changed { voteId, total, state }` (R7l2, R7l3) ; `votes.opened { voteId }`, `votes.closed { voteId }`, `votes.candidates.changed { voteId? }`.

import { voteState } from "@orasso/shared";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import { eventVotes } from "../../db/schema";
import { now } from "../../lib/deps";
import { realtime } from "../../lib/realtime";
import { eventsRepo } from "../events/repo";
import { candidatesOf, contextOf, enteredVehicles, handCandidates, rankVote, toRuleVote } from "./context";
import { audienceVotesOf } from "./counts";

const channel = (eventId: string) => `event:${eventId}:votes`;

export const votesRealtime = {
  /** Invalidation de la grille après un changement de pointage ou de candidats ; aucune voix ni identité diffusée. */
  candidatesChanged(eventId: string, voteId?: string) {
    realtime.publish(channel(eventId), "votes.candidates.changed", voteId ? { voteId } : {});
  },
  opened(eventId: string, voteId: string) {
    realtime.publish(channel(eventId), "votes.opened", { voteId });
  },
  closed(eventId: string, voteId: string) {
    realtime.publish(channel(eventId), "votes.closed", { voteId });
    // L'APK en ligne ignore `votes.closed` : cette invalidation lui fait recharger `/mine` et cesser de proposer de voter.
    realtime.publish(channel(eventId), "votes.candidates.changed", { voteId });
  },
  /** Diffuse l'état d'un vote : son total et son état, jamais son classement. */
  async changedNow(eventId: string, voteId: string) {
    const row = await db.query.eventVotes.findFirst({
      where: and(eq(eventVotes.id, voteId), eq(eventVotes.eventId, eventId), isNull(eventVotes.deletedAt)),
    });
    if (!row) return;
    const event = await eventsRepo.byId(eventId);
    const entered = await enteredVehicles(db, eventId);
    const hand = (await handCandidates(db, [row.id])).get(row.id);
    const candidates = candidatesOf(row, entered, hand);
    const { total } = rankVote(await audienceVotesOf(db, voteId), candidates);
    const state = voteState(toRuleVote(row), contextOf(event, entered, candidates, hand), now());
    if (row.kind === "all_categories") {
      realtime.publish(channel(eventId), "votes.changed", { voteId, total, state, top3: [] });
    } else {
      realtime.publish(channel(eventId), "theme_votes.changed", { voteId, total, state });
    }
  },
};

/** Diffusions regroupées : au plus une par seconde et par vote (la dernière part en fin de seconde). */
const PUBLISH_EVERY_MS = 1_000;
const lastPublish = new Map<string, number>();
const pendingPublish = new Map<string, ReturnType<typeof setTimeout>>();

export async function publishVotes(eventId: string, voteId: string) {
  const key = `${eventId}:${voteId}`;
  if (pendingPublish.has(key)) return;
  const wait = (lastPublish.get(key) ?? 0) + PUBLISH_EVERY_MS - Date.now();
  if (wait <= 0) {
    lastPublish.set(key, Date.now());
    await votesRealtime.changedNow(eventId, voteId);
    return;
  }
  const timer = setTimeout(() => {
    pendingPublish.delete(key);
    lastPublish.set(key, Date.now());
    votesRealtime.changedNow(eventId, voteId).catch((error) => console.error("Vote non diffusé :", error));
  }, wait);
  timer.unref?.();
  pendingPublish.set(key, timer);
}
