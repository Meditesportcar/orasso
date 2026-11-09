// Vie des votes (lot R7l1) : ouverture et clôture constatées, notification « vote lancé », tâches `votes.open`,
// `votes.close` et `votes.sweep` (chaque minute). L'état d'un vote se déduit des règles (`voteState`) ; ici on constate
// l'instant (`opened_at`, `closed_at`) une seule fois (comparaison-et-pose), ce qui rend la notification unique.
import { type EventVote, type VoteContext, voteClosesAt, voteOpensAt, voteState, voteTexts } from "@orasso/shared";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { events, eventVotes } from "../../db/schema";
import { deps, now } from "../../lib/deps";
import { type Executor, withTx } from "../../lib/tx";
import { type EventRow, eventsRepo } from "../events/repo";
import { notificationsService } from "../notifications/service";
import { verifiedStaffIds } from "../passport/presence";
import {
  activeVotes,
  candidatesOf,
  closeIfDue,
  contextOf,
  ensureAllCategories,
  enteredVehicles,
  handCandidates,
  toRuleVote,
  type VoteRow,
} from "./context";
import { votesRealtime } from "./realtime";

type EventLike = EventRow;

/**
 * Les personnes présentes : véhicules entrés, billets contrôlés, présences validées par GPS, staff présent vérifiable.
 * Comptes supprimés exclus. Jamais une liste servie à un client : elle ne sert qu'à notifier.
 */
export async function presentUserIds(ex: Executor, eventId: string): Promise<string[]> {
  const rows = await ex.execute<{ user_id: string }>(sql`select distinct p.user_id from (
      select a.user_id from checkins c join applications a on a.id = c.application_id
        where c.event_id = ${eventId} and a.kind = 'vehicle'
      union select t.user_id from tickets t where t.event_id = ${eventId} and t.used_at is not null
      union select g.user_id from event_presences g where g.event_id = ${eventId}
    ) p join profiles pr on pr.user_id = p.user_id where pr.deleted_at is null`);
  const staff = await verifiedStaffIds(ex, eventId);
  return [...new Set([...rows.rows.map((r) => r.user_id), ...staff])];
}

/** « Vote lancé » aux présents (une seule fois par vote : l'appelant vient de poser `opened_at`). */
async function notifyOpened(tx: Executor, event: EventLike, vote: VoteRow) {
  const userIds = await presentUserIds(tx, event.id);
  await notificationsService.notifyMany(tx, userIds, "vote_opened", {
    title: voteTexts.openedTitle(vote.title),
    body: voteTexts.openedBody(event.title),
    eventId: event.id,
    eventStartsAt: event.startsAt,
    data: { eventId: event.id, voteId: vote.id, screen: "vote" },
    link: { label: "Voter", path: `/e/${event.slug}` },
  });
}

/**
 * Pose l'ouverture du vote une seule fois (comparaison-et-pose sur `opened_at IS NULL`). Renvoie vrai si c'est cet appel
 * qui l'a posée. Le lancement à la main, à l'heure ou au premier pointage d'un vote à thème prévient les présents ;
 * « Toutes catégories » au premier pointage, non (l'onglet s'allume, comportement du lot 49).
 */
export async function markOpened(
  tx: Executor,
  event: EventLike,
  vote: VoteRow,
  at: Date,
  notify: boolean,
): Promise<boolean> {
  const [row] = await tx
    .update(eventVotes)
    .set({ openedAt: at, updatedAt: now() })
    .where(and(eq(eventVotes.id, vote.id), isNull(eventVotes.openedAt), isNull(eventVotes.deletedAt)))
    .returning({ id: eventVotes.id });
  if (!row) return false;
  if (notify) await notifyOpened(tx, event, vote);
  return true;
}

/** Planifie les tâches d'ouverture (mode « à l'heure ») et de clôture d'un vote ; `votes.sweep` rattrape toute omission. */
export async function scheduleVoteJobs(
  event: Pick<EventLike, "id" | "endsAt" | "status" | "startsAt">,
  vote: VoteRow,
  ctx: Pick<VoteContext, "firstCheckinAt" | "candidatesReadyAt">,
) {
  if (event.status !== "published") return;
  const t = now();
  const rv: EventVote = toRuleVote(vote);
  if (vote.openMode === "at" && vote.opensAt && !vote.openedAt && vote.opensAt > t) {
    const at = vote.opensAt.toISOString();
    await deps.jobs.send("votes.open", { eventId: event.id, voteId: vote.id, at }, vote.opensAt, {
      singletonKey: `vote-open:${vote.id}:${at}`,
    });
  }
  const closes = voteClosesAt(rv, { endsAt: event.endsAt, ...ctx });
  if (!vote.closedAt && closes > t) {
    const at = closes.toISOString();
    await deps.jobs.send("votes.close", { eventId: event.id, voteId: vote.id, at }, closes, {
      singletonKey: `vote-close:${vote.id}:${at}`,
    });
  }
}

export const votesLifecycle = {
  /**
   * Constate ce qui est arrivé aux votes d'un événement : ouverture (premier pointage, heure fixée) et clôture (durée ou
   * fin de l'événement). Idempotent ; rejoué par les entrées, les tâches et le balayage.
   */
  async syncEvent(eventId: string): Promise<void> {
    const event = await eventsRepo.byId(eventId).catch(() => null);
    if (!event || event.status !== "published") return;
    await ensureAllCategories(db, event);
    const t = now();
    const entered = await enteredVehicles(db, eventId);
    const votes = await activeVotes(db, eventId);
    const hand = await handCandidates(
      db,
      votes.map((v) => v.id),
    );
    for (const vote of votes) {
      if (vote.closedAt) continue;
      const candidates = candidatesOf(vote, entered, hand.get(vote.id));
      const ctx = contextOf(event, entered, candidates, hand.get(vote.id));
      const rv = toRuleVote(vote);
      const state = voteState(rv, ctx, t);
      if (state === "closed") {
        // Clôture et figeage des candidats dans la même transaction (tour 3) : un échec ne laisse rien de posé.
        if (await withTx((tx) => closeIfDue(tx, event, vote.id))) votesRealtime.closed(eventId, vote.id);
      } else if (state === "open" && !vote.openedAt) {
        const at = voteOpensAt(rv, ctx) ?? t;
        const opened = await withTx((tx) => markOpened(tx, event, vote, at, vote.kind !== "all_categories"));
        if (opened) votesRealtime.opened(eventId, vote.id);
      }
    }
  },

  /** Un pointage a changé (entrée, retrait) : la grille se recharge, l'ouverture « au premier pointage » se constate. */
  async entriesChanged(eventId: string): Promise<void> {
    votesRealtime.candidatesChanged(eventId);
    // Un échec de la constatation ne doit jamais défaire ni interrompre un pointage : le balayage la rattrape.
    try {
      await votesLifecycle.syncEvent(eventId);
    } catch (error) {
      console.error("Ouverture des votes non constatée (rattrapée par le balayage) :", error);
    }
  },

  /** `votes.sweep` (chaque minute) : les événements en cours ou proches, dont un vote n'est pas constaté clos. */
  async sweep(): Promise<number> {
    const t = now();
    const rows = await db
      .selectDistinct({ id: events.id })
      .from(events)
      .innerJoin(eventVotes, eq(eventVotes.eventId, events.id))
      .where(
        and(
          eq(events.status, "published"),
          isNull(eventVotes.deletedAt),
          isNull(eventVotes.closedAt),
          gte(events.endsAt, new Date(t.getTime() - 86_400_000)),
          lte(events.startsAt, new Date(t.getTime() + 86_400_000)),
        ),
      );
    for (const r of rows) {
      try {
        await votesLifecycle.syncEvent(r.id);
      } catch (error) {
        console.error("Votes d'un événement non constatés :", error);
      }
    }
    return rows.length;
  },
};
