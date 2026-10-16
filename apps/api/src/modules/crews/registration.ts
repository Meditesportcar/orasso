// Inscription en crew (lot 19, docs/01 « trier les candidatures », ARCHITECTURE-SUITE § 4.2) : le chef inscrit le crew en
// indiquant qui vient et avec quel véhicule ; chaque membre a **sa propre candidature** (capacité, liste d'attente,
// verrouillage, désistement, QR, points et malus inchangés), créée en `awaiting_member` : rien n'est envoyé à
// l'organisateur ni compté dans la capacité sans la confirmation du membre (72 h, plafonnées au verrouillage, S17).
// Le chef qui vient lui-même est `pending` directement (il accepte le règlement en envoyant).
import { randomUUID } from "node:crypto";
import {
  type CrewConfirm,
  type CrewConfirmationRequest,
  type CrewRegistration,
  type CrewRegistrationOptions,
  type CrewRegistrationView,
  canApply,
  crewConfirmDeadline,
  crewErrors,
  crewLabels,
  isLocked,
  lockAt,
  profileFields,
  registrationOpensAt,
} from "@orasso/shared";
import { and, asc, count, eq, gt, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applicationEvents,
  applications,
  crewMembers,
  crews,
  events,
  profiles,
  structureBans,
  structureFollows,
  vehicles,
} from "../../db/schema";
import { deps, now } from "../../lib/deps";
import { AppError, conflict, forbidden, invalidTransition, notFound, validation } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { type ApplicationRow, applicationsService } from "../applications/service";
import { type EventRow, eventsRepo } from "../events/repo";
import { inboxService } from "../messaging/inbox";
import { notificationsService } from "../notifications/service";
import { profilesRepo } from "../profiles/repo";
import { audienceFor } from "../social/profile";
import { type VehicleWithAll, vehiclesRepo } from "../vehicles/repo";
import { vehicleBriefLabel, vehicleLabel } from "../vehicles/serializers";
import { closeConfirmNotification, withdrawAwaiting } from "./awaiting";

const ACTIVE = ["pending", "accepted", "waitlisted", "offered", "awaiting_member"] as const;
const accessLink = { label: "Ouvrir mes accès", path: "/app/acces" };

/** Raison pour laquelle ce véhicule ne peut pas candidater (même règles que la candidature seule, § 2.1). */
function vehicleBlock(x: VehicleWithAll, event: EventRow): string | null {
  if (x.status !== "active") return "Pas dans le garage actif";
  if (x.pendingTransferId) return "Plaque en attente de transfert";
  if (!event.admittedVehicleTypes.includes(x.vehicleType)) return "Type de véhicule non admis";
  if (x.photos.length === 0) return "Aucune photo";
  return null;
}

async function leaderCrew(ex: Tx | typeof db, crewId: string, v: Viewer, lock = false) {
  const q = ex.select().from(crews).where(eq(crews.id, crewId));
  const [crew] = lock ? await q.for("update") : await q;
  if (!crew || crew.deletedAt) throw notFound(crewErrors.notFound);
  const [me] = await ex
    .select()
    .from(crewMembers)
    .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, v.user.id)));
  if (me?.role !== "leader" || me.status !== "active") throw forbidden(crewErrors.leaderOnly);
  return crew;
}

/** Candidatures « véhicule » actives de chaque personne sur l'événement (limite de véhicules par personne). */
async function activeCounts(ex: Tx | typeof db, eventId: string, userIds: string[]) {
  if (!userIds.length) return new Map<string, number>();
  const rows = await ex
    .select({ userId: applications.userId, n: count() })
    .from(applications)
    .where(
      and(
        eq(applications.eventId, eventId),
        inArray(applications.userId, userIds),
        eq(applications.kind, "vehicle"),
        inArray(applications.status, [...ACTIVE]),
      ),
    )
    .groupBy(applications.userId);
  return new Map(rows.map((r) => [r.userId, r.n]));
}

async function bannedIds(ex: Tx | typeof db, structureId: string, userIds: string[]) {
  if (!userIds.length) return new Set<string>();
  const rows = await ex
    .select({ userId: structureBans.userId })
    .from(structureBans)
    .where(and(eq(structureBans.structureId, structureId), inArray(structureBans.userId, userIds)));
  return new Set(rows.map((r) => r.userId));
}

async function notifyLeader(
  tx: Tx,
  app: ApplicationRow,
  event: EventRow,
  type: "crew_member_confirmed" | "crew_member_declined" | "crew_member_expired",
) {
  if (!app.crewId) return;
  const [crew] = await tx.select().from(crews).where(eq(crews.id, app.crewId));
  const leader = crew ? await profilesRepo.byUserId(crew.createdBy, tx) : undefined;
  if (!crew || !leader || leader.deletedAt || leader.userId === app.userId) return;
  const member = await profilesRepo.byUserId(app.userId, tx);
  const pseudo = member && !member.deletedAt ? member.pseudo : "Un membre";
  const text = {
    crew_member_confirmed: {
      title: "Venue confirmée",
      body: `${pseudo} confirme sa venue à « ${event.title} » avec « ${crew.name} ».`,
    },
    crew_member_declined: {
      title: "Un membre ne vient pas",
      body: `${pseudo} ne vient pas à « ${event.title} » avec « ${crew.name} ».`,
    },
    crew_member_expired: {
      title: "Venue non confirmée",
      body: `${pseudo} n'a pas confirmé sa venue à « ${event.title} » à temps : sa candidature est retirée.`,
    },
  }[type];
  await notificationsService.notify(tx, leader.userId, type, {
    ...text,
    eventId: event.id,
    eventStartsAt: event.startsAt,
    data: {
      eventId: event.id,
      applicationId: app.id,
      crewId: crew.id,
      ...(member && !member.deletedAt
        ? { actor: { userId: member.userId, pseudo: member.pseudo, avatarUrl: storage.url(member.avatarKey) } }
        : {}),
      link: `/e/${event.slug}`,
    },
    link: { label: "Voir l'événement", path: `/e/${event.slug}` },
  });
}

async function lockAwaiting(tx: Tx, applicationId: string) {
  const { event, app } = await applicationsService.lockEventThenApplication(tx, applicationId);
  return { event, app };
}

export const crewRegistrationService = {
  /** `GET /events/:id/crew-applications/options?crewId=` (chef) : membres et véhicules admissibles. */
  async options(v: Viewer, eventId: string, crewId: string): Promise<CrewRegistrationOptions> {
    const event = await eventsRepo.byId(eventId);
    if (event.status === "draft") throw notFound("Événement introuvable");
    const crew = await leaderCrew(db, crewId, v);
    const members = await db
      .select({ p: profiles, role: crewMembers.role })
      .from(crewMembers)
      .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
      .where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.status, "active"), sql`${profiles.deletedAt} is null`))
      .orderBy(sql`${crewMembers.role} = 'leader' desc`, asc(profiles.pseudo));
    const ids = members.map((m) => m.p.userId);
    const garage = ids.length
      ? await vehiclesRepo.findFull(and(inArray(vehicles.ownerId, ids), eq(vehicles.status, "active")))
      : [];
    const applied = ids.length
      ? await db
          .select({ vehicleId: applications.vehicleId })
          .from(applications)
          .where(and(eq(applications.eventId, eventId), inArray(applications.status, [...ACTIVE])))
      : [];
    const appliedVehicles = new Set(applied.map((a) => a.vehicleId));
    const counts = await activeCounts(db, eventId, ids);
    const banned = await bannedIds(db, event.structureId, ids);
    const t = now();
    // Ce que le chef voit des véhicules de chacun : les règles du profil (lot 17). Compte privé et non ami : marque et
    // modèle, sans photo. Les raisons d'un blocage (bannissement, suspension, candidature existante) ne sont jamais
    // données : « Indisponible pour cet événement ».
    const detailed = new Map<string, boolean>();
    for (const m of members) {
      const { audience } = await audienceFor(v, m.p);
      detailed.set(m.p.userId, profileFields(audience).vehicleDetails);
    }
    return {
      crew: { id: crew.id, name: crew.name },
      members: members.map((m) => {
        const suspended = Boolean(m.p.suspendedUntil && m.p.suspendedUntil > t);
        const unavailable =
          banned.has(m.p.userId) || suspended || (counts.get(m.p.userId) ?? 0) >= event.maxVehiclesPerUser;
        const full = detailed.get(m.p.userId) ?? false;
        return {
          person: { userId: m.p.userId, pseudo: m.p.pseudo, avatarUrl: storage.url(m.p.avatarKey), grade: m.p.grade },
          isLeader: m.role === "leader",
          blocked: unavailable ? crewErrors.unavailable : null,
          vehicles: garage
            .filter((x) => x.ownerId === m.p.userId)
            .map((x) => ({
              id: x.id,
              label: full ? vehicleLabel(x) : vehicleBriefLabel(x),
              photoUrl: full ? storage.url(x.photos[0]?.storageKey ?? null) : null,
              blocked:
                appliedVehicles.has(x.id) || x.pendingTransferId ? crewErrors.unavailable : vehicleBlock(x, event),
            })),
        };
      }),
    };
  },

  /**
   * `POST /events/:id/crew-applications` (chef) : une candidature par membre indiqué. Vérifications par membre (membre
   * actif, compte joignable, non banni, véhicule à lui, actif, admis, avec photo, sans candidature en cours, limite de
   * véhicules) et pour l'événement (publié, ouvert pour le chef, non verrouillé, pas sur invitation seulement).
   */
  async register(v: Viewer, eventId: string, input: CrewRegistration): Promise<CrewRegistrationView> {
    if (v.profile.suspendedUntil && v.profile.suspendedUntil > now()) {
      throw forbidden("Ton compte est suspendu : lecture seule.");
    }
    rateLimit("crewWrite", v.user.id);
    const t = now();
    const userIds = input.members.map((m) => m.userId);
    if (new Set(userIds).size !== userIds.length) throw validation(crewErrors.duplicateMember);
    if (!userIds.some((id) => id !== v.user.id)) throw validation(crewErrors.needMember);
    try {
      await withTx(async (tx, after) => {
        const event = await eventsRepo.lockForUpdate(tx, eventId);
        if (event.status === "draft") throw notFound("Événement introuvable");
        if (event.admission === "invite_only") throw forbidden("Événement sur invitation");
        const follow = await tx.query.structureFollows.findFirst({
          where: and(eq(structureFollows.structureId, event.structureId), eq(structureFollows.userId, v.user.id)),
        });
        const check = canApply(event, Boolean(follow), t);
        if (!check.ok) {
          if (check.reason === "locked") throw applicationsService.lockedError("Inscriptions verrouillées");
          if (check.reason === "not_open") {
            throw conflict("conflict", "Inscriptions pas encore ouvertes", {
              opensAt: registrationOpensAt(event, Boolean(follow)).toISOString(),
            });
          }
          throw conflict("conflict", "Événement annulé");
        }
        const crew = await leaderCrew(tx, input.crewId, v, true);

        const memberRows = await tx
          .select({ p: profiles, status: crewMembers.status })
          .from(crewMembers)
          .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
          .where(and(eq(crewMembers.crewId, crew.id), inArray(crewMembers.userId, userIds)));
        const byUser = new Map(memberRows.map((m) => [m.p.userId, m]));
        const banned = await bannedIds(tx, event.structureId, userIds);
        const counts = await activeCounts(tx, eventId, userIds);
        const garage = await vehiclesRepo.findFullByIds(
          input.members.map((m) => m.vehicleId),
          tx,
        );
        const vehiclesById = new Map(garage.map((x) => [x.id, x]));
        for (const m of input.members) {
          const member = byUser.get(m.userId);
          if (member?.status !== "active" || member.p.deletedAt) {
            throw validation(crewErrors.memberNotActive(member?.p.pseudo ?? "Cette personne"));
          }
          const pseudo = member.p.pseudo;
          const x = vehiclesById.get(m.vehicleId);
          if (x?.ownerId !== m.userId) throw validation(crewErrors.vehicleNotOwned);
          // Suspension, bannissement par la structure, candidature déjà en cours, transfert de plaque : jamais la raison
          // (informations privées du membre), le même refus pour tous.
          if (
            (member.p.suspendedUntil && member.p.suspendedUntil > t) ||
            banned.has(m.userId) ||
            x.pendingTransferId ||
            (counts.get(m.userId) ?? 0) + 1 > event.maxVehiclesPerUser
          ) {
            throw conflict("conflict", crewErrors.memberUnavailable(pseudo), { userId: m.userId });
          }
          const block = vehicleBlock(x, event);
          if (block) throw validation(`${pseudo}, ${vehicleLabel(x)} : ${block.toLowerCase()}`);
        }
        // Anti-harcèlement : pas de nouvelle inscription d'un membre à cet événement moins de 24 h après son « Je ne
        // viens pas » ou son retrait par le chef (chaque inscription lui envoie une notification et bloque son véhicule).
        const others = userIds.filter((id) => id !== v.user.id);
        const recent = await tx
          .select({ userId: applications.userId })
          .from(applicationEvents)
          .innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
          .where(
            and(
              eq(applications.eventId, eventId),
              inArray(applications.userId, others),
              inArray(applicationEvents.reason, ["crew.decline", "crew.leader_removed"]),
              gt(applicationEvents.at, new Date(t.getTime() - 24 * 3_600_000)),
            ),
          )
          .limit(1);
        if (recent[0]) {
          const pseudo = byUser.get(recent[0].userId)?.p.pseudo ?? "Ce membre";
          throw new AppError(429, "rate_limited", crewErrors.recentlyDeclined(pseudo), { retryAfter: 86_400 });
        }

        // Plusieurs envois du chef sur un même événement : un seul regroupement par crew.
        const [existing] = await tx
          .select({ id: applications.crewApplicationId })
          .from(applications)
          .where(
            and(
              eq(applications.eventId, eventId),
              eq(applications.crewId, crew.id),
              inArray(applications.status, [...ACTIVE]),
            ),
          )
          .limit(1);
        const crewApplicationId = existing?.id ?? randomUUID();
        const deadline = crewConfirmDeadline(t, lockAt(event));
        const created: ApplicationRow[] = [];
        for (const m of input.members) {
          const isLeader = m.userId === v.user.id;
          const [row] = await tx
            .insert(applications)
            .values({
              eventId,
              userId: m.userId,
              vehicleId: m.vehicleId,
              status: isLeader ? "pending" : "awaiting_member",
              rulesAcceptedAt: isLeader ? t : null,
              memberConfirmedAt: isLeader ? t : null,
              followStructure: isLeader ? input.followStructure : false,
              message: isLeader ? input.message : null,
              source: "crew",
              crewId: crew.id,
              crewApplicationId,
              // L'échéance de confirmation (72 h) part de cette date : horloge des services.
              createdAt: t,
            })
            .returning();
          if (!row) throw new Error("Candidature non enregistrée");
          await tx.insert(applicationEvents).values({
            applicationId: row.id,
            fromStatus: null,
            toStatus: row.status,
            actor: "user",
            actorUserId: v.user.id,
            reason: "crew.register",
            at: t,
          });
          if (isLeader) {
            created.push(event.admission === "open" ? await applicationsService.admitOpen(tx, event, row) : row);
            continue;
          }
          created.push(row);
          const vehicle = vehiclesById.get(m.vehicleId);
          await notificationsService.notify(tx, m.userId, "crew_registration_to_confirm", {
            title: crewLabels.confirmTitle(crew.name),
            body: `${v.profile.pseudo} a inscrit « ${crew.name} » à « ${event.title} »${vehicle ? ` (toi avec ${vehicleLabel(vehicle)})` : ""}. Confirme ta venue avant ${formatDateTime(deadline)} : sans confirmation, tu n'es pas inscrit.`,
            eventId,
            eventStartsAt: event.startsAt,
            data: {
              eventId,
              applicationId: row.id,
              crewId: crew.id,
              screen: "crew_confirm",
              actor: { userId: v.user.id, pseudo: v.profile.pseudo, avatarUrl: storage.url(v.profile.avatarKey) },
            },
            link: accessLink,
          });
          after(() => deps.jobs.send("crew.confirm-expire", { applicationId: row.id }, deadline));
          after(() => inboxService.publish(m.userId));
        }
        if (input.followStructure && userIds.includes(v.user.id)) {
          await tx
            .insert(structureFollows)
            .values({ structureId: event.structureId, userId: v.user.id, source: "application" })
            .onConflictDoNothing();
        }
        applicationsService.broadcast(after, event, created);
      });
    } catch (error) {
      if (applicationsService.isUniqueViolation(error)) {
        throw conflict("conflict", crewErrors.someUnavailable);
      }
      throw error;
    }
    const mine = await this.mine(v, eventId);
    const view = mine.find((r) => r.crew.id === input.crewId);
    if (!view) throw notFound(crewErrors.notFound);
    return view;
  },

  /** `GET /events/:id/crew-applications/mine` (chef) : ses crews inscrits à l'événement, membre par membre. */
  async mine(v: Viewer, eventId: string): Promise<CrewRegistrationView[]> {
    const led = await db
      .select({ crew: crews })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .where(and(eq(crewMembers.userId, v.user.id), eq(crewMembers.role, "leader"), eq(crewMembers.status, "active")));
    if (!led.length) return [];
    const event = await eventsRepo.byId(eventId);
    const rows = await db
      .select({ a: applications, pseudo: profiles.pseudo })
      .from(applications)
      .innerJoin(profiles, eq(profiles.userId, applications.userId))
      .where(
        and(
          eq(applications.eventId, eventId),
          inArray(
            applications.crewId,
            led.map((l) => l.crew.id),
          ),
        ),
      )
      .orderBy(asc(applications.createdAt));
    const vehicleRows = await vehiclesRepo.findFullByIds(rows.flatMap((r) => (r.a.vehicleId ? [r.a.vehicleId] : [])));
    const labels = new Map(vehicleRows.map((x) => [x.id, vehicleLabel(x)]));
    return led
      .map(({ crew }) => ({
        crew: { id: crew.id, slug: crew.slug, name: crew.name },
        members: rows
          .filter((r) => r.a.crewId === crew.id)
          .map((r) => ({
            applicationId: r.a.id,
            pseudo: r.pseudo,
            vehicleLabel: r.a.vehicleId ? (labels.get(r.a.vehicleId) ?? null) : null,
            status: r.a.status,
            confirmed: r.a.memberConfirmedAt !== null,
            confirmBefore:
              r.a.status === "awaiting_member" ? crewConfirmDeadline(r.a.createdAt, lockAt(event)).toISOString() : null,
          })),
      }))
      .filter((r) => r.members.length > 0);
  },

  /**
   * `POST /applications/:id/confirm-crew {rulesAccepted: true}` (le membre) : `awaiting_member → pending`, règlement
   * accepté maintenant ; admission « sans sélection » → retenue d'office comme une candidature seule.
   */
  async confirm(v: Viewer, applicationId: string, input: CrewConfirm): Promise<ApplicationRow> {
    if (v.profile.suspendedUntil && v.profile.suspendedUntil > now()) {
      throw forbidden("Ton compte est suspendu : lecture seule.");
    }
    return withTx(async (tx, after) => {
      const t = now();
      const { event, app } = await lockAwaiting(tx, applicationId);
      if (app.userId !== v.user.id) throw notFound("Candidature introuvable");
      if (app.status !== "awaiting_member") throw invalidTransition(app.status, "pending");
      if (event.status !== "published") throw conflict("conflict", "Événement annulé");
      if (isLocked(event, t)) throw applicationsService.lockedError("Inscriptions verrouillées");
      if (t >= crewConfirmDeadline(app.createdAt, lockAt(event))) {
        throw conflict("offer_expired", "Le délai de confirmation est dépassé");
      }
      // Inscription en crew : seulement tant qu'on est membre d'un crew qui existe encore.
      if (app.crewId) {
        const [crew] = await tx.select({ deletedAt: crews.deletedAt }).from(crews).where(eq(crews.id, app.crewId));
        if (!crew || crew.deletedAt) throw conflict("conflict", crewErrors.archived);
        const [membership] = await tx
          .select({ status: crewMembers.status })
          .from(crewMembers)
          .where(and(eq(crewMembers.crewId, app.crewId), eq(crewMembers.userId, v.user.id)));
        if (membership?.status !== "active") throw conflict("conflict", crewErrors.noLongerMember);
      }
      const [banned] = await tx
        .select({ userId: structureBans.userId })
        .from(structureBans)
        .where(and(eq(structureBans.structureId, event.structureId), eq(structureBans.userId, v.user.id)));
      if (banned) throw forbidden("Tu ne peux pas candidater aux événements de cette structure");
      const vehicle = app.vehicleId ? await vehiclesRepo.findFullById(app.vehicleId, tx) : undefined;
      // Plaque transférée à un autre compte pendant les 72 h : le véhicule n'est plus le sien.
      if (vehicle && vehicle.ownerId !== app.userId) throw conflict("conflict", crewErrors.vehicleNotOwned);
      const block = vehicle ? vehicleBlock(vehicle, event) : "Véhicule introuvable";
      if (block) throw validation(`${vehicle ? vehicleLabel(vehicle) : "Véhicule"} : ${block.toLowerCase()}`);
      let row = await applicationsService.transition(
        tx,
        app,
        "pending",
        { kind: "user", userId: v.user.id },
        {
          rulesAcceptedAt: t,
          memberConfirmedAt: t,
          followStructure: input.followStructure,
          companions: input.companions,
          message: input.message,
        },
        "crew.confirm",
      );
      if (input.followStructure) {
        await tx
          .insert(structureFollows)
          .values({ structureId: event.structureId, userId: v.user.id, source: "application" })
          .onConflictDoNothing();
      }
      if (event.admission === "open") row = await applicationsService.admitOpen(tx, event, row);
      await closeConfirmNotification(tx, app);
      await notifyLeader(tx, row, event, "crew_member_confirmed");
      applicationsService.broadcast(after, event, [row]);
      after(() => inboxService.publish(v.user.id));
      return row;
    });
  },

  /** `POST /applications/:id/decline-crew` (le membre) : « Je ne viens pas », sans conséquence. */
  async decline(v: Viewer, applicationId: string): Promise<ApplicationRow> {
    return withTx(async (tx, after) => {
      const { event, app } = await lockAwaiting(tx, applicationId);
      if (app.userId !== v.user.id) throw notFound("Candidature introuvable");
      if (app.status !== "awaiting_member") throw invalidTransition(app.status, "withdrawn");
      const row = await withdrawAwaiting(tx, after, event, app, { kind: "user", userId: v.user.id }, "crew.decline");
      await notifyLeader(tx, row, event, "crew_member_declined");
      return row;
    });
  },

  /** `POST /applications/:id/crew-remove` (le chef) : retirer un membre qui n'a pas encore confirmé. */
  async removeAwaiting(v: Viewer, applicationId: string): Promise<ApplicationRow> {
    rateLimit("crewWrite", v.user.id);
    return withTx(async (tx, after) => {
      const { event, app } = await lockAwaiting(tx, applicationId);
      if (!app.crewId) throw notFound("Candidature introuvable");
      const [crew] = await tx.select().from(crews).where(eq(crews.id, app.crewId));
      if (crew?.createdBy !== v.user.id) throw notFound("Candidature introuvable");
      if (app.status !== "awaiting_member") throw invalidTransition(app.status, "withdrawn");
      return withdrawAwaiting(tx, after, event, app, { kind: "user", userId: v.user.id }, "crew.leader_removed");
    });
  },

  /**
   * Tâche `crew.confirm-expire {applicationId}` : n'agit que sur une venue toujours à confirmer et échue (72 h après
   * l'inscription, ou le verrouillage s'il vient avant, recalculé depuis l'événement) ; partie trop tôt (date de
   * l'événement changée) → replanifiée à l'échéance. Le chef est prévenu.
   */
  async expire(applicationId: string): Promise<boolean> {
    return withTx(async (tx, after) => {
      const found = await tx.query.applications.findFirst({ where: eq(applications.id, applicationId) });
      if (found?.status !== "awaiting_member") return false;
      const { event, app } = await lockAwaiting(tx, applicationId);
      if (app.status !== "awaiting_member") return false;
      const deadline = crewConfirmDeadline(app.createdAt, lockAt(event));
      if (now() < deadline) {
        after(() => deps.jobs.send("crew.confirm-expire", { applicationId }, deadline));
        return false;
      }
      const row = await withdrawAwaiting(
        tx,
        after,
        event,
        app,
        { kind: "system", userId: null },
        "crew.confirm_expired",
      );
      await notifyLeader(tx, row, event, "crew_member_expired");
      after(() => notificationsService.kick());
      return true;
    });
  },

  /** Secours (toutes les 5 minutes) : venues à confirmer échues dont la tâche n'est pas passée. */
  async sweep(): Promise<number> {
    const due = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .where(
        and(
          eq(applications.status, "awaiting_member"),
          sql`${now()} >= least(${applications.createdAt} + interval '72 hours', ${events.startsAt} - make_interval(mins => ${events.lockOffsetMinutes}))`,
        ),
      )
      .limit(100);
    let n = 0;
    for (const d of due) if (await this.expire(d.id)) n++;
    return n;
  },

  /** Boîte > Demandes et compteur : mes venues en crew à confirmer (événements pas encore terminés). */
  async confirmations(userId: string): Promise<CrewConfirmationRequest[]> {
    const rows = await db
      .select({ a: applications, e: events, crew: crews })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .innerJoin(crews, eq(crews.id, applications.crewId))
      .where(and(eq(applications.userId, userId), eq(applications.status, "awaiting_member"), gt(events.endsAt, now())))
      .orderBy(asc(events.startsAt));
    const vehicleRows = await vehiclesRepo.findFullByIds(rows.flatMap((r) => (r.a.vehicleId ? [r.a.vehicleId] : [])));
    const labels = new Map(vehicleRows.map((x) => [x.id, vehicleLabel(x)]));
    const out: CrewConfirmationRequest[] = [];
    for (const r of rows) {
      const leader = await profilesRepo.byUserId(r.crew.createdBy);
      out.push({
        applicationId: r.a.id,
        crew: { id: r.crew.id, slug: r.crew.slug, name: r.crew.name, logoUrl: storage.url(r.crew.logoKey) },
        leaderPseudo: leader && !leader.deletedAt ? leader.pseudo : null,
        event: {
          id: r.e.id,
          slug: r.e.slug,
          title: r.e.title,
          startsAt: r.e.startsAt.toISOString(),
          city: r.e.city,
        },
        vehicleLabel: r.a.vehicleId ? (labels.get(r.a.vehicleId) ?? null) : null,
        confirmBefore: crewConfirmDeadline(r.a.createdAt, lockAt(r.e)).toISOString(),
      });
    }
    return out;
  },

  async confirmationCount(userId: string, ex: Tx | typeof db = db): Promise<number> {
    const [row] = await ex
      .select({ n: count() })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .where(
        and(eq(applications.userId, userId), eq(applications.status, "awaiting_member"), gt(events.endsAt, now())),
      );
    return row?.n ?? 0;
  },
};
