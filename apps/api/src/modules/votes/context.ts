// Lectures communes des votes (lot R7l1) : les véhicules entrés, les candidats de chaque vote, la preuve de présence d'un
// votant, les lignes du classement. Rien ici n'écrit, sauf `ensureAllCategories` (création d'office, idempotente).
import {
  ALL_CATEGORIES_TITLE,
  type AudienceRanked,
  type AudienceVoter,
  type EventVote,
  matchesCandidateRule,
  rankResults,
  type VoteCandidateFilter,
  type VoteContext,
  type VoteState,
  vehicleName,
  voteState,
} from "@orasso/shared";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  audienceVotes,
  checkins,
  eventVoteCandidates,
  eventVotes,
  profiles,
  tickets,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import type { EventRow } from "../events/repo";
import { isVerifiedStaff } from "../passport/presence";
import { gpsPresentAt } from "../presence/repo";

export type VoteRow = typeof eventVotes.$inferSelect;

/** Un véhicule entré (candidature de véhicule pointée), avec ce que les règles de candidats lisent. */
export type EnteredVehicle = {
  applicationId: string;
  checkedInAt: Date;
  userId: string;
  vehicleId: string | null;
  country: string | null;
  makeId: string | null;
  zoneId: string | null;
};

/**
 * Véhicules pointés de l'événement (candidatures de véhicules entrées), du premier au dernier entré. Les comptes
 * supprimés (anonymisés) sortent du classement et des prix : ni points ni notification à un compte supprimé.
 */
export async function enteredVehicles(ex: Executor, eventId: string): Promise<EnteredVehicle[]> {
  return ex
    .select({
      applicationId: checkins.applicationId,
      checkedInAt: checkins.checkedInAt,
      userId: applications.userId,
      vehicleId: applications.vehicleId,
      country: vehicleMakes.country,
      makeId: vehicles.makeId,
      zoneId: applications.zoneId,
    })
    .from(checkins)
    .innerJoin(applications, eq(applications.id, checkins.applicationId))
    .innerJoin(profiles, eq(profiles.userId, applications.userId))
    .leftJoin(vehicles, eq(vehicles.id, applications.vehicleId))
    .leftJoin(vehicleMakes, eq(vehicleMakes.id, vehicles.makeId))
    .where(and(eq(checkins.eventId, eventId), eq(applications.kind, "vehicle"), isNull(profiles.deletedAt)))
    .orderBy(asc(checkins.checkedInAt), asc(checkins.applicationId));
}

/** Votes encore présents de l'événement, dans l'ordre de l'organisateur. */
export async function activeVotes(ex: Executor, eventId: string): Promise<VoteRow[]> {
  return ex
    .select()
    .from(eventVotes)
    .where(and(eq(eventVotes.eventId, eventId), isNull(eventVotes.deletedAt)))
    .orderBy(asc(eventVotes.position), asc(eventVotes.createdAt), asc(eventVotes.id));
}

/**
 * Le vote « Toutes catégories » est présent d'office (ARCHITECTURE-R7 § 1.3). Créé ici s'il n'a jamais existé pour cet
 * événement (création, duplication, récurrence, événement ancien) ; un vote retiré par l'organisateur ne revient pas (l'index
 * unique compte aussi les lignes retirées). Un événement annulé n'en reçoit pas.
 */
export async function ensureAllCategories(ex: Executor, event: Pick<EventRow, "id" | "status" | "endsAt">) {
  if (event.status === "cancelled") return;
  const existing = await ex
    .select({ id: eventVotes.id })
    .from(eventVotes)
    .where(and(eq(eventVotes.eventId, event.id), eq(eventVotes.kind, "all_categories")))
    .limit(1);
  if (existing.length) return;
  await ex
    .insert(eventVotes)
    .values({
      eventId: event.id,
      title: ALL_CATEGORIES_TITLE,
      kind: "all_categories",
      candidateMode: "all",
      openMode: "first_entry",
      rareStamp: true,
      position: 0,
      closesAt: event.endsAt,
    })
    .onConflictDoNothing();
}

export const toRuleVote = (row: VoteRow): EventVote => ({
  kind: row.kind,
  openMode: row.openMode,
  opensAt: row.opensAt,
  durationMinutes: row.durationMinutes,
  openedAt: row.openedAt,
  closedAt: row.closedAt,
  createdAt: row.createdAt,
});

/** Candidats choisis à la main, par vote, avec l'heure du choix. */
export async function handCandidates(ex: Executor, voteIds: string[]): Promise<Map<string, Map<string, Date>>> {
  const out = new Map<string, Map<string, Date>>();
  if (!voteIds.length) return out;
  const rows = await ex
    .select({
      voteId: eventVoteCandidates.voteId,
      applicationId: eventVoteCandidates.applicationId,
      addedAt: eventVoteCandidates.addedAt,
    })
    .from(eventVoteCandidates)
    .where(inArray(eventVoteCandidates.voteId, voteIds));
  for (const r of rows) {
    const map = out.get(r.voteId) ?? new Map<string, Date>();
    map.set(r.applicationId, r.addedAt);
    out.set(r.voteId, map);
  }
  return out;
}

/**
 * Fige l'ensemble des candidats d'un vote à sa clôture (modes `all`, `origins` et `zone`) dans `event_vote_candidates`
 * (source `rule`) : le classement et le règlement ne lisent plus que lui, un changement de zone ou de marque après la
 * clôture ne retire plus un candidat élu. Idempotent ; sans effet pour un vote à la main (déjà figé par ses choix).
 */
export async function freezeCandidates(
  ex: Executor,
  vote: Pick<VoteRow, "id" | "candidateMode">,
  candidates: readonly EnteredVehicle[],
) {
  if (vote.candidateMode === "hand" || !candidates.length) return;
  await ex
    .insert(eventVoteCandidates)
    .values(candidates.map((c) => ({ voteId: vote.id, applicationId: c.applicationId, source: "rule" as const })))
    .onConflictDoNothing();
}

/** Fige les votes de l'événement clos par la durée ou la fin de l'événement que le balayage n'a pas encore constatés. */
export async function freezeClosedVotes(ex: Executor, event: EventRow) {
  const l = await loadEventVotes(ex, event);
  for (const vote of l.votes) {
    if (vote.candidateMode === "hand" || l.hand.get(vote.id)?.size) continue;
    const { candidates, state } = ruleOfVote(l, vote);
    if (state === "closed") await freezeCandidates(ex, vote, candidates);
  }
}

/** Les véhicules entrés qui concourent à ce vote, selon son mode (du premier au dernier entré). */
export function candidatesOf(
  vote: Pick<VoteRow, "candidateMode" | "candidateFilter" | "closedAt">,
  entered: readonly EnteredVehicle[],
  hand: ReadonlyMap<string, Date> | undefined,
): EnteredVehicle[] {
  if (vote.candidateMode === "hand") return entered.filter((e) => hand?.has(e.applicationId));
  // Un vote clos dont les candidats ont été figés (tour 2) ne relit plus la zone ni la marque d'aujourd'hui.
  if (vote.closedAt && hand?.size) return entered.filter((e) => hand.has(e.applicationId));
  const filter = (vote.candidateFilter ?? null) as VoteCandidateFilter | null;
  return entered.filter((e) => matchesCandidateRule(vote.candidateMode, filter, e));
}

/** Ce que la règle lit de l'événement, pour un vote dont on connaît les candidats entrés. */
export function contextOf(
  event: Pick<EventRow, "status" | "endsAt">,
  entered: readonly EnteredVehicle[],
  candidates: readonly EnteredVehicle[],
  hand?: ReadonlyMap<string, Date>,
): VoteContext {
  // Quand un candidat est devenu disponible : son entrée, et pour un vote à la main, son choix s'il est venu après.
  const ready = candidates
    .map((c) => {
      const added = hand?.get(c.applicationId);
      return added && added > c.checkedInAt ? added : c.checkedInAt;
    })
    .sort((a, b) => a.getTime() - b.getTime());
  return {
    status: event.status,
    endsAt: event.endsAt,
    firstCheckinAt: entered[0]?.checkedInAt ?? null,
    candidatesReadyAt: ready[1] ?? null,
    candidatesEntered: candidates.length,
  };
}

/** Classement d'un vote : les candidats entrés, avec les voix qui leur sont données. */
export function rankVote(votes: readonly { applicationId: string }[], candidates: readonly EnteredVehicle[]) {
  const ids = new Set(candidates.map((c) => c.applicationId));
  const counted = votes.filter((v) => ids.has(v.applicationId));
  const ranked: AudienceRanked[] = rankResults(counted, candidates);
  return { ranked, total: counted.length };
}

/** Toutes les voix de l'événement (vote, candidat, votant), pour calculer le classement de chaque vote d'un coup. */
export async function eventVoteRows(ex: Executor, eventId: string) {
  return ex
    .select({
      voteId: audienceVotes.voteId,
      applicationId: audienceVotes.applicationId,
      voterUserId: audienceVotes.voterUserId,
    })
    .from(audienceVotes)
    .where(eq(audienceVotes.eventId, eventId));
}

/** Ce qui fait de la personne un votant : un véhicule pointé, un billet scanné, une présence au staff ou par GPS. */
export async function voterOf(
  ex: Executor,
  eventId: string,
  userId: string,
  entered: readonly { userId: string; checkedInAt: Date }[],
): Promise<AudienceVoter> {
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
    // Lot R7d1 : la présence validée par GPS (visiteur sans voiture) donne aussi le droit de vote.
    gpsPresentAt: await gpsPresentAt(ex, eventId, userId),
  };
}

export type Card = { vehicleLabel: string; pseudo: string; photoUrl: string | null };

/**
 * Nom du véhicule, pseudo et photo, pour les lignes du classement. La règle de `maskedPhoto` (première photo à plaque
 * floutée ou « aucune plaque visible », ou d'un véhicule sans plaque), écrite en SQL : jamais une photo à plaque lisible.
 */
export async function cards(ex: Executor, applicationIds: string[]): Promise<Map<string, Card>> {
  if (!applicationIds.length) return new Map();
  const rows = await ex
    .select({
      applicationId: applications.id,
      make: vehicleMakes.name,
      makeOther: vehicleMakes.isOther,
      model: vehicleModels.name,
      modelOther: vehicleModels.isOther,
      proposedMake: vehicles.proposedMake,
      proposedModel: vehicles.proposedModel,
      version: vehicles.version,
      generation: vehicleGenerations.name,
      generationOther: vehicleGenerations.isOther,
      pseudo: profiles.pseudo,
      photoKey: sql<string | null>`(select ${vehiclePhotos.storageKey} from ${vehiclePhotos}
        where ${vehiclePhotos.vehicleId} = ${vehicles.id}
          and (${vehiclePhotos.plateBlurred} or ${vehiclePhotos.noPlateConfirmed} or ${vehicles.unregistered})
        order by ${vehiclePhotos.position} limit 1)`,
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
      // Lot R4a : un niveau « Autre » prend le nom tapé (« Peugeot 207 CC »). Lot R4e, tour 2 : la composition commune.
      const label = vehicleName({
        make: r.makeOther ? r.proposedMake : r.make,
        model: r.modelOther ? r.proposedModel : r.model,
        generation: r.generation && !r.generationOther ? r.generation : null,
        version: r.version,
      });
      return [r.applicationId, { vehicleLabel: label, pseudo: r.pseudo, photoUrl: storage.url(r.photoKey) }];
    }),
  );
}

/** Lignes du classement avec leur carte (nom, pseudo, photo masquée). */
export async function rankingEntries(ex: Executor, ranked: readonly AudienceRanked[]) {
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

export type LoadedVotes = {
  event: EventRow;
  entered: EnteredVehicle[];
  votes: VoteRow[];
  hand: Map<string, Map<string, Date>>;
};

export async function loadEventVotes(ex: Executor, event: EventRow): Promise<LoadedVotes> {
  await ensureAllCategories(ex, event);
  const entered = await enteredVehicles(ex, event.id);
  const votes = await activeVotes(ex, event.id);
  const hand = await handCandidates(
    ex,
    votes.map((x) => x.id),
  );
  return { event, entered, votes, hand };
}

export function ruleOfVote(l: LoadedVotes, vote: VoteRow) {
  const candidates = candidatesOf(vote, l.entered, l.hand.get(vote.id));
  const ctx = contextOf(l.event, l.entered, candidates, l.hand.get(vote.id));
  const rv: EventVote = toRuleVote(vote);
  return { candidates, ctx, rv, state: voteState(rv, ctx, now()) as VoteState };
}
