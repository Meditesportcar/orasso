// Invitations nominatives (lot 25, ARCHITECTURE-SUITE § 9.1) : l'organisateur invite des personnes (pseudo), des
// véhicules (le propriétaire reçoit l'invitation, le QR sera lié au véhicule) ou des adresses e-mail sans compte (lien
// `/invitation-evenement/:token`), ou tous les véhicules retenus d'une édition précédente. L'invité accepte (candidature
// retenue d'office, pass émis ; liste d'attente en tête si complet, S25) ou refuse. Valable jusqu'au verrouillage (S24),
// sans réservation de place (A13).
import { randomBytes } from "node:crypto";
import {
  EMAIL_INVITATIONS_PER_DAY_TOTAL,
  EMAIL_INVITATIONS_PER_STRUCTURE_PER_DAY,
  INVITATIONS_PER_STRUCTURE_PER_DAY,
  type InvitationAccept,
  type InvitationAcceptResult,
  type InvitationCandidate,
  type InvitationCreate,
  type InvitationCreateResult,
  type InvitationEventBrief,
  type InvitationFromEvent,
  type InvitationLinkView,
  type InvitationSkipReason,
  type InvitationSourceEvent,
  type InvitationStatus,
  invitationLabels,
  isLocked,
  lockAt,
  type OrganizerInvitation,
  type ReceivedInvitation,
} from "@orasso/shared";
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  emailOutbox,
  eventInvitations,
  events,
  notifications,
  profiles,
  structureBans,
  structureFollows,
  structureMembers,
  structures,
  user,
  vehicles,
} from "../../db/schema";
import { env } from "../../env";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { mail, renderMail } from "../../lib/mail";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { applicationsService } from "../applications/service";
import { requireEventReader, requireEventSpeaker, type StructureRow } from "../communication/guards";
import { arrivalsOf } from "../events/arrivals";
import { eventPosterUrl } from "../events/card";
import { daysRepo } from "../events/days";
import { type EventRow, eventsRepo } from "../events/repo";
import { inboxService } from "../messaging/inbox";
import { notificationsService } from "../notifications/service";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";

type InvitationRow = typeof eventInvitations.$inferSelect;
type After = (cb: () => unknown) => void;

const DAY_MS = 86_400_000;
const L = invitationLabels;

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

const lockedError = () => new AppError(423, "locked", "Inscriptions verrouillées : l'invitation n'est plus valable");
const emailOf = (v: Viewer) => v.user.email?.toLowerCase() ?? "";

/** L'adresse de l'invitation est-elle celle du compte (sans tenir compte de la casse) ? */
function sameEmail(inv: Pick<InvitationRow, "email">, v: Viewer): boolean {
  return Boolean(inv.email && emailOf(v) && inv.email.toLowerCase() === emailOf(v));
}

/**
 * L'invitation est-elle destinée à cette personne ? À son compte, ou à l'adresse e-mail de son compte **confirmée**
 * (relecture du lot 25, docs/01 : une adresse non confirmée ne prouve rien ; le lien reçu, lui, prouve l'accès à la
 * boîte : voir `claim`).
 */
function isRecipient(inv: Pick<InvitationRow, "userId" | "email">, v: Viewer): boolean {
  if (inv.userId) return inv.userId === v.user.id;
  return Boolean(v.user.emailVerified) && sameEmail(inv, v);
}

const isSuspended = (v: Viewer) => Boolean(v.profile.suspendedUntil && v.profile.suspendedUntil > now());

function brief(e: EventRow, s: StructureRow, days: { id: string; dayDate: string }[] = []): InvitationEventBrief {
  return {
    // Lot 26 : jours d'un événement sur plusieurs jours, pour choisir le sien à l'acceptation.
    days: days.length > 1 ? days.map((d) => ({ id: d.id, date: d.dayDate })) : [],
    dayAccess: days.length > 1 ? e.dayAccess : "whole",
    // Lot 47 : créneau des exposants, pour la case « J'ai vu » de l'acceptation.
    arrivalExhibitors: arrivalsOf(e).exhibitors,
    id: e.id,
    slug: e.slug,
    title: e.title,
    format: e.format,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    city: e.city,
    posterUrl: eventPosterUrl(e),
    status: e.status,
    privateEvent: e.admission === "invite_only",
    lockAt: lockAt(e).toISOString(),
    rulesText: e.rulesText,
    admittedVehicleTypes: e.admittedVehicleTypes as InvitationEventBrief["admittedVehicleTypes"],
    structure: { name: s.name, slug: s.slug, logoUrl: storage.url(s.logoKey) },
  };
}

/** Statut vu par l'invité : une invitation encore « en attente » d'un événement verrouillé, annulé ou fini a expiré. */
function displayStatus(inv: InvitationRow, e: EventRow, t: Date): InvitationStatus {
  if (inv.status !== "pending") return inv.status;
  return e.status !== "published" || isLocked(e, t) || e.endsAt <= t ? "expired" : "pending";
}

async function vehicleLabels(ids: string[], ex: Executor = db): Promise<Map<string, string>> {
  const rows = await vehiclesRepo.findFullByIds([...new Set(ids)], ex);
  return new Map(rows.map((v) => [v.id, vehicleLabel(v)]));
}

/** La notification « invitation reçue » d'une invitation traitée ou retirée ne reste pas non lue. */
async function closeNotification(ex: Executor, invitationIds: string[]) {
  if (!invitationIds.length) return;
  await ex
    .update(notifications)
    .set({ readAt: now() })
    .where(
      and(
        eq(notifications.type, "event_invitation_received"),
        inArray(sql`${notifications.data} ->> 'invitationId'`, invitationIds),
        isNull(notifications.readAt),
      ),
    );
}

function publishInbox(after: After, userIds: (string | null)[]) {
  after(() => {
    notificationsService.kick();
    for (const id of new Set(userIds)) {
      if (!id) continue;
      inboxService.publish(id);
      realtime.publish(`user:${id}`, "invitation.received", {});
    }
  });
}

/** L'événement accepte-t-il encore des invitations ? (publié, non annulé, non verrouillé) */
function assertInvitable(e: EventRow) {
  if (e.status === "draft") throw conflict("conflict", "Publie l'événement avant d'inviter");
  if (e.status === "cancelled") throw conflict("conflict", "Événement annulé");
  if (isLocked(e, now())) throw lockedError();
}

type Target =
  | { kind: "user"; label: string; userId: string; vehicleId: null }
  | { kind: "vehicle"; label: string; userId: string; vehicleId: string }
  | { kind: "email"; label: string; email: string };

/**
 * Crée les invitations (sous le verrou de l'événement et un verrou consultatif de la structure) : dédoublonnage (une
 * invitation par personne et par événement, une par adresse en attente), garde anti-insistance (une notification par
 * personne, événement et 24 h, même après un retrait), bannis exclus, limites par structure et par jour.
 */
async function createInTx(
  tx: Tx,
  after: After,
  v: Viewer,
  e: EventRow,
  s: StructureRow,
  targets: Target[],
  message: string | null,
  sourceEventId: string | null,
  /** Vrai (« Inviter les retenus ») : au-delà de la limite du jour, on invite jusqu'à la limite au lieu de tout refuser. */
  partial = false,
): Promise<InvitationCreateResult> {
  const t = now();
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invitations:structure:${s.id}`}))`);
  // Invitations par e-mail : un plafond pour tout Orasso (budget Brevo commun), compté sous un verrou unique.
  if (targets.some((x) => x.kind === "email")) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('invitations:emails'))`);
  }
  const skipped: InvitationCreateResult["skipped"] = [];
  const skip = (target: string, reason: InvitationSkipReason) => skipped.push({ target, reason });

  const userIds = [...new Set(targets.flatMap((x) => (x.kind === "email" ? [] : [x.userId])))];
  const banned = new Set(
    userIds.length
      ? (
          await tx
            .select({ userId: structureBans.userId })
            .from(structureBans)
            .where(and(eq(structureBans.structureId, s.id), inArray(structureBans.userId, userIds)))
        ).map((r) => r.userId)
      : [],
  );
  const existing = await tx
    .select({
      userId: eventInvitations.userId,
      email: eventInvitations.email,
      status: eventInvitations.status,
      createdAt: eventInvitations.createdAt,
    })
    .from(eventInvitations)
    .where(eq(eventInvitations.eventId, e.id));
  const since = new Date(t.getTime() - DAY_MS);
  const ACTIVE = ["pending", "accepted", "declined"];
  const invitedUsers = new Set(existing.flatMap((r) => (r.userId && ACTIVE.includes(r.status) ? [r.userId] : [])));
  const invitedEmails = new Set(
    existing.flatMap((r) => (!r.userId && r.email && r.status === "pending" ? [r.email.toLowerCase()] : [])),
  );
  // Garde de 24 h par adresse et par événement, même après un retrait (pas d'e-mails répétés à la même boîte).
  const recentEmails = new Set(
    existing.flatMap((r) => (r.email && r.createdAt >= since ? [r.email.toLowerCase()] : [])),
  );
  const recent = new Set(
    userIds.length
      ? (
          await tx
            .select({ userId: notifications.userId })
            .from(notifications)
            .where(
              and(
                inArray(notifications.userId, userIds),
                eq(notifications.type, "event_invitation_received"),
                sql`${notifications.data} ->> 'eventId' = ${e.id}`,
                sql`${notifications.createdAt} > now() - interval '24 hours'`,
              ),
            )
        ).map((r) => r.userId)
      : [],
  );

  const accepted: Target[] = [];
  for (const target of targets) {
    if (target.kind === "email") {
      if (invitedEmails.has(target.email)) skip(target.label, "already_invited");
      else if (recentEmails.has(target.email)) skip(target.label, "recent");
      else {
        invitedEmails.add(target.email);
        accepted.push(target);
      }
      continue;
    }
    if (target.userId === v.user.id) skip(target.label, "self");
    else if (banned.has(target.userId)) skip(target.label, "banned");
    else if (invitedUsers.has(target.userId)) skip(target.label, "already_invited");
    else if (recent.has(target.userId)) skip(target.label, "recent");
    else {
      invitedUsers.add(target.userId);
      accepted.push(target);
    }
  }

  // Limites en base, sur 24 h glissantes, pour toute la structure (tous ses événements et organisateurs). Les lignes ne
  // sont jamais supprimées (un retrait passe à `withdrawn`) et une invitation par e-mail garde son adresse une fois
  // rattachée : retirer puis renvoyer, ou faire accepter, ne libère rien.
  const [today] = await tx
    .select({
      n: count(),
      emails: sql<number>`count(*) filter (where ${eventInvitations.email} is not null)::int`,
    })
    .from(eventInvitations)
    .innerJoin(events, eq(events.id, eventInvitations.eventId))
    .where(and(eq(events.structureId, s.id), gte(eventInvitations.createdAt, since)));
  if (partial) {
    const room = Math.max(0, INVITATIONS_PER_STRUCTURE_PER_DAY - (today?.n ?? 0));
    for (const x of accepted.splice(room)) skip(x.label, "quota");
  }
  const emailCount = accepted.filter((x) => x.kind === "email").length;
  if (emailCount > 0) {
    const [all] = await tx
      .select({ n: count() })
      .from(eventInvitations)
      .where(and(isNotNull(eventInvitations.email), gte(eventInvitations.createdAt, since)));
    if ((all?.n ?? 0) + emailCount > EMAIL_INVITATIONS_PER_DAY_TOTAL) {
      throw new AppError(
        429,
        "rate_limited",
        "Trop d'invitations par e-mail aujourd'hui sur Orasso : réessaie demain, ou invite les personnes par leur pseudo.",
        { retryAfter: 86_400 },
      );
    }
  }
  if ((today?.n ?? 0) + accepted.length > INVITATIONS_PER_STRUCTURE_PER_DAY) {
    throw new AppError(
      429,
      "rate_limited",
      `Au plus ${INVITATIONS_PER_STRUCTURE_PER_DAY} invitations par jour pour une structure : réessaie demain.`,
      { retryAfter: 86_400 },
    );
  }
  if ((today?.emails ?? 0) + emailCount > EMAIL_INVITATIONS_PER_STRUCTURE_PER_DAY) {
    throw new AppError(
      429,
      "rate_limited",
      `Au plus ${EMAIL_INVITATIONS_PER_STRUCTURE_PER_DAY} invitations par e-mail par jour pour une structure : réessaie demain.`,
      { retryAfter: 86_400 },
    );
  }
  if (!accepted.length) return { created: 0, skipped };

  const rows = await tx
    .insert(eventInvitations)
    .values(
      accepted.map((x) => ({
        eventId: e.id,
        userId: x.kind === "email" ? null : x.userId,
        vehicleId: x.kind === "vehicle" ? x.vehicleId : null,
        email: x.kind === "email" ? x.email : null,
        token: randomBytes(24).toString("base64url"),
        status: "pending" as const,
        expiresAt: lockAt(e),
        createdBy: v.user.id,
        message,
        sourceEventId,
        // Personne : notifiée tout de suite ; adresse e-mail : posé quand l'e-mail est réellement parti.
        sentAt: x.kind === "email" ? null : t,
        createdAt: t,
        updatedAt: t,
      })),
    )
    .returning();

  for (const row of rows) {
    if (!row.userId) continue;
    await notificationsService.notify(tx, row.userId, "event_invitation_received", {
      title: L.notifTitle,
      body: L.notifBody(s.name, e.title),
      eventId: e.id,
      data: { eventId: e.id, invitationId: row.id, link: "/app/sorties" },
      link: { label: L.openAccess, path: "/app/sorties" },
    });
  }
  const mails = rows.filter((r) => !r.userId && r.email);
  after(async () => {
    for (const row of mails) {
      if (!row.email) continue;
      await mail.send(
        "event_invitation",
        row.email,
        renderMail(
          L.mailSubject(e.title),
          [L.mailIntro(s.name, e.title, formatDateTime(e.startsAt)), ...(row.message ? [row.message] : []), L.mailHow],
          { label: L.mailCta, url: `${env.PUBLIC_URL}/invitation-evenement/${row.token}` },
          { footer: "invitation" },
        ),
        { eventId: e.id, invitationId: row.id },
      );
      const [out] = await db
        .select({ status: emailOutbox.status })
        .from(emailOutbox)
        .where(sql`${emailOutbox.payload} ->> 'invitationId' = ${row.id}`)
        .orderBy(desc(emailOutbox.createdAt))
        .limit(1);
      if (out && out.status !== "skipped_quota" && out.status !== "failed") {
        await db.update(eventInvitations).set({ sentAt: now() }).where(eq(eventInvitations.id, row.id));
      }
    }
  });
  publishInbox(
    after,
    rows.map((r) => r.userId),
  );
  return { created: rows.length, skipped };
}

/** Une invitation (lecture simple, sans verrou), ou 404. */
async function findInvitation(id: string, ex: Executor = db): Promise<InvitationRow> {
  const [row] = await ex.select().from(eventInvitations).where(eq(eventInvitations.id, id));
  if (!row) throw notFound("Invitation introuvable");
  return row;
}

async function structureOf(id: string, ex: Executor = db): Promise<StructureRow> {
  const [s] = await ex.select().from(structures).where(eq(structures.id, id));
  if (!s) throw notFound("Structure introuvable");
  return s;
}

/** Organisateurs actifs de la structure (propriétaire, co-organisateurs) : prévenus d'un invité mis en attente. */
async function organizerIds(ex: Executor, structureId: string): Promise<string[]> {
  const rows = await ex
    .select({ userId: structureMembers.userId })
    .from(structureMembers)
    .where(
      and(
        eq(structureMembers.structureId, structureId),
        eq(structureMembers.status, "active"),
        inArray(structureMembers.role, ["owner", "co_organizer"]),
      ),
    );
  return rows.map((r) => r.userId);
}

async function receivedView(rows: InvitationRow[], ex: Executor = db): Promise<ReceivedInvitation[]> {
  if (!rows.length) return [];
  const t = now();
  const evRows = await ex
    .select({ e: events, s: structures })
    .from(events)
    .innerJoin(structures, eq(structures.id, events.structureId))
    .where(
      inArray(
        events.id,
        rows.map((r) => r.eventId),
      ),
    );
  const byEvent = new Map(evRows.map((r) => [r.e.id, r]));
  const multiDay = await daysRepo.manyMultiDay(
    evRows.map((r) => r.e.id),
    ex,
  );
  const labels = await vehicleLabels(
    rows.flatMap((r) => (r.vehicleId ? [r.vehicleId] : [])),
    ex,
  );
  const appIds = rows.flatMap((r) => (r.acceptedApplicationId ? [r.acceptedApplicationId] : []));
  const apps = appIds.length
    ? await ex
        .select({ id: applications.id, status: applications.status })
        .from(applications)
        .where(inArray(applications.id, appIds))
    : [];
  const appById = new Map(apps.map((a) => [a.id, a]));
  return rows.flatMap((r) => {
    const found = byEvent.get(r.eventId);
    if (!found) return [];
    const app = r.acceptedApplicationId ? appById.get(r.acceptedApplicationId) : undefined;
    return [
      {
        id: r.id,
        status: displayStatus(r, found.e, t),
        message: r.message,
        createdAt: r.createdAt.toISOString(),
        event: brief(found.e, found.s, multiDay.get(found.e.id)?.days),
        vehicle: r.vehicleId ? { id: r.vehicleId, label: labels.get(r.vehicleId) ?? "Véhicule" } : null,
        application: app ? { id: app.id, status: app.status } : null,
      },
    ];
  });
}

export const invitationsService = {
  /** `POST /events/:id/invitations` (organisateur : propriétaire ou co-organisateur actif, 2FA de session). */
  async create(v: Viewer, eventId: string, input: InvitationCreate): Promise<InvitationCreateResult> {
    const { s } = await requireEventSpeaker(v, eventId);
    // Personnes par pseudo : comptes ni supprimés ni suspendus ; une personne introuvable n'est pas distinguée d'un
    // compte inaccessible.
    const targets: Target[] = [];
    const skippedBefore: InvitationCreateResult["skipped"] = [];
    const t = now();
    for (const pseudo of [...new Set(input.pseudos.map((p) => p.toLowerCase()))]) {
      const [p] = await db
        .select({
          userId: profiles.userId,
          pseudo: profiles.pseudo,
          deletedAt: profiles.deletedAt,
          suspendedUntil: profiles.suspendedUntil,
        })
        .from(profiles)
        .where(sql`lower(${profiles.pseudo}) = ${pseudo}`);
      if (!p || p.deletedAt || (p.suspendedUntil && p.suspendedUntil > t))
        skippedBefore.push({ target: pseudo, reason: "unknown" });
      else targets.push({ kind: "user", label: p.pseudo, userId: p.userId, vehicleId: null });
    }
    const vehicleIds = [...new Set(input.vehicleIds)];
    if (vehicleIds.length) {
      const rows = await db
        .select({
          id: vehicles.id,
          ownerId: vehicles.ownerId,
          status: vehicles.status,
          deletedAt: profiles.deletedAt,
          suspendedUntil: profiles.suspendedUntil,
        })
        .from(vehicles)
        .innerJoin(profiles, eq(profiles.userId, vehicles.ownerId))
        .where(inArray(vehicles.id, vehicleIds));
      const labels = await vehicleLabels(vehicleIds);
      for (const id of vehicleIds) {
        const row = rows.find((r) => r.id === id);
        const label = labels.get(id) ?? id;
        if (row?.status !== "active" || row.deletedAt || (row.suspendedUntil && row.suspendedUntil > t)) {
          skippedBefore.push({ target: label, reason: "unknown" });
        } else targets.push({ kind: "vehicle", label, userId: row.ownerId, vehicleId: id });
      }
    }
    for (const email of [...new Set(input.emails.map((x) => x.trim().toLowerCase()))]) {
      targets.push({ kind: "email", label: email, email });
    }
    const result = await withTx(async (tx, after) => {
      const e = await eventsRepo.lockForUpdate(tx, eventId);
      assertInvitable(e);
      return createInTx(tx, after, v, e, s, targets, input.message ?? null, null);
    });
    return { created: result.created, skipped: [...skippedBefore, ...result.skipped] };
  },

  /**
   * `POST /events/:id/invitations/from-event` : invite les véhicules retenus d'une édition précédente (terminée) de la
   * même structure ; une invitation par personne (son premier véhicule retenu), doublons ignorés.
   */
  async fromEvent(v: Viewer, eventId: string, input: InvitationFromEvent): Promise<InvitationCreateResult> {
    const { s } = await requireEventSpeaker(v, eventId);
    if (input.sourceEventId === eventId) throw validation("Choisis une édition précédente");
    const source = await eventsRepo.byId(input.sourceEventId);
    if (source.structureId !== s.id) throw notFound("Événement introuvable");
    if (source.endsAt > now()) throw validation("Cette édition n'est pas encore terminée");
    const rows = await db
      .select({ vehicleId: applications.vehicleId, userId: applications.userId, status: vehicles.status })
      .from(applications)
      .innerJoin(vehicles, eq(vehicles.id, applications.vehicleId))
      .innerJoin(profiles, eq(profiles.userId, applications.userId))
      .where(
        and(
          eq(applications.eventId, source.id),
          eq(applications.kind, "vehicle"),
          eq(applications.status, "accepted"),
          isNull(profiles.deletedAt),
          or(isNull(profiles.suspendedUntil), lt(profiles.suspendedUntil, now())),
        ),
      )
      .orderBy(asc(applications.decidedAt), asc(applications.createdAt));
    const labels = await vehicleLabels(rows.flatMap((r) => (r.vehicleId ? [r.vehicleId] : [])));
    const seen = new Set<string>();
    const targets: Target[] = [];
    for (const r of rows) {
      if (!r.vehicleId || r.status !== "active" || seen.has(r.userId)) continue;
      seen.add(r.userId);
      targets.push({
        kind: "vehicle",
        label: labels.get(r.vehicleId) ?? "Véhicule",
        userId: r.userId,
        vehicleId: r.vehicleId,
      });
    }
    return withTx(async (tx, after) => {
      const e = await eventsRepo.lockForUpdate(tx, eventId);
      assertInvitable(e);
      return createInTx(tx, after, v, e, s, targets, input.message ?? null, source.id, true);
    });
  },

  /** `GET /events/:id/invitations` (organisateur). */
  async listForEvent(v: Viewer, eventId: string): Promise<OrganizerInvitation[]> {
    await requireEventReader(v, eventId);
    const rows = await db
      .select({ i: eventInvitations, pseudo: profiles.pseudo })
      .from(eventInvitations)
      .leftJoin(profiles, eq(profiles.userId, eventInvitations.userId))
      .where(eq(eventInvitations.eventId, eventId))
      .orderBy(desc(eventInvitations.createdAt), desc(eventInvitations.id))
      .limit(500);
    const labels = await vehicleLabels(rows.flatMap((r) => (r.i.vehicleId ? [r.i.vehicleId] : [])));
    const mailIds = rows.flatMap((r) => (r.i.email && !r.i.sentAt ? [r.i.id] : []));
    const skippedMails = new Set(
      mailIds.length
        ? (
            await db
              .select({ id: sql<string>`${emailOutbox.payload} ->> 'invitationId'` })
              .from(emailOutbox)
              .where(
                and(
                  eq(emailOutbox.status, "skipped_quota"),
                  inArray(sql`${emailOutbox.payload} ->> 'invitationId'`, mailIds),
                ),
              )
          ).map((m) => m.id)
        : [],
    );
    const appIds = rows.flatMap((r) => (r.i.acceptedApplicationId ? [r.i.acceptedApplicationId] : []));
    const apps = appIds.length
      ? await db
          .select({ id: applications.id, status: applications.status })
          .from(applications)
          .where(inArray(applications.id, appIds))
      : [];
    return rows.map(({ i, pseudo }) => {
      const app = apps.find((a) => a.id === i.acceptedApplicationId);
      return {
        id: i.id,
        kind: i.vehicleId ? "vehicle" : i.userId ? "user" : "email",
        status: i.status,
        pseudo: i.userId ? (pseudo ?? null) : null,
        vehicle: i.vehicleId ? { id: i.vehicleId, label: labels.get(i.vehicleId) ?? "Véhicule" } : null,
        // L'adresse saisie par l'organisateur, tant qu'elle n'est pas rattachée à un compte.
        email: i.userId ? null : i.email,
        message: i.message,
        createdAt: i.createdAt.toISOString(),
        sentAt: i.sentAt?.toISOString() ?? null,
        mailSkipped: skippedMails.has(i.id),
        declinedAt: i.declinedAt?.toISOString() ?? null,
        sourceEventId: i.sourceEventId,
        application: app ? { id: app.id, status: app.status } : null,
      };
    });
  },

  /** `DELETE /events/:id/invitations/:invitationId` : retirer une invitation **en attente** (organisateur). */
  async remove(v: Viewer, eventId: string, invitationId: string): Promise<void> {
    await requireEventSpeaker(v, eventId);
    await withTx(async (tx, after) => {
      const [row] = await tx
        .select()
        .from(eventInvitations)
        .where(and(eq(eventInvitations.id, invitationId), eq(eventInvitations.eventId, eventId)))
        .for("update");
      if (!row) throw notFound("Invitation introuvable");
      if (row.status !== "pending") throw conflict("conflict", "Seule une invitation en attente se retire");
      await tx.update(eventInvitations).set({ status: "withdrawn" }).where(eq(eventInvitations.id, row.id));
      await closeNotification(tx, [row.id]);
      publishInbox(after, [row.userId]);
    });
  },

  /** `GET /events/:id/invitations/sources` : éditions passées de la structure qui ont des retenus. */
  async sourceEvents(v: Viewer, eventId: string): Promise<InvitationSourceEvent[]> {
    const { e } = await requireEventReader(v, eventId);
    const rows = await db
      .select({
        id: events.id,
        title: events.title,
        startsAt: events.startsAt,
        n: sql<number>`count(${applications.id})::int`,
      })
      .from(events)
      .innerJoin(
        applications,
        and(eq(applications.eventId, events.id), eq(applications.kind, "vehicle"), eq(applications.status, "accepted")),
      )
      .where(and(eq(events.structureId, e.structureId), lt(events.endsAt, now()), sql`${events.id} <> ${e.id}`))
      .groupBy(events.id)
      .orderBy(desc(events.startsAt))
      .limit(20);
    return rows.map((r) => ({ id: r.id, title: r.title, startsAt: r.startsAt.toISOString(), acceptedCount: r.n }));
  },

  /**
   * `GET /events/:id/invitations/candidates` : véhicules actifs des abonnés de la structure et des retenus de ses
   * éditions passées (docs/01 : « rechercher des véhicules pour des expositions sur invitation »). Bannis exclus.
   */
  async candidates(v: Viewer, eventId: string): Promise<InvitationCandidate[]> {
    const { e } = await requireEventReader(v, eventId);
    const rows = await db.execute<{ vehicle_id: string; pseudo: string; source: "follower" | "past" }>(sql`
      select distinct on (x.vehicle_id) x.vehicle_id, p.pseudo, x.source from (
        select v.id as vehicle_id, v.owner_id, 'follower' as source, 1 as o
          from ${structureFollows} f join ${vehicles} v on v.owner_id = f.user_id
          where f.structure_id = ${e.structureId} and v.status = 'active'
        union all
        select v.id, v.owner_id, 'past', 0
          from ${applications} a join ${events} ev on ev.id = a.event_id join ${vehicles} v on v.id = a.vehicle_id
          where ev.structure_id = ${e.structureId} and ev.id <> ${e.id} and ev.ends_at < ${now()}
            and a.status = 'accepted' and a.kind = 'vehicle' and v.status = 'active'
      ) x
      join ${profiles} p on p.user_id = x.owner_id and p.deleted_at is null
      where not exists (select 1 from ${structureBans} b where b.structure_id = ${e.structureId} and b.user_id = x.owner_id)
      order by x.vehicle_id, x.o
      limit 300`);
    const ids = rows.rows.map((r) => r.vehicle_id);
    const full = await vehiclesRepo.findFullByIds(ids);
    const byId = new Map(full.map((x) => [x.id, x]));
    return rows.rows.flatMap((r) => {
      const veh = byId.get(r.vehicle_id);
      if (!veh) return [];
      const photo = veh.photos[0];
      return [
        {
          vehicleId: r.vehicle_id,
          label: vehicleLabel(veh),
          pseudo: r.pseudo,
          photoUrl: photo ? storage.url(photo.storageKey) : null,
          source: r.source,
        },
      ];
    });
  },

  /** `GET /me/event-invitations` (Accès > Invitations reçues) : en attente, événement publié pas encore verrouillé. */
  async mine(v: Viewer): Promise<ReceivedInvitation[]> {
    const t = now();
    const rows = await db
      .select({ i: eventInvitations })
      .from(eventInvitations)
      .innerJoin(events, eq(events.id, eventInvitations.eventId))
      .where(
        and(
          eq(eventInvitations.status, "pending"),
          v.user.emailVerified && emailOf(v)
            ? or(
                eq(eventInvitations.userId, v.user.id),
                and(isNull(eventInvitations.userId), sql`lower(${eventInvitations.email}) = ${emailOf(v)}`),
              )
            : eq(eventInvitations.userId, v.user.id),
          eq(events.status, "published"),
          gt(events.endsAt, t),
        ),
      )
      .orderBy(asc(events.startsAt))
      .limit(100);
    const views = await receivedView(rows.map((r) => r.i));
    return views.filter((x) => x.status === "pending");
  },

  /** Compteur de la Boîte (Demandes) : invitations en attente de réponse. */
  async pendingCount(userId: string, ex: Executor = db): Promise<number> {
    const [row] = await ex
      .select({ n: count() })
      .from(eventInvitations)
      .innerJoin(events, eq(events.id, eventInvitations.eventId))
      .innerJoin(user, eq(user.id, userId))
      .where(
        and(
          eq(eventInvitations.status, "pending"),
          or(
            eq(eventInvitations.userId, userId),
            and(
              isNull(eventInvitations.userId),
              eq(user.emailVerified, true),
              sql`lower(${eventInvitations.email}) = lower(${user.email})`,
            ),
          ),
          eq(events.status, "published"),
          sql`${events.startsAt} - make_interval(mins => ${events.lockOffsetMinutes}) > ${now()}`,
        ),
      );
    return row?.n ?? 0;
  },

  /**
   * `POST /event-invitations/:id/accept {vehicleId?}` (l'invité) : candidature retenue directement (pass émis) s'il
   * reste une place, sinon en tête de la liste d'attente et l'organisation est prévenue (S25). Conditions : invitation
   * en attente et à moi, événement publié non verrouillé, non banni, véhicule actif à moi (celui de l'invitation s'il
   * y en a un), type admis, au moins une photo, sans transfert de plaque en cours.
   */
  async accept(v: Viewer, invitationId: string, input: InvitationAccept): Promise<InvitationAcceptResult> {
    if (isSuspended(v)) throw forbidden("Ton compte est suspendu : lecture seule.");
    const found = await findInvitation(invitationId);
    // Une invitation qui n'est pas à moi n'existe pas pour moi (pas d'énumération).
    if (!isRecipient(found, v)) throw notFound("Invitation introuvable");
    return withTx(async (tx, after) => {
      const t = now();
      const event = await eventsRepo.lockForUpdate(tx, found.eventId);
      const [inv] = await tx.select().from(eventInvitations).where(eq(eventInvitations.id, invitationId)).for("update");
      if (!inv || !isRecipient(inv, v)) throw notFound("Invitation introuvable");
      if (inv.status !== "pending") throw conflict("conflict", "Cette invitation a déjà reçu une réponse");
      if (event.status !== "published") throw conflict("conflict", "Événement annulé");
      if (event.endsAt <= t || isLocked(event, t)) throw lockedError();
      const banned = await tx.query.structureBans.findFirst({
        where: and(eq(structureBans.structureId, event.structureId), eq(structureBans.userId, v.user.id)),
      });
      if (banned) throw forbidden("Tu ne peux pas participer aux événements de cette structure");

      const vehicleId = inv.vehicleId ?? input.vehicleId;
      if (!vehicleId) throw validation(L.chooseVehicle);
      if (inv.vehicleId && input.vehicleId && input.vehicleId !== inv.vehicleId) {
        throw validation("Cette invitation est pour un véhicule précis");
      }
      const [veh] = await vehiclesRepo.findFullByIds([vehicleId], tx);
      // Le propriétaire actuel seulement (transfert de plaque du lot 31 : l'ancien véhicule passe « Vendu »).
      if (!veh || veh.ownerId !== v.user.id) throw notFound("Véhicule introuvable");
      const label = vehicleLabel(veh);
      if (veh.status !== "active") throw validation(`${label} n'est plus dans ton garage actif`);
      if (veh.pendingTransferId) {
        throw validation(`${label} : plaque en attente de transfert, tu ne peux pas t'inscrire pour le moment`, {
          plateTransfer: true,
        });
      }
      if (!event.admittedVehicleTypes.includes(veh.vehicleType)) {
        throw validation(`${label} : ce type de véhicule n'est pas admis`);
      }
      if (veh.photos.length === 0) throw validation(`${label} : ajoute au moins une photo`);

      // Invitation par e-mail : rattachée à mon compte au moment où je l'accepte.
      if (!inv.userId) {
        try {
          await tx.update(eventInvitations).set({ userId: v.user.id }).where(eq(eventInvitations.id, inv.id));
        } catch (error) {
          if (isUniqueViolation(error)) throw conflict("conflict", "Tu as déjà une invitation pour cet événement");
          throw error;
        }
      }
      const app = await applicationsService.createFromInvitation(tx, after, event, {
        userId: v.user.id,
        vehicleId,
        // Plusieurs jours (lot 26) : le jour choisi par l'invité (validé comme une candidature).
        eventDayId: input.eventDayId,
        // Lot 47 : « J'ai vu » l'horaire d'arrivée des exposants, comme une candidature.
        arrivalSeen: input.arrivalSeen,
        arrivalNote: input.arrivalNote,
      });
      const [updated] = await tx
        .update(eventInvitations)
        .set({ status: "accepted", acceptedApplicationId: app.id })
        .where(and(eq(eventInvitations.id, inv.id), eq(eventInvitations.status, "pending")))
        .returning({ id: eventInvitations.id });
      if (!updated) throw conflict("conflict", "Cette invitation a déjà reçu une réponse");
      await closeNotification(tx, [inv.id]);
      if (app.status === "waitlisted") {
        const s = await structureOf(event.structureId, tx);
        const orgs = await organizerIds(tx, event.structureId);
        await notificationsService.notifyMany(tx, orgs, "invitation_capacity_blocked", {
          title: L.capacityTitle,
          body: L.capacityBody(v.profile.pseudo, event.title),
          eventId: event.id,
          eventStartsAt: event.startsAt,
          data: { eventId: event.id, applicationId: app.id },
          link: { label: "Ouvrir les candidatures", path: `/orga/${s.slug}/e/${event.id}/candidatures` },
        });
      }
      publishInbox(after, [v.user.id]);
      return { outcome: app.status === "accepted" ? "accepted" : "waitlisted", applicationId: app.id };
    });
  },

  /** `POST /event-invitations/:id/decline` (l'invité). L'organisateur voit « Refusée » ; pas de nouvelle invitation. */
  async decline(v: Viewer, invitationId: string): Promise<void> {
    const found = await findInvitation(invitationId);
    if (!isRecipient(found, v)) throw notFound("Invitation introuvable");
    await withTx(async (tx, after) => {
      const [inv] = await tx.select().from(eventInvitations).where(eq(eventInvitations.id, invitationId)).for("update");
      if (!inv || !isRecipient(inv, v)) throw notFound("Invitation introuvable");
      if (inv.status !== "pending") throw conflict("conflict", "Cette invitation a déjà reçu une réponse");
      // Invitation par e-mail alors que j'en ai déjà une à mon compte pour cet événement : celle-ci disparaît (vérifié
      // avant l'écriture : une violation d'unicité avorterait la transaction).
      const [mineAlready] = inv.userId
        ? []
        : await tx
            .select({ id: eventInvitations.id })
            .from(eventInvitations)
            .where(
              and(
                eq(eventInvitations.eventId, inv.eventId),
                eq(eventInvitations.userId, v.user.id),
                inArray(eventInvitations.status, ["pending", "accepted", "declined"]),
              ),
            )
            .limit(1);
      await tx
        .update(eventInvitations)
        .set(
          mineAlready
            ? { status: "expired" }
            : { status: "declined", declinedAt: now(), userId: inv.userId ?? v.user.id },
        )
        .where(eq(eventInvitations.id, inv.id));
      await closeNotification(tx, [inv.id]);
      publishInbox(after, [v.user.id]);
    });
  },

  /** `GET /invitation-evenement/:token` (public) : l'événement (même privé : le lien est le secret), qui invite. */
  async linkView(token: string, viewer: Viewer | null): Promise<InvitationLinkView> {
    const [inv] = await db.select().from(eventInvitations).where(eq(eventInvitations.token, token));
    if (!inv) throw notFound(L.linkUnknown);
    const e = await eventsRepo.byId(inv.eventId);
    if (e.status === "draft") throw notFound(L.linkUnknown);
    const s = await structureOf(e.structureId);
    const labels = inv.vehicleId ? await vehicleLabels([inv.vehicleId]) : new Map<string, string>();
    const mine = Boolean(viewer && (isRecipient(inv, viewer) || (!inv.userId && sameEmail(inv, viewer))));
    const status = displayStatus(inv, e, now());
    // Le lien d'une invitation retirée, refusée, acceptée ou expirée ne montre plus l'événement (sauf à son destinataire).
    if (status !== "pending" && !mine) throw notFound(L.linkGone);
    return {
      status,
      event: brief(e, s, await daysRepo.list(e.id)),
      invitedBy: s.name,
      vehicle: inv.vehicleId ? { id: inv.vehicleId, label: labels.get(inv.vehicleId) ?? "Véhicule" } : null,
      mine,
      invitationId: mine ? inv.id : null,
    };
  },

  /**
   * `POST /invitation-evenement/:token/claim` (connecté) : rattache une invitation par e-mail au compte qui a la même
   * adresse (après connexion ou inscription par le lien). Une autre adresse : 403.
   */
  async claim(token: string, v: Viewer): Promise<ReceivedInvitation> {
    let verifiedNow = false;
    const result = await withTx(async (tx) => {
      const [inv] = await tx.select().from(eventInvitations).where(eq(eventInvitations.token, token)).for("update");
      if (!inv) throw notFound(L.linkUnknown);
      // Le lien reçu prouve l'accès à la boîte : une adresse identique non confirmée est confirmée ici.
      if (!(isRecipient(inv, v) || (!inv.userId && sameEmail(inv, v)))) throw forbidden(L.linkNotMine);
      if (inv.userId) return inv;
      if (inv.status !== "pending") return inv;
      if (!v.user.emailVerified) {
        await tx.update(user).set({ emailVerified: true }).where(eq(user.id, v.user.id));
        verifiedNow = true;
      }
      const [already] = await tx
        .select({ id: eventInvitations.id })
        .from(eventInvitations)
        .where(
          and(
            eq(eventInvitations.eventId, inv.eventId),
            eq(eventInvitations.userId, v.user.id),
            inArray(eventInvitations.status, ["pending", "accepted", "declined"]),
          ),
        )
        .limit(1);
      if (already) throw conflict("conflict", "Tu as déjà une invitation pour cet événement : ouvre-la depuis Accès");
      try {
        const [row] = await tx
          .update(eventInvitations)
          .set({ userId: v.user.id })
          .where(eq(eventInvitations.id, inv.id))
          .returning();
        return row ?? inv;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        throw conflict("conflict", "Tu as déjà une invitation pour cet événement : ouvre-la depuis Accès");
      }
    });
    // Confirmation par le lien : les mêmes suites qu'une confirmation par l'e-mail de Better Auth (parrainage).
    if (verifiedNow) {
      const { accountService } = await import("../account/service");
      await accountService.onEmailVerified(v.user.id).catch(() => undefined);
    }
    const [view] = await receivedView([result]);
    if (!view) throw notFound(L.linkUnknown);
    return view;
  },

  /**
   * Suppression du compte (lot 15) : dans la transaction de l'anonymisation. Reçues : en attente → expirées, adresse
   * effacée (y compris les invitations par e-mail à l'ancienne adresse) ; envoyées : auteur et message effacés.
   */
  async anonymizeForDeletedAccount(tx: Tx, userId: string, oldEmail: string | null): Promise<void> {
    if (oldEmail) {
      await tx
        .update(eventInvitations)
        .set({
          email: null,
          status: sql`case when ${eventInvitations.status} = 'pending' then 'expired'::invitation_status else ${eventInvitations.status} end`,
        })
        .where(and(isNull(eventInvitations.userId), sql`lower(${eventInvitations.email}) = ${oldEmail.toLowerCase()}`));
    }
    await tx
      .update(eventInvitations)
      .set({
        email: null,
        status: sql`case when ${eventInvitations.status} = 'pending' then 'expired'::invitation_status else ${eventInvitations.status} end`,
      })
      .where(eq(eventInvitations.userId, userId));
    await tx
      .update(eventInvitations)
      .set({ createdBy: null, message: null })
      .where(eq(eventInvitations.createdBy, userId));
    // Lien reçu inutilisable (et sans rapport avec la personne) : jeton renouvelé.
    await tx
      .update(eventInvitations)
      .set({ token: sql`md5(random()::text || ${eventInvitations.id}::text) || md5(clock_timestamp()::text)` })
      .where(eq(eventInvitations.userId, userId));
  },
};
