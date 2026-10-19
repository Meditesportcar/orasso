// Prix du public (lot 49, ARCHITECTURE-DA-V2 § 5.5, V11, prototype DA v2 `s-vote`) : « une voix, une seule, pas pour
// toi-même ». Votent les pointés, les billets scannés et le staff présent, du premier pointage à la fin de l'événement ;
// le classement bouge en direct (canal `event:{id}:votes`) ; au règlement de J+2 : résultats (top 10), et au gagnant
// des points (`points.audience_prize`, 50 par défaut, H6), le compteur du véhicule, un tampon rare et une notification.
import {
  AUDIENCE_PRIZE_RESULTS_KEPT,
  type AudiencePrizeBoard,
  type AudiencePrizeEntry,
  type AudiencePrizeMine,
  type AudienceRanked,
  type AudienceVoter,
  type AudienceVotesChanged,
  type AudienceVoteWindow,
  audiencePrizeTexts,
  audienceWinner,
  canVote,
  isOwnVehicle,
  type PointKind,
  pointsForWinner,
  rankResults,
  voteClosesAt,
  voteOpen,
} from "@orasso/shared";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  audiencePrizeResults,
  audienceVotes,
  checkins,
  profiles,
  tickets,
  user,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, notFound } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { settingsStore } from "../../lib/settings";
import { storage } from "../../lib/storage";
import { type Executor, withTx } from "../../lib/tx";
import { type EventRow, eventsRepo } from "../events/repo";
import { assertCanSeeEvent, canSeeEvent } from "../invitations/access";
import { notificationsService } from "../notifications/service";
import { isVerifiedStaff } from "../passport/presence";

type Award = (entry: {
  userId: string;
  kind: PointKind;
  points: number;
  eventId: string;
  applicationId: string;
}) => Promise<unknown | null>;

/**
 * Véhicules pointés de l'événement (candidatures de véhicules entrées), du premier au dernier entré. Les comptes
 * supprimés (anonymisés) sortent du classement et du prix : ni points ni notification à un compte supprimé.
 */
async function enteredVehicles(ex: Executor, eventId: string) {
  return ex
    .select({
      applicationId: checkins.applicationId,
      checkedInAt: checkins.checkedInAt,
      userId: applications.userId,
      vehicleId: applications.vehicleId,
    })
    .from(checkins)
    .innerJoin(applications, eq(applications.id, checkins.applicationId))
    .innerJoin(profiles, eq(profiles.userId, applications.userId))
    .where(and(eq(checkins.eventId, eventId), eq(applications.kind, "vehicle"), isNull(profiles.deletedAt)))
    .orderBy(asc(checkins.checkedInAt));
}

function windowOf(event: EventRow, entered: { checkedInAt: Date }[]): AudienceVoteWindow {
  return {
    status: event.status,
    endsAt: event.endsAt,
    firstCheckinAt: entered[0]?.checkedInAt ?? null,
    vehiclesCheckedIn: entered.length,
  };
}

/** Ce qui fait de la personne un votant : un véhicule pointé, un billet scanné, une présence au staff. */
async function voterOf(
  ex: Executor,
  eventId: string,
  userId: string,
  entered: { userId: string; checkedInAt: Date }[],
) {
  const [ticket] = await ex
    .select({ usedAt: sql<Date | null>`min(${tickets.usedAt})` })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), eq(tickets.userId, userId), isNotNull(tickets.usedAt)));
  const mine = entered.filter((e) => e.userId === userId);
  const ticketScannedAt = ticket?.usedAt ? new Date(ticket.usedAt) : null;
  return {
    checkedInAt: mine[0]?.checkedInAt ?? null,
    ticketScannedAt,
    // Staff présent vérifiable : une trace du jour J (relecture du lot 49).
    staffPresent: await isVerifiedStaff(ex, eventId, userId),
  } satisfies AudienceVoter;
}

async function ranking(ex: Executor, eventId: string) {
  const entered = await enteredVehicles(ex, eventId);
  const votes = await ex
    .select({ applicationId: audienceVotes.applicationId })
    .from(audienceVotes)
    .where(eq(audienceVotes.eventId, eventId));
  const ranked = rankResults(votes, entered);
  const total = ranked.reduce((n, r) => n + r.votes, 0);
  return { entered, ranked, total };
}

/** Nom du véhicule, pseudo et première photo, pour les lignes du classement. */
async function cards(ex: Executor, applicationIds: string[]) {
  if (!applicationIds.length)
    return new Map<string, { vehicleLabel: string; pseudo: string; photoUrl: string | null }>();
  const rows = await ex
    .select({
      applicationId: applications.id,
      make: vehicleMakes.name,
      makeOther: vehicleMakes.isOther,
      model: vehicleModels.name,
      modelOther: vehicleModels.isOther,
      generation: vehicleGenerations.name,
      generationOther: vehicleGenerations.isOther,
      pseudo: profiles.pseudo,
      photoKey: sql<string | null>`(select ${vehiclePhotos.storageKey} from ${vehiclePhotos}
        where ${vehiclePhotos.vehicleId} = ${vehicles.id} order by ${vehiclePhotos.position} limit 1)`,
    })
    .from(applications)
    .innerJoin(vehicles, eq(vehicles.id, applications.vehicleId))
    .innerJoin(vehicleMakes, eq(vehicleMakes.id, vehicles.makeId))
    .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .leftJoin(vehicleGenerations, eq(vehicleGenerations.id, vehicles.generationId))
    .innerJoin(profiles, eq(profiles.userId, applications.userId))
    .where(inArray(applications.id, applicationIds));
  return new Map(
    rows.map((r) => {
      const parts = [r.makeOther ? null : r.make, r.modelOther ? null : r.model];
      if (r.generation && !r.generationOther) parts.push(r.generation);
      const label = parts.filter(Boolean).join(" ") || "Autre véhicule";
      return [r.applicationId, { vehicleLabel: label, pseudo: r.pseudo, photoUrl: storage.url(r.photoKey) }];
    }),
  );
}

async function entries(ex: Executor, ranked: readonly AudienceRanked[]): Promise<AudiencePrizeEntry[]> {
  const byApp = await cards(
    ex,
    ranked.map((r) => r.applicationId),
  );
  return ranked.map((r) => ({
    applicationId: r.applicationId,
    vehicleLabel: byApp.get(r.applicationId)?.vehicleLabel ?? "Autre véhicule",
    pseudo: byApp.get(r.applicationId)?.pseudo ?? "",
    photoUrl: byApp.get(r.applicationId)?.photoUrl ?? null,
    votes: r.votes,
    rank: r.rank,
  }));
}

/**
 * Événement publié (ou passé), visible des connectés ; un brouillon n'a pas de prix du public. Événement privé sur
 * invitation (lot 25) : `403 invite_only` pour qui n'en est pas ayant droit, sans rien de l'événement.
 */
async function visibleEvent(eventId: string, v: Viewer): Promise<EventRow> {
  const event = await eventsRepo.byId(eventId).catch(() => null);
  if (!event || event.status === "draft") throw notFound("Événement introuvable");
  await assertCanSeeEvent(event, v);
  return event;
}

const refusal = {
  vote_closed: () => new AppError(409, "vote_closed", audiencePrizeTexts.errors.vote_closed),
  vote_not_open: () => new AppError(409, "vote_not_open", audiencePrizeTexts.errors.vote_not_open),
  not_checked_in: () => new AppError(403, "not_checked_in", audiencePrizeTexts.errors.not_checked_in),
};

/** Classement réduit diffusé (`votes.changed`). */
async function publishNow(eventId: string) {
  const { ranked, total } = await ranking(db, eventId);
  const payload: AudienceVotesChanged = {
    total,
    top3: ranked.slice(0, 3).map((r) => ({ applicationId: r.applicationId, votes: r.votes, rank: r.rank })),
  };
  realtime.publish(`event:${eventId}:votes`, "votes.changed", payload);
}

/** Diffusions regroupées : au plus une par seconde et par événement (la dernière part en fin de seconde). */
const PUBLISH_EVERY_MS = 1_000;
const lastPublish = new Map<string, number>();
const pendingPublish = new Map<string, ReturnType<typeof setTimeout>>();

async function publishVotes(eventId: string) {
  if (pendingPublish.has(eventId)) return;
  const wait = (lastPublish.get(eventId) ?? 0) + PUBLISH_EVERY_MS - Date.now();
  if (wait <= 0) {
    lastPublish.set(eventId, Date.now());
    await publishNow(eventId);
    return;
  }
  const timer = setTimeout(() => {
    pendingPublish.delete(eventId);
    lastPublish.set(eventId, Date.now());
    publishNow(eventId).catch((error) => console.error("Classement du prix du public non diffusé :", error));
  }, wait);
  timer.unref?.();
  pendingPublish.set(eventId, timer);
}

/** Lignes du classement renvoyées en direct (les premiers ; la position de chacun est dans le récap). */
const BOARD_LIMIT = 100;

export const audiencePrizeService = {
  /** `PUT /events/:id/audience-prize/vote` : une voix, modifiable jusqu'à la clôture. */
  async vote(v: Viewer, eventId: string, applicationId: string): Promise<AudiencePrizeMine> {
    rateLimit("audienceVote", v.user.id);
    const event = await visibleEvent(eventId, v);
    await withTx(async (tx, after) => {
      const entered = await enteredVehicles(tx, eventId);
      const voter = await voterOf(tx, eventId, v.user.id, entered);
      const reason = canVote(voter, windowOf(event, entered), now());
      if (reason) throw refusal[reason]();
      const target = entered.find((e) => e.applicationId === applicationId);
      if (!target) throw new AppError(400, "validation_error", audiencePrizeTexts.errors.not_present);
      const owner = target.vehicleId
        ? await tx.query.vehicles.findFirst({ where: eq(vehicles.id, target.vehicleId), columns: { ownerId: true } })
        : undefined;
      if (isOwnVehicle(v.user.id, { userId: target.userId, vehicleOwnerId: owner?.ownerId ?? null })) {
        throw new AppError(400, "own_vehicle", audiencePrizeTexts.errors.own_vehicle);
      }
      const t = now();
      await tx
        .insert(audienceVotes)
        .values({ eventId, voterUserId: v.user.id, applicationId, createdAt: t, updatedAt: t })
        .onConflictDoUpdate({
          target: [audienceVotes.eventId, audienceVotes.voterUserId],
          set: { applicationId, updatedAt: t },
        });
      after(() => publishVotes(eventId));
    });
    return this.mine(v, eventId);
  },

  /** `GET /events/:id/audience-prize/mine` : puis-je voter, pour qui j'ai voté, mon heure d'entrée. */
  async mine(v: Viewer, eventId: string): Promise<AudiencePrizeMine> {
    const event = await visibleEvent(eventId, v);
    const entered = await enteredVehicles(db, eventId);
    const voter = await voterOf(db, eventId, v.user.id, entered);
    const window = windowOf(event, entered);
    const reason = canVote(voter, window, now());
    const vote = await db.query.audienceVotes.findFirst({
      where: and(eq(audienceVotes.eventId, eventId), eq(audienceVotes.voterUserId, v.user.id)),
    });
    const own = await db
      .select({ id: applications.id })
      .from(applications)
      .leftJoin(vehicles, eq(vehicles.id, applications.vehicleId))
      .where(
        and(
          eq(applications.eventId, eventId),
          sql`(${applications.userId} = ${v.user.id} or ${vehicles.ownerId} = ${v.user.id})`,
        ),
      );
    return {
      canVote: reason === null,
      reason,
      open: voteOpen(window, now()),
      closesAt: voteClosesAt(event).toISOString(),
      checkedInAt: (voter.checkedInAt ?? voter.ticketScannedAt)?.toISOString() ?? null,
      votedFor: vote?.applicationId ?? null,
      votedAt: vote?.updatedAt.toISOString() ?? null,
      ownApplicationIds: own.map((o) => o.id),
    };
  },

  /** `GET /events/:id/audience-prize` : classement en direct, ou résultats figés après le règlement. */
  async board(v: Viewer, eventId: string): Promise<AudiencePrizeBoard> {
    const event = await visibleEvent(eventId, v);
    const { entered, ranked, total } = await ranking(db, eventId);
    const winnerPoints = pointsForWinner({ "points.audience_prize": await settingsStore.get("points.audience_prize") });
    const results = await db.query.audiencePrizeResults.findMany({
      where: eq(audiencePrizeResults.eventId, eventId),
      orderBy: [asc(audiencePrizeResults.rank)],
    });
    const settled = Boolean(event.settledAt) && results.length > 0;
    const list = settled
      ? await entries(
          db,
          results.map((r) => ({ applicationId: r.applicationId, votes: r.votes, rank: r.rank })),
        )
      : await entries(db, ranked.slice(0, BOARD_LIMIT));
    const winnerRow = results.find((r) => r.winner);
    return {
      eventId,
      open: voteOpen(windowOf(event, entered), now()),
      closesAt: voteClosesAt(event).toISOString(),
      settled,
      total,
      vehicles: entered.length,
      winnerPoints,
      entries: list,
      winner: winnerRow ? (list.find((e) => e.applicationId === winnerRow.applicationId) ?? null) : null,
    };
  },

  /** Rang d'une personne (meilleur de ses véhicules pointés) : récap. */
  async rankOf(eventId: string, userId: string) {
    const { entered, ranked, total } = await ranking(db, eventId);
    const mine = new Set(entered.filter((e) => e.userId === userId).map((e) => e.applicationId));
    const best = ranked.find((r) => mine.has(r.applicationId)) ?? null;
    const winner = audienceWinner(ranked, total);
    return {
      best,
      of: ranked.length,
      total,
      projectedWinner: winner && mine.has(winner.applicationId) ? winner : null,
    };
  },

  /**
   * Règlement de J+2 (dans sa transaction) : résultats (top 10) ; gagnant (2 véhicules et 3 voix au moins) → points,
   * compteur du véhicule, notification. Renvoie le gagnant pour le tampon rare ; rejoué, ne refait rien.
   */
  async settle(ex: Executor, event: EventRow, award: Award) {
    const already = await ex.query.audiencePrizeResults.findFirst({
      where: eq(audiencePrizeResults.eventId, event.id),
    });
    const { entered, ranked, total } = await ranking(ex, event.id);
    if (already) {
      const w = await ex.query.audiencePrizeResults.findFirst({
        where: and(eq(audiencePrizeResults.eventId, event.id), eq(audiencePrizeResults.winner, true)),
      });
      const app = w ? entered.find((e) => e.applicationId === w.applicationId) : undefined;
      return app ? { userId: app.userId, applicationId: app.applicationId, awarded: false } : null;
    }
    const kept = ranked.filter((r) => r.votes > 0).slice(0, AUDIENCE_PRIZE_RESULTS_KEPT);
    const winner = audienceWinner(ranked, total);
    if (kept.length) {
      await ex.insert(audiencePrizeResults).values(
        kept.map((r) => ({
          eventId: event.id,
          applicationId: r.applicationId,
          rank: r.rank,
          votes: r.votes,
          winner: winner?.applicationId === r.applicationId,
        })),
      );
    }
    if (!winner) return null;
    const app = entered.find((e) => e.applicationId === winner.applicationId);
    if (!app) return null;
    const points = pointsForWinner({ "points.audience_prize": await settingsStore.get("points.audience_prize") });
    // Barème à 0 : le prix est décerné (compteur, tampon, notification), sans ligne de points.
    const entry =
      points > 0
        ? await award({
            userId: app.userId,
            kind: "audience_prize",
            points,
            eventId: event.id,
            applicationId: app.applicationId,
          })
        : null;
    if (app.vehicleId) {
      await ex
        .update(vehicles)
        .set({ audiencePrizes: sql`${vehicles.audiencePrizes} + 1` })
        .where(eq(vehicles.id, app.vehicleId));
    }
    await notificationsService.notify(ex, app.userId, "audience_prize_won", {
      title: audiencePrizeTexts.wonTitle,
      body: audiencePrizeTexts.wonBody(event.title, points),
      eventId: event.id,
      data: { eventId: event.id, applicationId: app.applicationId, screen: "recap" },
      link: { label: "Voir mon récap", path: `/app/recap/${event.id}` },
    });
    return { userId: app.userId, applicationId: app.applicationId, awarded: Boolean(entry) };
  },

  /** Abonnement au canal `event:{id}:votes` : toute personne connectée, événement publié. */
  async canSubscribe(userId: string, channel: string): Promise<boolean> {
    const id = /^event:([0-9a-f-]{36}):votes$/.exec(channel)?.[1];
    if (!id) return false;
    const event = await eventsRepo.byId(id).catch(() => null);
    if (event?.status !== "published") return false;
    if (event.admission !== "invite_only") return true;
    // Événement privé : mêmes ayants droit que sa page (lot 25).
    const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
    if (!u || !profile) return false;
    return canSeeEvent(event, { user: u as Viewer["user"], profile, session: { secondFactor: null } });
  },
};
