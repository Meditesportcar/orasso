// Cycle de vie des candidatures (ARCHITECTURE.md § 2.1 à 2.4) : candidater, trier, liste d'attente automatique,
// désistement, verrouillage, annulation. Toute transition passe par `transition()`, qui écrit `application_events`.
import {
  type ApplicationCreate,
  type ApplicationStatus,
  activeApplicationStatuses,
  canApply,
  canTransition,
  computeOfferDeadline,
  type Decide,
  freePlaces,
  invitationLabels,
  isLocked,
  isMultiDay,
  lockAt,
  mediaLabels,
  type PassRevokedReason,
  providerApplicationsLink,
  providerWaitlistNote,
  type RefusalReason,
  refusalReasonLabels,
  registrationOpensAt,
  type TransitionActor,
  waitlistInsertRank,
} from "@orasso/shared";
import { and, asc, count, eq, gt, inArray, isNull, lte, max, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applicationEvents,
  applications,
  events,
  eventZones,
  notifications,
  profiles,
  providerProfiles,
  structureBans,
  structureFollows,
} from "../../db/schema";
import { organizerActor, requireOrganizer, type StaffAccess, staffAccess } from "../../lib/access";
import { deps, now } from "../../lib/deps";
import { AppError, conflict, forbidden, invalidTransition, notFound, validation } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { type Tx, withTx } from "../../lib/tx";
import { accessService } from "../access/service";
import { arrivalAnswer } from "../events/arrivals";
import { daysRepo } from "../events/days";
import { type EventRow, eventsRepo } from "../events/repo";
import { expirePendingInvitations } from "../invitations/expire";
import { notifyMediaDecision } from "../media/notify";
import { assertPressQuota } from "../media/quota";
import { notificationsService } from "../notifications/service";
import { socialJournal } from "../social/journal";
import { staffService } from "../staff/service";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";

export type ApplicationRow = typeof applications.$inferSelect;
type Actor = { kind: TransitionActor; userId: string | null };
type After = (cb: () => unknown) => void;

const SYSTEM: Actor = { kind: "system", userId: null };
const ACTIVE = activeApplicationStatuses as readonly ApplicationStatus[];

const lockedError = (message: string) => new AppError(423, "locked", message);

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

/** Seul point d'écriture du statut : vérifie la transition, l'applique, la journalise. */
async function transition(
  tx: Tx,
  app: ApplicationRow,
  to: ApplicationStatus,
  actor: Actor,
  patch: Partial<typeof applications.$inferInsert> = {},
  reason?: string,
): Promise<ApplicationRow> {
  if (!canTransition(app.status, to, actor.kind)) throw invalidTransition(app.status, to);
  const [row] = await tx
    .update(applications)
    .set({ ...patch, status: to })
    .where(and(eq(applications.id, app.id), eq(applications.status, app.status)))
    .returning();
  if (!row) throw conflict("conflict", "La candidature a changé entre-temps, recharge la page");
  await tx.insert(applicationEvents).values({
    applicationId: app.id,
    fromStatus: app.status,
    toStatus: to,
    actor: actor.kind,
    actorUserId: actor.userId,
    reason: reason ?? null,
    at: now(),
  });
  // QR d'inscription (lot 06) : émis à la retenue, révoqué quand la candidature n'est plus retenue.
  if (to === "accepted" && app.status !== "accepted") await accessService.issue(tx, row);
  // Journal des amis (lot 17) : « <pseudo> va à <événement> ».
  if (to === "accepted" && app.status !== "accepted") await socialJournal.friendGoingEvent(tx, row);
  if (app.status === "accepted" && to !== "accepted") {
    await accessService.revoke(tx, row.id, PASS_REVOCATION[to] ?? "cancelled");
  }
  return row;
}

/** Motif de révocation du pass selon le nouveau statut. */
const PASS_REVOCATION: Partial<Record<ApplicationStatus, PassRevokedReason>> = {
  withdrawn: "withdrawn",
  refused: "refused",
  cancelled: "cancelled",
};

async function labelOf(app: ApplicationRow, tx: Tx): Promise<string> {
  if (app.providerProfileId) {
    const p = await tx.query.providerProfiles.findFirst({ where: eq(providerProfiles.id, app.providerProfileId) });
    return p ? `Ton activité « ${p.name} »` : "Ta candidature";
  }
  if (!app.vehicleId) return "Ta candidature";
  const v = await vehiclesRepo.findFullById(app.vehicleId, tx);
  return v ? vehicleLabel(v) : "Ton véhicule";
}

const eventLink = (e: EventRow) => ({ label: "Voir l'événement", path: `/e/${e.slug}` });
const accessLinkDefault = { label: "Ouvrir mes accès", path: "/app/acces" };
const accessLink = accessLinkDefault;

/** Rang affiché dans la liste d'attente (1 = prochain servi). */
async function waitlistPosition(tx: Tx | typeof db, app: ApplicationRow): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(applications)
    .where(
      and(
        eq(applications.eventId, app.eventId),
        eq(applications.status, "waitlisted"),
        eq(applications.kind, app.kind),
        // Plusieurs jours (lot 26) : devant une candidature d'un jour, seules celles de ce jour et de tout l'événement.
        app.eventDayId
          ? sql`(${applications.eventDayId} is null or ${applications.eventDayId} = ${app.eventDayId})`
          : undefined,
        sql`(${applications.waitlistRank}, ${applications.waitlistedAt}) < (${app.waitlistRank}, ${app.waitlistedAt?.toISOString() ?? null}::timestamptz)`,
      ),
    );
  return (row?.n ?? 0) + 1;
}

/** Notifie le candidat d'une décision (« au fil des décisions », docs/01). */
async function notifyDecision(tx: Tx, event: EventRow, app: ApplicationRow) {
  // Lot 45 : accréditation presse, notifications propres (`accreditation_accepted` / `accreditation_refused`).
  if (app.kind === "media") return notifyMediaDecision(tx, event, app);
  const label = await labelOf(app, tx);
  const provider = app.kind === "provider";
  const base = {
    eventId: event.id,
    eventStartsAt: event.startsAt,
    data: { eventId: event.id, applicationId: app.id, ...(provider ? { screen: "provider_applications" } : {}) },
  };
  const accessLink = provider ? providerApplicationsLink : accessLinkDefault;
  if (app.status === "accepted") {
    await notificationsService.notify(tx, app.userId, "application_accepted", {
      ...base,
      title: "Candidature retenue",
      body: `${label} est retenu pour « ${event.title} », ${formatDateTime(event.startsAt)}.`,
      link: accessLink,
    });
  } else if (app.status === "waitlisted") {
    const rank = await waitlistPosition(tx, app);
    await notificationsService.notify(tx, app.userId, "application_waitlisted", {
      ...base,
      title: "Liste d'attente",
      body: `${label} est en liste d'attente pour « ${event.title} » (rang ${rank}). ${provider ? providerWaitlistNote : "Si une place se libère, elle te sera proposée automatiquement."}`,
      link: accessLink,
    });
  } else if (app.status === "refused") {
    const reasons = app.refusalSent
      ? app.refusalReasons.map((r) => refusalReasonLabels[r as RefusalReason]).join(", ")
      : "";
    const lines = [`${label} n'est pas retenu pour « ${event.title} ».`];
    if (reasons) lines.push(`Motif : ${reasons}.`);
    if (app.refusalSent && app.refusalNote) lines.push(app.refusalNote);
    await notificationsService.notify(tx, app.userId, "application_refused", {
      ...base,
      title: "Candidature refusée",
      body: lines.join("\n"),
      link: eventLink(event),
    });
  }
}

/** Diffusion temps réel après validation : compteurs du tri et changement de statut. */
function broadcast(after: After, event: EventRow, changed: ApplicationRow[]) {
  after(async () => {
    realtime.publish(`event:${event.id}:triage`, "counters", await eventsRepo.counters(event));
    // Venue en crew jamais confirmée (lot 19) : invisible de l'organisation et du staff, même par son identifiant.
    const visible = changed.filter((a) => !a.crewApplicationId || a.memberConfirmedAt);
    for (const app of changed) {
      const payload = { applicationId: app.id, eventId: event.id, status: app.status };
      if (visible.includes(app)) realtime.publish(`event:${event.id}:triage`, "application.changed", payload);
      realtime.publish(`user:${app.userId}`, "application.changed", payload);
    }
    // Liste d'accès du staff : l'appli relance une synchro différentielle si elle a du réseau (§ 4.1).
    if (visible.length) {
      realtime.publish(`event:${event.id}:access`, "access.changed", { applicationIds: visible.map((a) => a.id) });
    }
    notificationsService.kick();
  });
}

/**
 * Liste d'attente automatique (§ 2.2) : tant qu'il reste des places libres, la première candidature en liste
 * d'attente reçoit une offre, avec une échéance (24 h, 3 h la veille, 2 h le jour J, jamais après le verrouillage).
 *
 * Plusieurs jours (lot 26, § 10) : offres **par jour** — la première candidature de la liste pour qui une place est
 * libre (son jour ; tout l'événement : une place chaque jour) reçoit l'offre. Sans limite de places (ni l'événement ni
 * aucun jour), la liste d'attente reste un parking manuel de l'organisateur : rien d'automatique.
 */
async function offerNext(tx: Tx, event: EventRow, after: After): Promise<ApplicationRow[]> {
  const t = now();
  const offered: ApplicationRow[] = [];
  if (event.status !== "published" || isLocked(event, t)) return offered;
  const days = await daysRepo.list(event.id, tx);
  if (!isMultiDay(days) && event.capacity === null) return offered;
  for (;;) {
    const taken = await daysRepo.taken(event.id, tx);
    const fits = (dayId: string | null) => {
      const free = freePlaces(event, days, taken, dayId);
      return free !== null && free > 0;
    };
    // Événement d'un jour : une seule file, servie dans l'ordre (aucune place → rien).
    if (!isMultiDay(days) && !fits(null)) break;
    const queue = await tx.query.applications.findMany({
      // Les prestataires ne comptent jamais dans la capacité : leur liste d'attente est manuelle (lot 21).
      where: and(
        eq(applications.eventId, event.id),
        eq(applications.status, "waitlisted"),
        eq(applications.kind, "vehicle"),
      ),
      orderBy: [
        sql`${applications.waitlistRank} asc nulls last`,
        asc(applications.waitlistedAt),
        asc(applications.createdAt),
      ],
    });
    const next = queue.find((a) => fits(a.eventDayId));
    if (!next) break;
    const deadline = computeOfferDeadline(event, t);
    if (!deadline) {
      console.info(`waitlist.skipped_too_late event=${event.id}`);
      break;
    }
    const row = await transition(tx, next, "offered", SYSTEM, {
      offeredAt: t,
      offerExpiresAt: deadline,
      waitlistRank: null,
    });
    await notificationsService.notify(tx, row.userId, "offer_received", {
      title: "Place libérée",
      body: `Une place s'est libérée pour « ${event.title} » (${await labelOf(row, tx)}). À accepter avant ${formatDateTime(deadline)}.`,
      eventId: event.id,
      eventStartsAt: event.startsAt,
      data: { eventId: event.id, applicationId: row.id, screen: "offer" },
      link: accessLink,
    });
    after(() =>
      deps.jobs.send("waitlist.offer-expire", { applicationId: row.id, offeredAt: t.toISOString() }, deadline),
    );
    offered.push(row);
  }
  return offered;
}

/**
 * Rang d'entrée en liste d'attente (§ 2.2), sous le verrou de l'événement. Par défaut `max + 1`. Lot 25 (§ 9.2) : si
 * l'organisateur a activé la priorité des hauts grades, un véhicule de haut grade se place juste après la dernière
 * candidature de haut grade (`waitlistInsertRank`) ; `head` (invitation acceptée sur un événement complet, S25) : en
 * tête. Les véhicules de rang supérieur ou égal reculent d'une place ; l'organisateur peut toujours réordonner.
 */
async function waitlistEntryRank(
  tx: Tx,
  event: EventRow,
  app: Pick<ApplicationRow, "userId" | "kind">,
  head = false,
): Promise<number> {
  const prioritized = app.kind === "vehicle" && (head || event.highGradePriority);
  if (prioritized) {
    const entries = await tx
      .select({ rank: applications.waitlistRank, grade: profiles.grade })
      .from(applications)
      .innerJoin(profiles, eq(profiles.userId, applications.userId))
      .where(
        and(
          eq(applications.eventId, event.id),
          eq(applications.status, "waitlisted"),
          eq(applications.kind, "vehicle"),
        ),
      );
    const ranked = entries.flatMap((e) => (e.rank === null ? [] : [{ rank: e.rank, grade: e.grade }]));
    const me = await tx.query.profiles.findFirst({ where: eq(profiles.userId, app.userId), columns: { grade: true } });
    const rank = head ? 1 : waitlistInsertRank(ranked, me?.grade ?? "rodage", event);
    const last = ranked.reduce((m, e) => Math.max(m, e.rank), 0);
    if (rank <= last) {
      await tx
        .update(applications)
        .set({ waitlistRank: sql`${applications.waitlistRank} + 1` })
        .where(
          and(
            eq(applications.eventId, event.id),
            eq(applications.status, "waitlisted"),
            eq(applications.kind, "vehicle"),
            sql`${applications.waitlistRank} >= ${rank}`,
          ),
        );
      return rank;
    }
  }
  const [agg] = await tx
    .select({ rank: max(applications.waitlistRank) })
    .from(applications)
    .where(and(eq(applications.eventId, event.id), eq(applications.status, "waitlisted")));
  return (agg?.rank ?? 0) + 1;
}

/**
 * Admission « sans sélection » (docs/01 : « tout le monde est accepté ») : retenue d'office s'il reste une place,
 * sinon liste d'attente (servie automatiquement quand une place se libère).
 */
async function admitOpen(tx: Tx, event: EventRow, app: ApplicationRow): Promise<ApplicationRow> {
  const t = now();
  let row: ApplicationRow;
  // Plusieurs jours (lot 26) : une place libre le jour choisi (tout l'événement : chaque jour).
  const free = await daysRepo.freeFor(tx, event, app.eventDayId);
  if (free === null || free > 0) {
    row = await transition(tx, app, "accepted", SYSTEM, { decidedAt: t }, "admission.open");
  } else {
    row = await transition(
      tx,
      app,
      "waitlisted",
      SYSTEM,
      { decidedAt: t, waitlistRank: await waitlistEntryRank(tx, event, app), waitlistedAt: t },
      "admission.open",
    );
  }
  await notifyDecision(tx, event, row);
  return row;
}

async function lockApplication(tx: Tx, id: string): Promise<ApplicationRow> {
  const [row] = await tx.select().from(applications).where(eq(applications.id, id)).for("update");
  if (!row) throw notFound("Candidature introuvable");
  return row;
}

/**
 * Verrous toujours dans le même ordre (événement, puis candidature) pour éviter les interblocages entre une action
 * du candidat, une décision de l'organisateur et les tâches (expiration, verrouillage).
 */
async function lockEventThenApplication(tx: Tx, applicationId: string) {
  const found = await tx.query.applications.findFirst({
    where: eq(applications.id, applicationId),
    columns: { eventId: true },
  });
  if (!found) throw notFound("Candidature introuvable");
  const event = await eventsRepo.lockForUpdate(tx, found.eventId);
  const app = await lockApplication(tx, applicationId);
  if (app.eventId !== event.id) throw notFound("Candidature introuvable");
  return { event, app };
}

/** Droit de trancher : organisateur, super admin, ou staff de filtration autorisé à décider. */
async function deciderAccess(v: Viewer, event: EventRow): Promise<StaffAccess> {
  const access = await staffAccess(v, event.structureId, ["filtering"], event.id);
  if (!access) throw forbidden("Réservé à l'organisation");
  if (!access.canDecide) throw forbidden("Ce rôle donne un avis, la décision revient à l'équipe organisatrice");
  return access;
}

async function decideInTx(
  tx: Tx,
  after: After,
  v: Viewer,
  access: StaffAccess,
  eventId: string,
  applicationId: string,
  input: Omit<Decide, "decision"> & { decision: Decide["decision"] },
): Promise<ApplicationRow> {
  const t = now();
  const event = await eventsRepo.lockForUpdate(tx, eventId);
  const app = await lockApplication(tx, applicationId);
  if (app.eventId !== eventId) throw notFound("Candidature introuvable");
  const to = ({ accept: "accepted", waitlist: "waitlisted", refuse: "refused" } as const)[input.decision];
  const actor: Actor = { kind: access.actor, userId: v.user.id };
  if (!canTransition(app.status, to, actor.kind)) throw invalidTransition(app.status, to);
  // Lot 45 : une accréditation presse se retient ou se refuse (pas de liste d'attente pour la presse).
  if (app.kind === "media" && to === "waitlisted") throw validation(mediaLabels.noWaitlist);
  // Lot 45 : le quota presse tient aussi à la décision (accréditations données, sous le verrou de l'événement).
  if (app.kind === "media" && to === "accepted") await assertPressQuota(tx, eventId);
  if (app.status === "refused" && isLocked(event, t)) {
    throw lockedError("Inscriptions verrouillées : un refus ne se corrige plus");
  }
  // Repêchage d'un refus (lot 26) : le véhicule a pu recandidater entre-temps (un autre jour, ou tout l'événement) ;
  // jamais deux candidatures actives incompatibles. Sous le verrou de l'événement.
  if (app.status === "refused" && app.vehicleId) {
    await daysRepo.assertVehiclesFree(
      tx,
      eventId,
      [app.vehicleId],
      app.eventDayId,
      "Ce véhicule a déjà une autre candidature active pour cet événement",
      app.id,
    );
  }
  if (input.zoneId) {
    const zone = await tx.query.eventZones.findFirst({ where: eq(eventZones.id, input.zoneId) });
    if (zone?.eventId !== eventId) throw validation("Zone inconnue pour cet événement");
  }

  let patch: Partial<typeof applications.$inferInsert> = { decidedAt: t, decidedBy: v.user.id };
  if (to === "accepted") {
    // Un prestataire (lot 21) ou un média (lot 45) est retenu hors capacité : seuls les véhicules la comptent.
    if (app.kind === "vehicle") {
      // Les offres en cours réservent leur place ; une offre forcée par l'organisateur occupe déjà la sienne.
      // Plusieurs jours (lot 26) : places du jour de la candidature (tout l'événement : chaque jour).
      const free = await daysRepo.freeFor(tx, event, app.eventDayId);
      if (free !== null && free + (app.status === "offered" ? 1 : 0) <= 0) {
        throw conflict("event_full", "Plus de place : passe par la liste d'attente", {
          capacity: event.capacity,
          dayId: app.eventDayId,
        });
      }
    }
    patch = { ...patch, waitlistRank: null, refusalReasons: [], refusalNote: null, zoneId: input.zoneId ?? app.zoneId };
  } else if (to === "waitlisted") {
    const waitlistRank = await waitlistEntryRank(tx, event, app);
    patch = { ...patch, waitlistRank, waitlistedAt: t, refusalReasons: [], refusalNote: null };
  } else {
    patch = {
      ...patch,
      refusalReasons: input.reasons ?? [],
      refusalNote: input.note ?? null,
      refusalSent: input.sendReasons ?? true,
      waitlistRank: null,
      offerExpiresAt: null,
    };
  }
  const row = await transition(tx, app, to, actor, patch);
  await notifyDecision(tx, event, row);
  // Revenir sur une retenue libère une place (le pass est révoqué par `transition`).
  const offered = app.status === "accepted" ? await offerNext(tx, event, after) : [];
  broadcast(after, event, [row, ...offered]);
  return row;
}

export const applicationsService = {
  transition,
  offerNext,
  // Briques réutilisées par l'inscription en crew (lot 19, `modules/crews/registration.ts`).
  admitOpen,
  broadcast,
  lockEventThenApplication,
  lockedError,
  isUniqueViolation,

  /** Candidater avec un ou plusieurs véhicules : une candidature `pending` par véhicule (§ 2.1). */
  async apply(v: Viewer, eventId: string, input: ApplicationCreate): Promise<ApplicationRow[]> {
    const t = now();
    try {
      return await withTx(async (tx, after) => {
        const event = await eventsRepo.lockForUpdate(tx, eventId);
        if (event.status === "draft") throw notFound("Événement introuvable");
        // Événement privé (lot 25, § 9.1) : la candidature libre est refusée, seule l'acceptation d'une invitation
        // inscrit (`POST /event-invitations/:id/accept`).
        if (event.admission === "invite_only") {
          throw new AppError(403, "invitation_required", invitationLabels.invitationRequired);
        }
        const follow = await tx.query.structureFollows.findFirst({
          where: and(eq(structureFollows.structureId, event.structureId), eq(structureFollows.userId, v.user.id)),
        });
        // Avant-première des abonnés et des hauts grades (S26 : la plus longue l'emporte).
        const applicant = { follower: Boolean(follow), grade: v.profile.grade };
        const check = canApply(event, applicant, t);
        if (!check.ok) {
          if (check.reason === "locked") {
            throw lockedError(
              "Inscriptions closes : à l'approche du début, la liste d'accès est figée pour le staff de l'entrée",
            );
          }
          if (check.reason === "not_open") {
            throw conflict("conflict", "Les candidatures ne sont pas encore ouvertes pour toi", {
              opensAt: registrationOpensAt(event, applicant).toISOString(),
            });
          }
          throw conflict("conflict", "Événement annulé");
        }
        const banned = await tx.query.structureBans.findFirst({
          where: and(eq(structureBans.structureId, event.structureId), eq(structureBans.userId, v.user.id)),
        });
        if (banned) throw forbidden("Tu ne peux pas candidater aux événements de cette structure");

        // Lot 47 : « J'ai vu » l'horaire d'arrivée des exposants, obligatoire s'il existe ; note du candidat.
        const arrival = arrivalAnswer(event, input, t);
        // Plusieurs jours (lot 26, S27) : jour choisi selon le mode d'accès ; un événement d'un jour n'en a jamais.
        const { dayId } = await daysRepo.checkChoice(tx, event, input.eventDayId);
        const ids = [...new Set(input.vehicleIds)];
        const vehicles = await vehiclesRepo.findFullByIds(ids, tx);
        if (vehicles.length !== ids.length || vehicles.some((x) => x.ownerId !== v.user.id)) {
          throw notFound("Véhicule introuvable");
        }
        for (const x of vehicles) {
          const label = vehicleLabel(x);
          if (x.status !== "active") throw validation(`${label} n'est plus dans ton garage actif`);
          // Plaque déjà portée par un autre compte, transfert en cours (lot 31, S36) : pas de candidature d'ici là.
          if (x.pendingTransferId) {
            throw validation(`${label} : plaque en attente de transfert, tu ne peux pas candidater pour le moment`, {
              plateTransfer: true,
            });
          }
          if (!event.admittedVehicleTypes.includes(x.vehicleType)) {
            throw validation(`${label} : ce type de véhicule n'est pas admis`);
          }
          if (x.photos.length === 0) throw validation(`${label} : ajoute au moins une photo`);
        }
        const mine = await tx
          .select({ vehicleId: applications.vehicleId })
          .from(applications)
          .where(
            and(
              eq(applications.eventId, eventId),
              eq(applications.userId, v.user.id),
              // Les candidatures de prestataire ne comptent pas dans la limite de véhicules.
              eq(applications.kind, "vehicle"),
              inArray(applications.status, [...ACTIVE]),
            ),
          );
        // La limite compte des véhicules (lot 26) : un véhicule inscrit un autre jour, ou déjà candidat, ne compte qu'une fois.
        const counted = new Set([...mine.flatMap((a) => (a.vehicleId ? [a.vehicleId] : [])), ...ids]).size;
        if (counted > event.maxVehiclesPerUser) {
          throw conflict("conflict", `Limite : ${event.maxVehiclesPerUser} véhicule(s) par personne`, {
            max: event.maxVehiclesPerUser,
          });
        }
        // Une candidature active par véhicule et par jour, jamais « tout l'événement » et un jour à la fois (§ 10).
        await daysRepo.assertVehiclesFree(tx, eventId, ids, dayId);

        const created: ApplicationRow[] = [];
        for (const vehicleId of ids) {
          const [row] = await tx
            .insert(applications)
            .values({
              eventId,
              userId: v.user.id,
              vehicleId,
              eventDayId: dayId,
              status: "pending",
              rulesAcceptedAt: t,
              companions: input.companions,
              message: input.message,
              followStructure: input.followStructure,
              ...arrival,
            })
            .returning();
          if (!row) throw new Error("Candidature non enregistrée");
          await tx.insert(applicationEvents).values({
            applicationId: row.id,
            fromStatus: null,
            toStatus: "pending",
            actor: "user",
            actorUserId: v.user.id,
            at: t,
          });
          created.push(event.admission === "open" ? await admitOpen(tx, event, row) : row);
        }
        // « Suivre l'organisateur » (cochée d'office) et « Newsletter Orasso » (libre).
        if (input.followStructure) {
          await tx
            .insert(structureFollows)
            .values({ structureId: event.structureId, userId: v.user.id, source: "application" })
            .onConflictDoNothing();
        }
        if (input.newsletterOptIn) {
          await tx.update(profiles).set({ newsletterOptIn: true }).where(eq(profiles.userId, v.user.id));
        }
        broadcast(after, event, created);
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("conflict", "Ce véhicule a déjà une candidature pour cet événement");
      throw error;
    }
  },

  async decide(v: Viewer, eventId: string, applicationId: string, input: Decide): Promise<ApplicationRow> {
    const access = await deciderAccess(v, await eventsRepo.byId(eventId));
    return withTx((tx, after) => decideInTx(tx, after, v, access, eventId, applicationId, input));
  },

  /** Décisions en masse : chaque candidature réussit ou échoue seule (pas d'échec global). */
  async decideMany(v: Viewer, eventId: string, ids: string[], input: Omit<Decide, "zoneId">) {
    const access = await deciderAccess(v, await eventsRepo.byId(eventId));
    const results: { id: string; ok: boolean; status?: ApplicationStatus; error?: string }[] = [];
    for (const id of ids) {
      try {
        const row = await withTx((tx, after) => decideInTx(tx, after, v, access, eventId, id, input));
        results.push({ id, ok: true, status: row.status });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        results.push({ id, ok: false, error: error.code });
      }
    }
    return results;
  },

  /**
   * Désistement (§ 2.3) : toujours possible jusqu'à la fin de l'événement. Une retenue désistée avant le
   * verrouillage libère sa place (offerte au suivant) ; après, elle est marquée pour le malus de J+2.
   */
  async withdraw(v: Viewer, applicationId: string, onlyIfOffered = false): Promise<ApplicationRow> {
    return withTx(async (tx, after) => {
      const t = now();
      const { event, app } = await lockEventThenApplication(tx, applicationId);
      if (app.userId !== v.user.id) throw notFound("Candidature introuvable");
      // « Refuser la place » : vérifié sous verrou (un double clic ne désiste pas une place déjà acceptée).
      if (onlyIfOffered && app.status !== "offered") throw invalidTransition(app.status, "withdrawn");
      // Venue en crew pas encore confirmée : « Je ne viens pas » (`POST /applications/:id/decline-crew`, lot 19), qui
      // prévient le chef.
      if (app.status === "awaiting_member") throw invalidTransition(app.status, "withdrawn");
      if (t >= event.endsAt) throw lockedError("L'événement est terminé");
      const locked = isLocked(event, t);
      const row = await transition(
        tx,
        app,
        "withdrawn",
        { kind: "user", userId: v.user.id },
        {
          withdrawnAt: t,
          withdrawnAfterLock: app.status === "accepted" && locked,
          waitlistRank: null,
        },
      );
      const freed = app.status === "accepted" || app.status === "offered";
      const offered = freed ? await offerNext(tx, event, after) : [];
      broadcast(after, event, [row, ...offered]);
      return row;
    });
  },

  /**
   * Suppression du compte (lot 15) : dans la transaction de l'anonymisation (après le verrou du profil), candidatures
   * des événements à venir désistées **sans malus** — offres de place en cours comprises —, QR révoqués, place
   * proposée au suivant de la liste d'attente. Les candidatures passées restent (historique des organisateurs).
   */
  async withdrawAllForDeletedAccount(tx: Tx, userId: string, after: After): Promise<number> {
    const t = now();
    const upcoming = await tx
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .where(and(eq(applications.userId, userId), inArray(applications.status, [...ACTIVE]), gt(events.endsAt, t)));
    let count = 0;
    for (const { id } of upcoming) {
      const { event, app } = await lockEventThenApplication(tx, id);
      if (!ACTIVE.includes(app.status)) continue;
      const row = await transition(
        tx,
        app,
        "withdrawn",
        { kind: "user", userId },
        { withdrawnAt: t, withdrawnAfterLock: false, waitlistRank: null },
        "account.deleted",
      );
      const freed = app.status === "accepted" || app.status === "offered";
      const offered = freed ? await offerNext(tx, event, after) : [];
      broadcast(after, event, [row, ...offered]);
      count++;
    }
    return count;
  },

  /** Accepter la place libérée, avant l'échéance et si elle est toujours libre. */
  async acceptOffer(v: Viewer, applicationId: string): Promise<ApplicationRow> {
    return withTx(async (tx, after) => {
      const t = now();
      const { event, app } = await lockEventThenApplication(tx, applicationId);
      if (app.userId !== v.user.id) throw notFound("Candidature introuvable");
      if (app.status !== "offered") throw invalidTransition(app.status, "accepted");
      if (!app.offerExpiresAt || t >= app.offerExpiresAt) throw conflict("offer_expired", "L'offre a expiré");
      // L'offre occupe déjà sa place : seules les retenues comptent ici (son jour ; tout l'événement : chaque jour).
      const free = await daysRepo.freeFor(tx, event, app.eventDayId, { statuses: ["accepted"] });
      if (free !== null && free <= 0) throw conflict("event_full", "La place n'est plus disponible");
      const row = await transition(tx, app, "accepted", { kind: "user", userId: v.user.id }, { decidedAt: t });
      broadcast(after, event, [row]);
      return row;
    });
  },

  /** Refuser la place libérée : elle passe au suivant. */
  async declineOffer(v: Viewer, applicationId: string): Promise<ApplicationRow> {
    return this.withdraw(v, applicationId, true);
  },

  /**
   * Tâche `waitlist.offer-expire` : n'agit que si l'offre visée est toujours en cours et échue (idempotent :
   * une offre déjà acceptée, refusée ou reprise ne bouge pas). Puis offre au suivant.
   */
  async expireOffer(applicationId: string, offeredAt: string): Promise<boolean> {
    return withTx(async (tx, after) => {
      const t = now();
      const found = await tx.query.applications.findFirst({ where: eq(applications.id, applicationId) });
      if (found?.status !== "offered") return false;
      const { event, app } = await lockEventThenApplication(tx, applicationId);
      if (app.status !== "offered" || app.offeredAt?.toISOString() !== offeredAt || !app.offerExpiresAt) return false;
      if (t < app.offerExpiresAt) {
        // Tâche partie en avance (horloges) : on la replanifie à l'échéance plutôt que de laisser l'offre bloquée.
        const at = app.offerExpiresAt;
        after(() => deps.jobs.send("waitlist.offer-expire", { applicationId, offeredAt }, at));
        return false;
      }
      const row = await transition(tx, app, "expired", SYSTEM);
      await notificationsService.notify(tx, row.userId, "offer_expired", {
        title: "Offre expirée",
        body: `La place proposée pour « ${event.title} » n'a pas été acceptée à temps.`,
        eventId: event.id,
        eventStartsAt: event.startsAt,
        data: { eventId: event.id, applicationId: row.id },
        link: eventLink(event),
      });
      const offered = await offerNext(tx, event, after);
      broadcast(after, event, [row, ...offered]);
      return true;
    });
  },

  /**
   * Balayage de secours (chaque minute) : fait expirer les offres échues dont la tâche n'est pas passée
   * (envoi à pg-boss en échec, base restaurée…). Sans lui, une place pourrait rester réservée jusqu'au verrouillage.
   */
  async expireDueOffers(): Promise<number> {
    const due = await db
      .select({ id: applications.id, offeredAt: applications.offeredAt })
      .from(applications)
      .where(and(eq(applications.status, "offered"), lte(applications.offerExpiresAt, now())))
      .limit(100);
    let n = 0;
    for (const d of due) if (d.offeredAt && (await this.expireOffer(d.id, d.offeredAt.toISOString()))) n++;
    return n;
  },

  /**
   * Tâche `event.lock` : trace `locked_at`, fait expirer les offres en cours (sans réoffre).
   * Ne fait rien si le verrouillage recalculé n'est pas encore atteint (date modifiée entre-temps).
   */
  async lockEvent(eventId: string): Promise<boolean> {
    return withTx(async (tx, after) => {
      const t = now();
      const event = await eventsRepo.lockForUpdate(tx, eventId);
      if (event.status !== "published" || !isLocked(event, t)) return false;
      if (!event.lockedAt) await tx.update(events).set({ lockedAt: t }).where(eq(events.id, eventId));
      // Invitations nominatives en attente : valables jusqu'au verrouillage (S24), elles expirent ici (lot 25).
      await expirePendingInvitations(tx, eventId);
      const offers = await tx.query.applications.findMany({
        where: and(eq(applications.eventId, eventId), eq(applications.status, "offered")),
      });
      const expired: ApplicationRow[] = [];
      for (const app of offers) {
        const row = await transition(tx, app, "expired", SYSTEM, {}, "event.lock");
        await notificationsService.notify(tx, row.userId, "offer_expired", {
          title: "Offre expirée",
          body: `Les inscriptions de « ${event.title} » sont verrouillées : la place proposée n'est plus disponible.`,
          eventId,
          eventStartsAt: event.startsAt,
          data: { eventId, applicationId: row.id },
        });
        expired.push(row);
      }
      // Rappel de synchronisation au staff présent ou qui n'a pas répondu (docs/01 « Un rappel invite le staff… »).
      if (!event.lockedAt) await staffService.notifySyncReminder(tx, event);
      after(() => realtime.publish(`event:${eventId}:access`, "event.locked", { eventId, lockedAt: t.toISOString() }));
      broadcast(after, event, expired);
      return true;
    });
  },

  /** Annulation de l'événement : toutes les candidatures actives passent à `cancelled`, sans malus. */
  async cancelAll(tx: Tx, event: EventRow, after: After) {
    const active = await tx.query.applications.findMany({
      where: and(eq(applications.eventId, event.id), inArray(applications.status, [...ACTIVE])),
    });
    const rows: ApplicationRow[] = [];
    for (const app of active) rows.push(await transition(tx, app, "cancelled", SYSTEM, {}, "event.cancel"));
    // Venues en crew qui étaient à confirmer (lot 19) : la notification « venue à confirmer » ne reste pas en attente.
    const awaiting = active.filter((a) => a.status === "awaiting_member").map((a) => a.id);
    if (awaiting.length) {
      await tx
        .update(notifications)
        .set({ readAt: now() })
        .where(
          and(
            eq(notifications.type, "crew_registration_to_confirm"),
            inArray(sql`${notifications.data} ->> 'applicationId'`, awaiting),
            isNull(notifications.readAt),
          ),
        );
    }
    broadcast(after, event, rows);
    return rows;
  },

  /** Réordonnancement de la liste d'attente par l'organisateur (liste complète des `waitlisted`). */
  async reorderWaitlist(v: Viewer, eventId: string, ids: string[]) {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    await withTx(async (tx, after) => {
      await eventsRepo.lockForUpdate(tx, eventId);
      const current = await tx
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(
            eq(applications.eventId, eventId),
            eq(applications.status, "waitlisted"),
            eq(applications.kind, "vehicle"),
          ),
        );
      const set = new Set(current.map((r) => r.id));
      if (ids.length !== set.size || !ids.every((id) => set.has(id)) || new Set(ids).size !== ids.length) {
        throw validation("La liste doit contenir toutes les candidatures en liste d'attente, une fois chacune");
      }
      for (const [i, id] of ids.entries()) {
        await tx
          .update(applications)
          .set({ waitlistRank: i + 1 })
          .where(eq(applications.id, id));
      }
      after(() => realtime.publish(`event:${eventId}:triage`, "waitlist.reordered", { eventId }));
    });
  },

  /** Zone attribuée à la main (organisateur, ou staff placement), choix C19. */
  async assignZone(v: Viewer, eventId: string, applicationId: string, zoneId: string | null) {
    const event = await eventsRepo.byId(eventId);
    const access = await staffAccess(v, event.structureId, ["placement"], event.id);
    if (!access) throw forbidden("Réservé à l'organisation");
    if (zoneId) {
      const zone = await db.query.eventZones.findFirst({ where: eq(eventZones.id, zoneId) });
      if (zone?.eventId !== eventId) throw validation("Zone inconnue pour cet événement");
    }
    const [row] = await db
      .update(applications)
      .set({ zoneId })
      .where(and(eq(applications.id, applicationId), eq(applications.eventId, eventId)))
      .returning();
    if (!row) throw notFound("Candidature introuvable");
    realtime.publish(`event:${eventId}:triage`, "application.changed", { applicationId, eventId, status: row.status });
    return row;
  },

  /** Avis du staff de filtration (aide à la décision) : un avis par membre, remplacé s'il le redonne. */
  async filteringOpinion(
    v: Viewer,
    eventId: string,
    applicationId: string,
    input: { opinion: "keep" | "doubt" | "refuse"; note: string | null },
  ) {
    const event = await eventsRepo.byId(eventId);
    if (!(await staffAccess(v, event.structureId, ["filtering"], event.id)))
      throw forbidden("Réservé au staff de filtration");
    return withTx(async (tx) => {
      const app = await lockApplication(tx, applicationId);
      if (app.eventId !== eventId) throw notFound("Candidature introuvable");
      const others = (app.filteringOpinion ?? []).filter((o) => o.userId !== v.user.id);
      const entry = { userId: v.user.id, opinion: input.opinion, note: input.note, at: now().toISOString() };
      await tx
        .update(applications)
        .set({ filteringOpinion: [...others, entry] })
        .where(eq(applications.id, applicationId));
      return entry;
    });
  },

  /**
   * Invitation nominative acceptée (lot 25, § 9.1, S25), sous le verrou de l'événement : candidature créée par l'invité
   * (`source = invitation`), **retenue** directement s'il reste une place (pass émis), sinon **en tête de la liste
   * d'attente**. Les vérifications du véhicule et de l'invitation sont faites par l'appelant (`invitationsService`).
   */
  async createFromInvitation(
    tx: Tx,
    after: After,
    event: EventRow,
    input: { userId: string; vehicleId: string; eventDayId?: string | null },
  ): Promise<ApplicationRow> {
    const t = now();
    // Plusieurs jours (lot 26) : le jour choisi par l'invité, mêmes règles qu'une candidature.
    const { dayId } = await daysRepo.checkChoice(tx, event, input.eventDayId);
    const mine = await tx
      .select({ vehicleId: applications.vehicleId })
      .from(applications)
      .where(
        and(
          eq(applications.eventId, event.id),
          eq(applications.userId, input.userId),
          eq(applications.kind, "vehicle"),
          inArray(applications.status, [...ACTIVE]),
        ),
      );
    // La limite compte des véhicules (lot 26) : un véhicule inscrit un autre jour ne compte qu'une fois.
    const counted = new Set([...mine.flatMap((a) => (a.vehicleId ? [a.vehicleId] : [])), input.vehicleId]).size;
    if (counted > event.maxVehiclesPerUser) {
      throw conflict("conflict", `Limite : ${event.maxVehiclesPerUser} véhicule(s) par personne`, {
        max: event.maxVehiclesPerUser,
      });
    }
    await daysRepo.assertVehiclesFree(tx, event.id, [input.vehicleId], dayId);
    const free = await daysRepo.freeFor(tx, event, dayId);
    const full = free !== null && free <= 0;
    const to: ApplicationStatus = full ? "waitlisted" : "accepted";
    if (!canTransition(null, to, "user")) throw invalidTransition(null, to);
    const waitlistRank = full
      ? await waitlistEntryRank(tx, event, { userId: input.userId, kind: "vehicle" }, true)
      : null;
    let row: ApplicationRow | undefined;
    try {
      [row] = await tx
        .insert(applications)
        .values({
          eventId: event.id,
          userId: input.userId,
          vehicleId: input.vehicleId,
          eventDayId: dayId,
          status: to,
          source: "invitation",
          rulesAcceptedAt: t,
          followStructure: false,
          decidedAt: t,
          waitlistRank,
          waitlistedAt: full ? t : null,
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("conflict", "Ce véhicule a déjà une candidature pour cet événement");
      throw error;
    }
    if (!row) throw new Error("Candidature non enregistrée");
    await tx.insert(applicationEvents).values({
      applicationId: row.id,
      fromStatus: null,
      toStatus: to,
      actor: "user",
      actorUserId: input.userId,
      reason: "invitation",
      at: t,
    });
    if (to === "accepted") {
      await accessService.issue(tx, row);
      await socialJournal.friendGoingEvent(tx, row);
    }
    await notifyDecision(tx, event, row);
    broadcast(after, event, [row]);
    return row;
  },

  withdrawDeadline(event: EventRow): Date {
    return lockAt(event);
  },

  organizerActor,
};
