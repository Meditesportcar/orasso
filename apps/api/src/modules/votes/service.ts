// Votes à thème (lot R7l1, ARCHITECTURE-R7 § 2.7, décision D38). Le prix du public d'avant devient le vote « Toutes
// catégories » ; l'organisateur (propriétaire, co-organisateur) crée, lance et clôt des votes à thème, le staff lit. Toutes
// les règles sont ici et dans `rules/votes.ts` : l'écran ne filtre jamais seul (un classement montré trop tôt est une fuite).
import {
  type AudienceRanked,
  canSeeRanking,
  canVoteIn,
  decodeRotatingPayload,
  type EventVote,
  isOwnVehicle,
  podiumPoints,
  rankingHiddenReason,
  VOTE_BOARD_LIMIT,
  VOTE_CANDIDATES_PAGE,
  VOTE_LIST_PREVIEW,
  VOTES_PER_EVENT_MAX,
  type VoteCandidateAdd,
  type VoteCandidateAdded,
  type VoteCandidates,
  type VoteCreate,
  type VoteList,
  type VoteManage,
  type VoteManageItem,
  type VoteState,
  type VoteTemplates,
  type VoteUpdate,
  type VoteView,
  verifyPassPayload,
  verifyRotatingCode,
  voteClosesAt,
  voteCreateSchema,
  voteOpensAt,
  voteState,
  voteTemplates,
  voteTexts,
} from "@orasso/shared";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  accessPasses,
  adminAuditLog,
  applications,
  audiencePrizeResults,
  audienceVotes,
  checkins,
  eventVoteCandidates,
  eventVotes,
  eventZones,
  profiles,
  user,
  vehicles,
} from "../../db/schema";
import { env } from "../../env";
import {
  activeMembership,
  hasSecondFactor,
  isSuperAdmin,
  openAssistanceRequest,
  requireOrganizer,
  requireOrganizerWrite,
} from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { requestContext } from "../../lib/request-context";
import type { Viewer } from "../../lib/session";
import { ed25519Verify, signing } from "../../lib/signing";
import { type Executor, withTx } from "../../lib/tx";
import { parse } from "../../lib/validate";
import { ensureOtpSecrets } from "../access/service";
import { type EventRow, eventsRepo } from "../events/repo";
import { assertCanSeeEvent, canSeeEvent } from "../invitations/access";
import {
  activeVotes,
  candidatesOf,
  cards,
  contextOf,
  type EnteredVehicle,
  ensureAllCategories,
  enteredVehicles,
  eventVoteRows,
  freezeCandidates,
  handCandidates,
  type LoadedVotes,
  loadEventVotes,
  lockVote,
  rankingEntries,
  rankVote,
  ruleOfVote,
  toRuleVote,
  type VoteRow,
  voterOf,
} from "./context";
import { markOpened, scheduleVoteJobs, votesLifecycle } from "./lifecycle";
import { publishVotes, votesRealtime } from "./realtime";
import { podiumSettings } from "./settle";

const refusal = {
  vote_closed: () => new AppError(409, "vote_closed", voteTexts.errors.vote_closed),
  vote_not_open: () => new AppError(409, "vote_not_open", voteTexts.errors.vote_not_open),
  not_checked_in: () => new AppError(403, "not_checked_in", voteTexts.errors.not_checked_in),
};

/**
 * Événement publié (ou passé), visible des connectés ; un brouillon n'a pas de vote. Événement privé sur invitation :
 * `403 invite_only` pour qui n'en est pas ayant droit, sans rien de l'événement.
 */
export async function visibleEvent(eventId: string, v: Viewer): Promise<EventRow> {
  const event = await eventsRepo.byId(eventId).catch(() => null);
  if (!event || event.status === "draft") throw notFound("Événement introuvable");
  await assertCanSeeEvent(event, v);
  return event;
}

/**
 * L'équipe d'un événement : propriétaire, co-organisateurs et staff actif de la structure (règle C25), et le super admin en
 * assistance (second facteur prouvé par la session, demande d'aide ouverte, consultation tracée). Le classement lui est
 * toujours servi.
 */
export async function isEventTeam(ex: Executor, event: EventRow, v: Viewer): Promise<boolean> {
  const member = await activeMembership(v.user.id, event.structureId);
  if (member && (member.role === "owner" || member.role === "co_organizer" || member.role === "staff")) return true;
  if (!isSuperAdmin(v)) return false;
  if (!(env.DEV_SKIP_2FA || hasSecondFactor(v))) return false;
  if (!(await openAssistanceRequest(event.structureId))) return false;
  await ex.insert(adminAuditLog).values({
    actorUserId: v.user.id,
    action: "structure.view_as",
    targetType: "structure",
    targetId: event.structureId,
    structureId: event.structureId,
    reason: "audience_prize.ranking",
    ip: requestContext.get()?.ip ?? null,
  });
  return true;
}

/** Nombre de votes ouverts maintenant (bloc « En cours », fiche de l'événement). */
export async function openVotesCount(ex: Executor, event: EventRow): Promise<number> {
  if (event.status !== "published") return 0;
  const t = now();
  if (t >= event.endsAt) return 0;
  const l = await loadEventVotes(ex, event);
  return l.votes.filter((x) => ruleOfVote(l, x).state === "open").length;
}

/** La personne peut-elle voter maintenant dans un des votes de l'événement ? (La présence par GPS l'annonce.) */
export async function canVoteNow(ex: Executor, event: EventRow, userId: string): Promise<boolean> {
  const l = await loadEventVotes(ex, event);
  if (!l.votes.length) return false;
  const voter = await voterOf(ex, event.id, userId, l.entered);
  const t = now();
  return l.votes.some((x) => {
    const { rv, ctx } = ruleOfVote(l, x);
    return canVoteIn(voter, rv, ctx, t) === null;
  });
}

export const votesService = {
  // --- Passionné ---------------------------------------------------------------------------------------------------

  /** `GET /events/:id/votes` : les votes de l'événement, chacun avec mon droit de voter et le classement que j'ai le droit de voir. */
  async list(v: Viewer, eventId: string): Promise<VoteList> {
    const event = await visibleEvent(eventId, v);
    const l = await loadEventVotes(db, event);
    return { items: await views(v, l, l.votes, VOTE_LIST_PREVIEW) };
  },

  /** `GET /events/:id/votes/:voteId` : un vote en détail (classement jusqu'à 100 lignes si je peux le voir). */
  async get(v: Viewer, eventId: string, voteId: string): Promise<VoteView> {
    const event = await visibleEvent(eventId, v);
    const l = await loadEventVotes(db, event);
    const vote = l.votes.find((x) => x.id === voteId);
    if (!vote) throw notFound("Vote introuvable");
    const [view] = await views(v, l, [vote], VOTE_BOARD_LIMIT);
    if (!view) throw notFound("Vote introuvable");
    return view;
  },

  /**
   * `GET /events/:id/votes/:voteId/candidates` : la grille, sans aucune voix (indépendante du classement, limité à 100
   * lignes). Les véhicules entrés qui concourent ; en mode « à la main », aussi les retenues choisies à l'avance qui ne sont
   * pas encore entrées (`eligible: false`, grisées), tant que l'événement dure.
   */
  async candidates(v: Viewer, eventId: string, voteId: string, cursor: number): Promise<VoteCandidates> {
    const event = await visibleEvent(eventId, v);
    const l = await loadEventVotes(db, event);
    const vote = l.votes.find((x) => x.id === voteId);
    if (!vote) throw notFound("Vote introuvable");
    const { candidates, state } = ruleOfVote(l, vote);
    const rows: { applicationId: string; eligible: boolean }[] = candidates.map((c) => ({
      applicationId: c.applicationId,
      eligible: true,
    }));
    if (vote.candidateMode === "hand" && state !== "closed" && now() < event.endsAt) {
      const entered = new Set(l.entered.map((e) => e.applicationId));
      const pending = await db
        .select({ applicationId: eventVoteCandidates.applicationId })
        .from(eventVoteCandidates)
        .innerJoin(applications, eq(applications.id, eventVoteCandidates.applicationId))
        .innerJoin(profiles, eq(profiles.userId, applications.userId))
        .where(and(eq(eventVoteCandidates.voteId, vote.id), isNull(profiles.deletedAt)))
        .orderBy(asc(eventVoteCandidates.addedAt));
      for (const p of pending)
        if (!entered.has(p.applicationId)) rows.push({ applicationId: p.applicationId, eligible: false });
    }
    const page = rows.slice(cursor, cursor + VOTE_CANDIDATES_PAGE);
    const byApp = await cards(
      db,
      page.map((r) => r.applicationId),
    );
    return {
      items: page.map((r) => ({
        applicationId: r.applicationId,
        vehicleLabel: byApp.get(r.applicationId)?.vehicleLabel ?? "Autre véhicule",
        pseudo: byApp.get(r.applicationId)?.pseudo ?? "",
        photoUrl: byApp.get(r.applicationId)?.photoUrl ?? null,
        eligible: r.eligible,
      })),
      next: cursor + VOTE_CANDIDATES_PAGE < rows.length ? cursor + VOTE_CANDIDATES_PAGE : null,
    };
  },

  /** `PUT /events/:id/votes/:voteId/vote` : une voix par vote, modifiable jusqu'à la clôture, jamais pour soi. */
  async cast(v: Viewer, eventId: string, voteId: string, applicationId: string): Promise<VoteView> {
    rateLimit("audienceVote", v.user.id);
    const event = await visibleEvent(eventId, v);
    await withTx(async (tx, after) => {
      // Verrou de la ligne du vote : une voix concurrente à la clôture ou au retrait attend, puis relit l'état (tour 2).
      await lockVote(tx, voteId);
      const l = await loadEventVotes(tx, event);
      const vote = l.votes.find((x) => x.id === voteId);
      if (!vote) throw notFound("Vote introuvable");
      const { candidates, ctx, rv } = ruleOfVote(l, vote);
      const voter = await voterOf(tx, eventId, v.user.id, l.entered);
      const reason = canVoteIn(voter, rv, ctx, now());
      if (reason) throw refusal[reason]();
      const target = candidates.find((c) => c.applicationId === applicationId);
      if (!target) {
        const known = l.entered.some((e) => e.applicationId === applicationId);
        throw new AppError(
          400,
          "validation_error",
          known ? voteTexts.errors.not_a_candidate : voteTexts.errors.candidate_not_entered,
        );
      }
      const owner = target.vehicleId
        ? await tx.query.vehicles.findFirst({ where: eq(vehicles.id, target.vehicleId), columns: { ownerId: true } })
        : undefined;
      if (isOwnVehicle(v.user.id, { userId: target.userId, vehicleOwnerId: owner?.ownerId ?? null })) {
        throw new AppError(400, "own_vehicle", voteTexts.errors.own_vehicle);
      }
      const t = now();
      await tx
        .insert(audienceVotes)
        .values({ eventId, voteId, voterUserId: v.user.id, applicationId, createdAt: t, updatedAt: t })
        .onConflictDoUpdate({
          target: [audienceVotes.voteId, audienceVotes.voterUserId],
          set: { applicationId, updatedAt: t },
        });
      after(() => publishVotes(eventId, voteId));
    });
    return this.get(v, eventId, voteId);
  },

  /** Abonnement au canal `event:{id}:votes` : toute personne connectée, événement publié et lisible par elle. */
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

  // --- Organisateur ------------------------------------------------------------------------------------------------

  templates(): VoteTemplates {
    return { items: voteTemplates.map((t) => ({ ...t })) };
  },

  /** `GET /events/:id/votes/manage` : la console. Propriétaire et co-organisateurs écrivent, le staff lit. */
  async manage(v: Viewer, eventId: string): Promise<VoteManage> {
    const event = await eventsRepo.byId(eventId);
    // La console montre tous les classements en cours de vote : un super admin n'y entre que comme sur la route passionné
    // (2FA, demande d'assistance ouverte, trace d'audit). Tour 2 (Codex).
    if (
      isSuperAdmin(v) &&
      !(await activeMembership(v.user.id, event.structureId)) &&
      !(await isEventTeam(db, event, v))
    ) {
      throw new AppError(
        403,
        "assistance_required",
        "Mode assistance : la structure doit demander l'aide d'Orasso pour qu'on consulte ses votes.",
      );
    }
    const access = await teamAccess(v, event, false);
    const l = await loadEventVotes(db, event);
    return {
      items: await manageItems(l),
      canWrite: access === "organizer",
      vehiclesEntered: l.entered.length,
      enteredApplicationIds: l.entered.map((e) => e.applicationId),
      podium: await podiumOf(),
    };
  },

  /** `POST /events/:id/votes`. */
  async create(v: Viewer, eventId: string, input: VoteCreate): Promise<VoteManageItem> {
    const event = await eventsRepo.byId(eventId);
    await teamAccess(v, event, true);
    assertEditable(event);
    await assertZone(event.id, input);
    assertOpensAt(event, input);
    assertLaunchMode(input);
    const id = await withTx(async (tx) => {
      await ensureAllCategories(tx, event);
      const existing = await activeVotes(tx, eventId);
      if (existing.length >= VOTES_PER_EVENT_MAX) {
        throw conflict("too_many_votes", voteTexts.errors.too_many_votes);
      }
      const position = existing.reduce((m, x) => Math.max(m, x.position), 0) + 1;
      const [row] = await tx
        .insert(eventVotes)
        .values({
          eventId,
          title: input.title,
          kind: "theme",
          candidateMode: input.candidateMode,
          candidateFilter: input.candidateFilter,
          openMode: input.openMode,
          opensAt: input.opensAt,
          durationMinutes: input.durationMinutes,
          rareStamp: false,
          position,
          createdBy: v.user.id,
          createdAt: now(),
          updatedAt: now(),
        })
        .returning();
      if (!row) throw new Error("Vote non créé");
      return row.id;
    });
    return this.afterWrite(eventId, id);
  },

  /** `PATCH /events/:id/votes/:voteId` : seulement avant l'ouverture ; une fois ouvert rien ne change, on clôt. */
  async update(v: Viewer, eventId: string, voteId: string, input: VoteUpdate): Promise<VoteManageItem> {
    const event = await eventsRepo.byId(eventId);
    await teamAccess(v, event, true);
    await ownVote(event.id, voteId);
    await withTx(async (tx) => {
      // Verrou de la ligne, état recalculé sous verrou (tour 3) : rien ne change sous une voix qui arrive.
      const { vote, state } = await lockedState(tx, event, voteId);
      if (vote.kind === "all_categories") throw conflict("vote_fixed", voteTexts.errors.vote_fixed);
      assertUnlocked(event, vote, state);
      const mode = input.candidateMode ?? vote.candidateMode;
      const openMode = input.openMode ?? vote.openMode;
      const merged = parse(voteCreateSchema, {
        title: input.title ?? vote.title,
        candidateMode: mode,
        // Un changement de mode des candidats sans nouveau filtre : on repart de zéro (le filtre d'un autre mode n'a pas de sens).
        candidateFilter:
          input.candidateFilter !== undefined
            ? input.candidateFilter
            : input.candidateMode && input.candidateMode !== vote.candidateMode
              ? null
              : vote.candidateFilter,
        openMode,
        opensAt:
          input.opensAt !== undefined
            ? input.opensAt
            : input.openMode && input.openMode !== vote.openMode
              ? null
              : vote.opensAt,
        durationMinutes: input.durationMinutes !== undefined ? input.durationMinutes : vote.durationMinutes,
      });
      await assertZone(event.id, merged);
      assertOpensAt(event, merged);
      assertLaunchMode(merged);
      await tx
        .update(eventVotes)
        .set({
          title: merged.title,
          candidateMode: merged.candidateMode,
          candidateFilter: merged.candidateFilter,
          openMode: merged.openMode,
          opensAt: merged.opensAt,
          durationMinutes: merged.durationMinutes,
          updatedAt: now(),
        })
        .where(and(eq(eventVotes.id, voteId), isNull(eventVotes.openedAt), isNull(eventVotes.closedAt)));
      // Un vote qui quitte le mode « à la main » perd ses choix (ils ne servent plus et ne doivent rien ouvrir).
      if (vote.candidateMode === "hand" && merged.candidateMode !== "hand") {
        await tx.delete(eventVoteCandidates).where(eq(eventVoteCandidates.voteId, voteId));
      }
    });
    return this.afterWrite(eventId, voteId);
  },

  /** `DELETE /events/:id/votes/:voteId` : retrait (« Toutes catégories » aussi) tant que le vote n'a reçu aucune voix. */
  async remove(v: Viewer, eventId: string, voteId: string): Promise<{ ok: true }> {
    const event = await eventsRepo.byId(eventId);
    await teamAccess(v, event, true);
    await ownVote(event.id, voteId);
    await withTx(async (tx) => {
      await lockVote(tx, voteId);
      const [voices] = await tx.select({ n: count() }).from(audienceVotes).where(eq(audienceVotes.voteId, voteId));
      if (Number(voices?.n ?? 0) > 0) throw conflict("vote_has_voices", voteTexts.errors.vote_has_voices);
      await tx
        .update(eventVotes)
        .set({ deletedAt: now(), updatedAt: now() })
        .where(and(eq(eventVotes.id, voteId), isNull(eventVotes.deletedAt)));
    });
    votesRealtime.candidatesChanged(eventId, voteId);
    return { ok: true };
  },

  /**
   * `POST /events/:id/votes/all-categories` : remet « Toutes catégories » (lot R7l2) quand l'organisateur l'a retiré. La
   * ligne retirée reste en base (l'index unique la compte) : on lui ôte `deleted_at`, elle revient en tête de la liste
   * avec son tampon rare. Sans effet si le vote est déjà là ; créé s'il n'a jamais existé (événement ancien).
   */
  async restoreAllCategories(v: Viewer, eventId: string): Promise<VoteManageItem> {
    const event = await eventsRepo.byId(eventId);
    await teamAccess(v, event, true);
    assertEditable(event);
    const id = await withTx(async (tx) => {
      const [row] = await tx
        .select()
        .from(eventVotes)
        .where(and(eq(eventVotes.eventId, eventId), eq(eventVotes.kind, "all_categories")))
        .for("update");
      if (!row) {
        await ensureAllCategories(tx, event);
        const created = await tx.query.eventVotes.findFirst({
          where: and(eq(eventVotes.eventId, eventId), eq(eventVotes.kind, "all_categories")),
        });
        if (!created) throw new Error("Vote « Toutes catégories » non créé");
        return created.id;
      }
      if (row.deletedAt) {
        const active = await activeVotes(tx, eventId);
        // Le plafond vaut aussi pour un vote remis (tour 2) : il compte parmi les votes actifs dès son retour.
        if (active.length >= VOTES_PER_EVENT_MAX) {
          throw conflict("too_many_votes", voteTexts.errors.too_many_votes);
        }
        // Un vote retiré n'avait aucune voix. Si des voix existent malgré tout, il ne revient pas ; sinon, même déjà ouvert
        // ou clos, il revient remis à zéro (ni ouverture, ni clôture, ni candidats figés) : il n'est pas rouvert à moitié.
        const [voices] = await tx.select({ n: count() }).from(audienceVotes).where(eq(audienceVotes.voteId, row.id));
        if (Number(voices?.n ?? 0) > 0) throw conflict("restore_has_voices", voteTexts.errors.restore_has_voices);
        const first = active.reduce((m, x) => Math.min(m, x.position), 1);
        await tx
          .update(eventVotes)
          .set({ deletedAt: null, openedAt: null, closedAt: null, position: first - 1, updatedAt: now() })
          .where(eq(eventVotes.id, row.id));
        await tx
          .delete(eventVoteCandidates)
          .where(and(eq(eventVoteCandidates.voteId, row.id), eq(eventVoteCandidates.source, "frozen")));
      }
      return row.id;
    });
    votesRealtime.candidatesChanged(eventId, id);
    return this.afterWrite(eventId, id);
  },

  /** `PUT /events/:id/votes/order` : l'ordre de l'organisateur ; tous les votes de l'événement, ni plus ni moins. */
  async order(v: Viewer, eventId: string, ids: string[]): Promise<VoteManage> {
    const event = await eventsRepo.byId(eventId);
    await teamAccess(v, event, true);
    await withTx(async (tx) => {
      const current = await activeVotes(tx, eventId);
      const same =
        ids.length === current.length && new Set(ids).size === ids.length && current.every((c) => ids.includes(c.id));
      if (!same) throw validation(voteTexts.errors.order_mismatch);
      for (const [i, id] of ids.entries()) {
        await tx.update(eventVotes).set({ position: i, updatedAt: now() }).where(eq(eventVotes.id, id));
      }
    });
    return this.manage(v, eventId);
  },

  /** `POST /events/:id/votes/:voteId/open` : lance un vote « à la main » (ou avance un vote « à l'heure »). */
  async open(v: Viewer, eventId: string, voteId: string): Promise<VoteManageItem> {
    const event = await eventsRepo.byId(eventId);
    await teamAccess(v, event, true);
    await ownVote(event.id, voteId);
    await withTx(async (tx) => {
      const { vote, state, l } = await lockedState(tx, event, voteId);
      if (vote.openMode === "first_entry") throw conflict("vote_not_manual", voteTexts.errors.vote_not_manual);
      assertUnlocked(event, vote, state);
      // Un événement en brouillon prépare ses votes, il ne les lance pas.
      if (event.status !== "published") throw conflict("event_not_published", voteTexts.errors.not_published);
      const { candidates } = ruleOfVote(l, vote);
      if (candidates.length < 2) throw conflict("not_enough_candidates", voteTexts.errors.not_enough_candidates);
      if (!(await markOpened(tx, event, vote, now(), true))) {
        throw conflict("vote_locked", voteTexts.errors.vote_locked);
      }
    });
    votesRealtime.opened(eventId, voteId);
    return this.afterWrite(eventId, voteId);
  },

  /** `POST /events/:id/votes/:voteId/close` : clôture à la main ; le classement devient public. */
  async close(v: Viewer, eventId: string, voteId: string): Promise<VoteManageItem> {
    const event = await eventsRepo.byId(eventId);
    await teamAccess(v, event, true);
    await ownVote(event.id, voteId);
    const closed = await withTx(async (tx) => {
      await lockVote(tx, voteId);
      const l = await loadEventVotes(tx, event);
      const fresh = l.votes.find((x) => x.id === voteId);
      if (!fresh || ruleOfVote(l, fresh).state !== "open") throw conflict("vote_not_open", voteTexts.errors.not_open);
      const t = now();
      const rows = await tx
        .update(eventVotes)
        .set({ closedAt: t, ...(fresh.openedAt ? {} : { openedAt: t }), updatedAt: t })
        .where(and(eq(eventVotes.id, voteId), isNull(eventVotes.closedAt)))
        .returning({ id: eventVotes.id });
      await freezeCandidates(tx, fresh, ruleOfVote(l, fresh).candidates);
      return rows.length > 0;
    });
    if (closed) {
      votesRealtime.closed(eventId, voteId);
      await publishVotes(eventId, voteId);
    }
    return this.afterWrite(eventId, voteId);
  },

  /** `POST /events/:id/votes/:voteId/candidates` : un candidat à la main, par candidature ou par le QR lu sur la voiture. */
  async addCandidate(v: Viewer, eventId: string, voteId: string, input: VoteCandidateAdd): Promise<VoteCandidateAdded> {
    const event = await eventsRepo.byId(eventId);
    await teamAccess(v, event, true);
    const vote = await ownVote(event.id, voteId);
    if (vote.candidateMode !== "hand") throw conflict("not_hand", voteTexts.errors.not_hand);
    let applicationId: string;
    let source: "hand" | "scan" = "hand";
    if ("qr" in input) {
      // Sans écrire de `scan_event` : le QR ne sert qu'à nommer la voiture. Le code tournant OR2 (celui de l'appli) est
      // vérifié avec le secret de son pass et l'heure du serveur ; OR1 (signé, imprimé) en repli.
      const rotating = decodeRotatingPayload(input.qr);
      let pass: typeof accessPasses.$inferSelect | undefined;
      if (rotating) {
        pass = await db.query.accessPasses.findFirst({ where: eq(accessPasses.id, rotating.passId) });
        if (!pass || pass.revokedAt) throw new AppError(400, "invalid_qr", voteTexts.errors.invalid_qr);
        const secret = (await ensureOtpSecrets(db, [pass])).get(pass.id);
        if (!secret) throw new AppError(400, "invalid_qr", voteTexts.errors.invalid_qr);
        const check = verifyRotatingCode(input.qr, secret, now());
        if (!check.ok) {
          if (check.reason === "expired") throw new AppError(400, "expired_qr", voteTexts.errors.expired_qr);
          throw new AppError(400, "invalid_qr", voteTexts.errors.invalid_qr);
        }
      } else {
        const check = verifyPassPayload(input.qr, await signing.trustedKeys(db), ed25519Verify);
        if (!check.ok) throw new AppError(400, "invalid_qr", voteTexts.errors.invalid_qr);
        pass = await db.query.accessPasses.findFirst({ where: eq(accessPasses.id, check.pass.passId) });
        if (!pass || pass.revokedAt) throw new AppError(400, "invalid_qr", voteTexts.errors.invalid_qr);
      }
      if (pass.eventId !== eventId) throw conflict("other_event", voteTexts.errors.other_event);
      applicationId = pass.applicationId;
      source = "scan";
      const inside = await db.query.checkins.findFirst({ where: eq(checkins.applicationId, applicationId) });
      if (!inside) throw new AppError(409, "not_checked_in", voteTexts.errors.not_check_in);
    } else {
      applicationId = input.applicationId;
    }
    const app = await db.query.applications.findFirst({
      where: and(
        eq(applications.id, applicationId),
        eq(applications.eventId, eventId),
        eq(applications.kind, "vehicle"),
      ),
    });
    if (!app) throw validation(voteTexts.errors.not_retained);
    if (app.status !== "accepted") {
      const entered = await db.query.checkins.findFirst({ where: eq(checkins.applicationId, app.id) });
      if (!entered) throw validation(voteTexts.errors.not_retained);
    }
    const added = await withTx(async (tx) => {
      const locked = await lockedState(tx, event, voteId);
      if (locked.vote.candidateMode !== "hand") throw conflict("not_hand", voteTexts.errors.not_hand);
      assertUnlocked(event, locked.vote, locked.state);
      const inserted = await tx
        .insert(eventVoteCandidates)
        .values({ voteId, applicationId: app.id, source, addedBy: v.user.id, addedAt: now() })
        .onConflictDoNothing()
        .returning({ applicationId: eventVoteCandidates.applicationId });
      return inserted.length > 0;
    });
    votesRealtime.candidatesChanged(eventId, voteId);
    // La voiture nommée par l'écriture : celle du QR lu, pas « la dernière scannée de la liste ». `added: false` = déjà candidate.
    return { ...(await this.afterWrite(eventId, voteId)), addedApplicationId: app.id, added };
  },

  /** `DELETE /events/:id/votes/:voteId/candidates/:applicationId` : retire un candidat choisi, avant l'ouverture. */
  async removeCandidate(v: Viewer, eventId: string, voteId: string, applicationId: string): Promise<VoteManageItem> {
    const event = await eventsRepo.byId(eventId);
    await teamAccess(v, event, true);
    const vote = await ownVote(event.id, voteId);
    if (vote.candidateMode !== "hand") throw conflict("not_hand", voteTexts.errors.not_hand);
    await withTx(async (tx) => {
      const locked = await lockedState(tx, event, voteId);
      assertUnlocked(event, locked.vote, locked.state);
      await tx
        .delete(eventVoteCandidates)
        .where(and(eq(eventVoteCandidates.voteId, voteId), eq(eventVoteCandidates.applicationId, applicationId)));
    });
    votesRealtime.candidatesChanged(eventId, voteId);
    return this.afterWrite(eventId, voteId);
  },

  /** Après une écriture : tâches planifiées, et le vote tel que la console le montre. */
  async afterWrite(eventId: string, voteId: string): Promise<VoteManageItem> {
    // Après validation : si l'écriture rend le vote ouvrable (deux candidats entrés, vote d'une minute…), l'ouverture est
    // constatée tout de suite et les présents prévenus une fois, sans attendre le balayage. Un échec se journalise.
    try {
      await votesLifecycle.syncEvent(eventId);
    } catch (error) {
      console.error("Ouverture des votes non constatée après l'écriture (rattrapée par le balayage) :", error);
    }
    const event = await eventsRepo.byId(eventId);
    const l = await loadEventVotes(db, event);
    const vote = l.votes.find((x) => x.id === voteId);
    if (!vote) throw notFound("Vote introuvable");
    // Effet après validation : l'écriture est faite ; une file indisponible se journalise, le balayage (`votes.sweep`) prend
    // la main, sans erreur rendue au client ni doublon.
    try {
      await scheduleVoteJobs(event, vote, ruleOfVote(l, vote).ctx);
    } catch (error) {
      console.error("Tâches du vote non planifiées (rattrapées par le balayage) :", error);
    }
    const [item] = await manageItems({ ...l, votes: [vote] });
    if (!item) throw notFound("Vote introuvable");
    return item;
  },

  /** Les votes à fusionner (tests) : exposé pour la façade `audience-prize`. */
  async allCategoriesOf(eventId: string): Promise<VoteRow | null> {
    const event = await eventsRepo.byId(eventId).catch(() => null);
    if (!event) return null;
    await ensureAllCategories(db, event);
    const row = await db.query.eventVotes.findFirst({
      where: and(eq(eventVotes.eventId, eventId), eq(eventVotes.kind, "all_categories"), isNull(eventVotes.deletedAt)),
    });
    return row ?? null;
  },

  /** Rang d'une personne dans « Toutes catégories » (meilleur de ses véhicules entrés) : le récap. */
  async rankOf(eventId: string, userId: string) {
    const vote = await this.allCategoriesOf(eventId);
    const event = await eventsRepo.byId(eventId);
    if (!vote)
      return { best: null as AudienceRanked | null, of: 0, total: 0, projectedWinner: null as AudienceRanked | null };
    const l = await loadEventVotes(db, event);
    const { candidates } = ruleOfVote(l, vote);
    const rows = await eventVoteRows(db, eventId);
    const { ranked, total } = rankVote(
      rows.filter((r) => r.voteId === vote.id),
      candidates,
    );
    const mine = new Set(candidates.filter((e) => e.userId === userId).map((e) => e.applicationId));
    const best = ranked.find((r) => mine.has(r.applicationId)) ?? null;
    const first = ranked[0];
    const winner = first && first.votes > 0 && ranked.length >= 2 && total >= 3 ? first : null;
    return {
      best,
      of: ranked.length,
      total,
      projectedWinner: winner && mine.has(winner.applicationId) ? winner : null,
    };
  },
};

/** Points du podium (1er, 2e, 3e) tels que le réglage de l'administration les donne : ce que l'écran affiche. */
async function podiumOf(): Promise<[number, number, number]> {
  const settings = await podiumSettings();
  return [podiumPoints(settings, 1), podiumPoints(settings, 2), podiumPoints(settings, 3)];
}

// --- Aides --------------------------------------------------------------------------------------------------------------

/** Droit sur la console : le staff de la structure lit, propriétaire et co-organisateurs écrivent (2FA), le super admin suit `requireOrganizer`. */
async function teamAccess(v: Viewer, event: EventRow, write: boolean): Promise<"organizer" | "staff"> {
  const member = await activeMembership(v.user.id, event.structureId);
  if (member?.role === "staff") {
    if (write)
      throw forbidden("Le staff lit les votes ; seuls les organisateurs les créent, les lancent et les closent.");
    return "staff";
  }
  if (write) await requireOrganizerWrite(v, event.structureId);
  else await requireOrganizer(v, event.structureId);
  return "organizer";
}

/** On ne prépare plus un vote d'un événement annulé ou fini. */
function assertEditable(event: EventRow) {
  if (event.status === "cancelled" || now() >= event.endsAt) throw conflict("event_over", voteTexts.errors.event_over);
}

/** Rien ne change plus une fois le vote ouvert ou clos : on clôt (ARCHITECTURE-R7 § 2.7). */
function assertUnlocked(event: EventRow, vote: VoteRow, state?: VoteState) {
  assertEditable(event);
  if (vote.openedAt || vote.closedAt || (state && state !== "upcoming")) {
    throw conflict("vote_locked", voteTexts.errors.vote_locked);
  }
}

/**
 * Sous verrou de la ligne du vote : le vote relu et son état déduit. Un événement en brouillon se configure librement
 * (modifier, candidats) : ses votes restent « prévus », ils ne peuvent pas s'ouvrir.
 */
async function lockedState(tx: Executor, event: EventRow, voteId: string) {
  await lockVote(tx, voteId);
  const l = await loadEventVotes(tx, event);
  const vote = l.votes.find((x) => x.id === voteId);
  if (!vote) throw notFound("Vote introuvable");
  const state: VoteState = event.status === "published" ? ruleOfVote(l, vote).state : "upcoming";
  return { vote, state, l };
}

/** Un concours préparé « à la main » se lance avec « Lancer le vote » ou à une heure fixée, jamais « au premier pointage ». */
function assertLaunchMode(input: { candidateMode: string; openMode: string }) {
  if (input.candidateMode === "hand" && input.openMode === "first_entry") {
    throw conflict("hand_first_entry", voteTexts.errors.hand_first_entry);
  }
}

/** Une heure d'ouverture doit être à venir et avant la fin de l'événement (409 `opens_at_invalid`). */
function assertOpensAt(event: EventRow, input: { openMode: string; opensAt?: Date | null }) {
  if (input.openMode !== "at" || !input.opensAt) return;
  if (input.opensAt <= now() || input.opensAt >= event.endsAt) {
    throw conflict("opens_at_invalid", voteTexts.errors.opens_at_past);
  }
}

async function ownVote(eventId: string, voteId: string): Promise<VoteRow> {
  const vote = await db.query.eventVotes.findFirst({
    where: and(eq(eventVotes.id, voteId), eq(eventVotes.eventId, eventId), isNull(eventVotes.deletedAt)),
  });
  if (!vote) throw notFound("Vote introuvable");
  return vote;
}

async function assertZone(
  eventId: string,
  input: { candidateMode: string; candidateFilter: { zoneId?: string } | null },
) {
  if (input.candidateMode !== "zone" || !input.candidateFilter?.zoneId) return;
  const zone = await db.query.eventZones.findFirst({
    where: and(eq(eventZones.id, input.candidateFilter.zoneId), eq(eventZones.eventId, eventId)),
    columns: { id: true },
  });
  if (!zone) throw validation(voteTexts.errors.zone_unknown);
}

/** Les résultats figés au règlement, par vote. */
async function frozenResults(ex: Executor, eventId: string) {
  const rows = await ex
    .select({
      voteId: audiencePrizeResults.voteId,
      applicationId: audiencePrizeResults.applicationId,
      votes: audiencePrizeResults.votes,
      rank: audiencePrizeResults.rank,
    })
    .from(audiencePrizeResults)
    .where(eq(audiencePrizeResults.eventId, eventId))
    .orderBy(asc(audiencePrizeResults.rank));
  const out = new Map<string, AudienceRanked[]>();
  for (const r of rows) {
    const list = out.get(r.voteId) ?? [];
    list.push({ applicationId: r.applicationId, votes: r.votes, rank: r.rank });
    out.set(r.voteId, list);
  }
  return out;
}

/** Les votes vus par une personne : droit de voter, ma voix, et le classement selon `canSeeRanking`. */
async function views(v: Viewer, l: LoadedVotes, votes: VoteRow[], rankingLimit: number): Promise<VoteView[]> {
  const rows = await eventVoteRows(db, l.event.id);
  const voter = await voterOf(db, l.event.id, v.user.id, l.entered);
  const mine = await db
    .select({
      voteId: audienceVotes.voteId,
      applicationId: audienceVotes.applicationId,
      updatedAt: audienceVotes.updatedAt,
    })
    .from(audienceVotes)
    .where(and(eq(audienceVotes.eventId, l.event.id), eq(audienceVotes.voterUserId, v.user.id)));
  const myVote = new Map(mine.map((m) => [m.voteId, m]));
  const own = await db
    .select({ id: applications.id })
    .from(applications)
    .leftJoin(vehicles, eq(vehicles.id, applications.vehicleId))
    .where(
      and(
        eq(applications.eventId, l.event.id),
        sql`(${applications.userId} = ${v.user.id} or ${vehicles.ownerId} = ${v.user.id})`,
      ),
    );
  const frozen = l.event.settledAt ? await frozenResults(db, l.event.id) : new Map<string, AudienceRanked[]>();
  // L'équipe n'est cherchée qu'une fois (et la consultation d'un super admin tracée une fois), seulement si un classement
  // est en jeu : un vote clos est lisible de tous.
  let team: Promise<boolean> | undefined;
  const isTeam = () => {
    team ??= isEventTeam(db, l.event, v);
    return team;
  };
  const checkedInAt = (voter.checkedInAt ?? voter.ticketScannedAt)?.toISOString() ?? null;
  const out: VoteView[] = [];
  for (const vote of votes) {
    const { candidates, ctx, rv, state } = ruleOfVote(l, vote);
    const { ranked, total } = rankVote(
      rows.filter((r) => r.voteId === vote.id),
      candidates,
    );
    const reason = canVoteIn(voter, rv, ctx, now());
    const voted = myVote.has(vote.id);
    const visible = canSeeRanking({ team: state === "closed" || voted ? false : await isTeam(), voted, state });
    const results = frozen.get(vote.id);
    const source = results?.length ? results : ranked.slice(0, VOTE_BOARD_LIMIT);
    out.push({
      id: vote.id,
      eventId: l.event.id,
      title: vote.title,
      kind: vote.kind,
      state,
      opensAt: voteOpensAt(rv, ctx)?.toISOString() ?? null,
      closesAt: voteClosesAt(rv, ctx).toISOString(),
      candidatesCount: candidates.length,
      total,
      myVote: myVote.get(vote.id)?.applicationId ?? null,
      votedAt: myVote.get(vote.id)?.updatedAt.toISOString() ?? null,
      canVote: reason === null,
      reason,
      ranking: visible ? await rankingEntries(db, source.slice(0, rankingLimit)) : null,
      rankingHiddenReason: visible ? null : rankingHiddenReason({ canVote: reason === null }),
      rareStamp: vote.rareStamp,
      ownApplicationIds: own.map((o) => o.id),
      checkedInAt,
      settled: Boolean(results?.length),
    });
  }
  return out;
}

/** La console : chaque vote avec son réglage, son état, ses candidats choisis et son classement (toujours visible de l'équipe). */
async function manageItems(l: LoadedVotes): Promise<VoteManageItem[]> {
  const rows = await eventVoteRows(db, l.event.id);
  const frozen = l.event.settledAt ? await frozenResults(db, l.event.id) : new Map<string, AudienceRanked[]>();
  const handRows = await db
    .select()
    .from(eventVoteCandidates)
    .where(
      inArray(
        eventVoteCandidates.voteId,
        l.votes.map((x) => x.id),
      ),
    )
    .orderBy(asc(eventVoteCandidates.addedAt));
  const handApps = await cards(
    db,
    handRows.map((h) => h.applicationId),
  );
  const out: VoteManageItem[] = [];
  for (const vote of l.votes) {
    const { candidates, ctx, rv, state: ruleState } = ruleOfVote(l, vote);
    // Côté gestion, un brouillon montre ses votes « prévus » (comme `lockedState`) : on les modifie, on y ajoute des
    // candidats. La règle des passionnés ne change pas : un brouillon n'ouvre jamais, `voteState` le dit « clos » à qui vote.
    const state: VoteState = l.event.status === "draft" ? "upcoming" : ruleState;
    const { ranked, total } = rankVote(
      rows.filter((r) => r.voteId === vote.id),
      candidates,
    );
    const results = frozen.get(vote.id);
    const entered = new Set(l.entered.map((e) => e.applicationId));
    out.push({
      id: vote.id,
      title: vote.title,
      kind: vote.kind,
      candidateMode: vote.candidateMode,
      candidateFilter: vote.candidateFilter ?? null,
      openMode: vote.openMode,
      opensAt: vote.opensAt?.toISOString() ?? null,
      durationMinutes: vote.durationMinutes,
      state,
      openedAt: vote.openedAt?.toISOString() ?? null,
      closedAt: vote.closedAt?.toISOString() ?? null,
      closesAt: voteClosesAt(rv, ctx).toISOString(),
      rareStamp: vote.rareStamp,
      position: vote.position,
      candidatesCount: candidates.length,
      total,
      ranking: await rankingEntries(db, (results?.length ? results : ranked).slice(0, VOTE_BOARD_LIMIT)),
      handCandidates:
        vote.candidateMode === "hand"
          ? handRows
              .filter((h) => h.voteId === vote.id)
              .map((h) => ({
                applicationId: h.applicationId,
                vehicleLabel: handApps.get(h.applicationId)?.vehicleLabel ?? "Autre véhicule",
                pseudo: handApps.get(h.applicationId)?.pseudo ?? "",
                photoUrl: handApps.get(h.applicationId)?.photoUrl ?? null,
                eligible: entered.has(h.applicationId),
                entered: entered.has(h.applicationId),
                source: h.source,
              }))
          : null,
      settled: Boolean(results?.length),
    });
  }
  return out;
}
