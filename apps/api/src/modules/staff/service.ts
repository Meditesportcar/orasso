// Staff d'un événement (ARCHITECTURE.md § 2.7, § 4.1) : lignes `event_staff`, rôles par événement, « je suis là »,
// relances quotidiennes, liste d'accès signée (complète ou différentielle) pour le scan hors ligne.
import { createHash, createHmac } from "node:crypto";
import {
  type AccessListEntry,
  staffRoles as ALL_STAFF_ROLES,
  accessListSigningText,
  type CheckinMethod,
  checkinStaffRoles,
  type EventStaffMember,
  type EventStaffUpdate,
  formatPlate,
  fromWallTime,
  isEventDay,
  isLocked,
  isMultiDay,
  lockAt,
  type MyStaffEvent,
  mediaLabels,
  type PassRevokedReason,
  providerTypeLabel,
  type StaffRole,
  type StaffSync,
  settleAt,
  staffModeClosesAt,
  staffModeOpensAt,
  type VendorTypeCode,
  wallTime,
} from "@orasso/shared";
import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  accessPasses,
  applications,
  checkins,
  eventStaff,
  events,
  eventZones,
  mediaProfiles,
  profiles,
  scanEvents,
  structureMembers,
  structures,
  user,
} from "../../db/schema";
import { requireOrganizer, type StaffAccess, staffAccess } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, forbidden, notFound } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { signing } from "../../lib/signing";
import { type Executor, withTx } from "../../lib/tx";
import { ensureOtpSecrets } from "../access/service";
import { daysRepo } from "../events/days";
import { type EventRow, eventsRepo } from "../events/repo";
import { notificationsService } from "../notifications/service";
import { passportService } from "../passport/service";
import { loadProviders } from "../providers/serializers";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";
import { shopService } from "./shop";

export type EventStaffRow = typeof eventStaff.$inferSelect;

/** Hachage de plaque de la synchro : HMAC-SHA256(sel de l'événement, plaque normalisée), 16 caractères hex. */
export function plateHash(salt: Buffer, plateNormalized: string): string {
  return createHmac("sha256", salt).update(plateNormalized, "utf8").digest("hex").slice(0, 16);
}

const asRoles = (roles: readonly string[]): StaffRole[] =>
  roles.filter((r): r is StaffRole => (ALL_STAFF_ROLES as readonly string[]).includes(r));

/**
 * Crée les lignes `event_staff` manquantes pour le staff actif de la structure (choix C25). Appelée à la
 * publication et à chaque lecture, ce qui couvre les membres arrivés après la publication ; sans effet une fois
 * l'événement fini (mode staff fermé à J+1).
 */
async function ensureRows(event: EventRow, ex: Executor = db) {
  if (event.status !== "published" || now() >= staffModeClosesAt(event)) return;
  await ex.execute(sql`
    insert into event_staff (event_id, user_id)
    select ${event.id}, m.user_id from structure_members m
    where m.structure_id = ${event.structureId} and m.role = 'staff' and m.status = 'active'
    on conflict (event_id, user_id) do nothing`);
}

/** Staff actif de l'événement (membre staff actif de la structure), avec ses rôles effectifs. */
async function members(event: EventRow, ex: Executor = db) {
  await ensureRows(event, ex);
  const rows = await ex
    .select({ es: eventStaff, m: structureMembers, pseudo: profiles.pseudo })
    .from(eventStaff)
    .innerJoin(
      structureMembers,
      and(
        eq(structureMembers.userId, eventStaff.userId),
        eq(structureMembers.structureId, event.structureId),
        eq(structureMembers.status, "active"),
        eq(structureMembers.role, "staff"),
      ),
    )
    .innerJoin(profiles, eq(profiles.userId, eventStaff.userId))
    .where(eq(eventStaff.eventId, event.id))
    .orderBy(asc(profiles.pseudo));
  return rows.map((r) => ({
    ...r.es,
    pseudo: r.pseudo,
    effectiveRoles: asRoles(r.es.roles ?? r.m.staffRoles),
    effectiveCanDecide: r.es.canDecide ?? r.m.canDecide,
  }));
}

/** Staff de l'événement (rôles demandés, ou n'importe lequel) ou organisateur ; 403 sinon. */
async function requireEventStaff(v: Viewer, event: EventRow, roles: readonly StaffRole[] = ALL_STAFF_ROLES) {
  await ensureRows(event);
  const access = await staffAccess(v, event.structureId, roles, event.id);
  if (!access) throw forbidden("Réservé au staff de l'événement");
  return access;
}

async function publishLive(eventId: string) {
  const { checkinsService } = await import("../checkins/service");
  realtime.publish(`event:${eventId}:live`, "live", await checkinsService.liveCounters(eventId));
}

function mapMember(m: Awaited<ReturnType<typeof members>>[number]): EventStaffMember {
  return {
    userId: m.userId,
    pseudo: m.pseudo,
    roles: m.effectiveRoles,
    rolesOverride: m.roles ? asRoles(m.roles) : null,
    canDecide: m.effectiveCanDecide,
    presence: m.presence,
    presenceUpdatedAt: m.presenceUpdatedAt?.toISOString() ?? null,
    reminderCount: m.reminderCount,
    lastRemindedAt: m.lastRemindedAt?.toISOString() ?? null,
    syncedAt: m.syncedAt?.toISOString() ?? null,
  };
}

const lockedError = (message: string) => new AppError(423, "locked", message);

/**
 * Marge du curseur de synchro : `updated_at` est l'heure de l'écriture, pas celle de la validation de la
 * transaction. Une modification écrite juste avant la lecture mais validée juste après aurait un `updated_at`
 * inférieur au plus grand vu, et serait sautée pour toujours. Le curseur reste donc en retrait de l'heure réelle
 * (heure système, comme `updated_at`, et non l'horloge métier) ; `since` étant inclusif, rien n'est perdu.
 */
const CURSOR_MARGIN_MS = 10_000;

export function syncCursor(entries: { updatedAt: string }[]): string {
  const safe = Date.now() - CURSOR_MARGIN_MS;
  const max = entries.reduce((m, e) => Math.max(m, Date.parse(e.updatedAt)), Number.NEGATIVE_INFINITY);
  return new Date(Math.min(Number.isFinite(max) ? max : safe, safe)).toISOString();
}

/**
 * Liste d'accès, liste et recherche du staff : de la veille 00:00 jusqu'au règlement de J+2 (ARCHITECTURE.md
 * § 2.7) ; l'organisation garde l'accès en permanence.
 */
export function assertStaffWindow(event: EventRow, access: StaffAccess) {
  if (access.actor !== "staff") return;
  const t = now();
  if (t < staffModeOpensAt(event) || t >= settleAt(event) || event.settledAt) {
    throw forbidden("Liste du staff : de la veille de l'événement jusqu'au règlement des points");
  }
}

/**
 * Relance ceux qui n'ont pas répondu et pas été relancés aujourd'hui (heure de Paris) : notification et e-mail,
 * compteur de relances. `only` : une seule personne.
 */
async function remindPending(
  event: EventRow,
  today: { year: number; month: number; day: number },
  only?: string,
): Promise<number> {
  const t = now();
  const candidates = (await members(event)).filter((m) => (!only || m.userId === only) && m.presence === "unknown");
  if (!candidates.length) return 0;
  // Début du jour de Paris : une seule relance par jour et par personne.
  const dayStart = fromWallTime({ ...today, hour: 0, minute: 0 });
  return withTx(async (tx, after) => {
    let sent = 0;
    for (const m of candidates) {
      // Écriture conditionnelle : seul celui dont la ligne est réellement mise à jour est notifié (double clic,
      // tâche du matin et bouton en même temps = un seul envoi).
      const [row] = await tx
        .update(eventStaff)
        .set({ reminderCount: sql`${eventStaff.reminderCount} + 1`, lastRemindedAt: t })
        .where(
          and(
            eq(eventStaff.id, m.id),
            eq(eventStaff.presence, "unknown"),
            or(isNull(eventStaff.lastRemindedAt), lt(eventStaff.lastRemindedAt, dayStart)),
          ),
        )
        .returning({ id: eventStaff.id });
      if (!row) continue;
      await notificationsService.notify(tx, m.userId, "staff_presence_reminder", {
        title: "Seras-tu là ?",
        body: `« ${event.title} », ${formatDateTime(event.startsAt)} : dis à l'équipe si tu seras là.`,
        eventId: event.id,
        eventStartsAt: event.startsAt,
        data: { eventId: event.id, screen: "staff" },
        link: { label: "Répondre", path: "/app/sorties" },
      });
      sent++;
    }
    if (sent > 0) after(() => notificationsService.kick());
    return sent;
  });
}

export const staffService = {
  ensureRows,
  members,
  requireEventStaff,

  /** Organisateur : présences, relances, rôles de l'événement. */
  async list(v: Viewer, eventId: string): Promise<EventStaffMember[]> {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    return (await members(event)).map(mapMember);
  },

  /** Organisateur : rôles et droit de trancher pour l'événement, présence corrigée jusqu'au règlement. */
  async update(v: Viewer, eventId: string, userId: string, input: EventStaffUpdate): Promise<EventStaffMember> {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    const current = (await members(event)).find((m) => m.userId === userId);
    if (!current) throw notFound("Ce membre n'est pas dans le staff de l'événement");
    if (input.presence !== undefined && event.settledAt) throw lockedError("Points déjà attribués");
    await db
      .update(eventStaff)
      .set({
        ...(input.roles !== undefined ? { roles: input.roles } : {}),
        ...(input.canDecide !== undefined ? { canDecide: input.canDecide } : {}),
        ...(input.presence !== undefined ? { presence: input.presence, presenceUpdatedAt: now() } : {}),
      })
      .where(eq(eventStaff.id, current.id));
    if (input.presence !== undefined) await publishLive(eventId);
    // Lot 49 : présence corrigée par l'organisateur → tampon « staff » posé (jour J) ou retiré.
    if (input.presence !== undefined)
      await passportService.onStaffPresence(event, userId, input.presence === "present");
    const updated = (await members(event)).find((m) => m.userId === userId);
    if (!updated) throw notFound("Membre introuvable");
    return mapMember(updated);
  },

  /** « Je suis là / pas là » (modifiable jusqu'au règlement de J+2). */
  async setPresence(v: Viewer, eventId: string, present: boolean) {
    const event = await eventsRepo.byId(eventId);
    if (event.status !== "published") throw notFound("Événement introuvable");
    await ensureRows(event);
    const mine = (await members(event)).find((m) => m.userId === v.user.id);
    if (!mine) throw forbidden("Tu n'es pas dans le staff de cet événement");
    if (event.settledAt) throw lockedError("Points déjà attribués");
    const presence = present ? "present" : "absent";
    await db.update(eventStaff).set({ presence, presenceUpdatedAt: now() }).where(eq(eventStaff.id, mine.id));
    realtime.publish(`event:${eventId}:access`, "staff.presence", { userId: v.user.id, presence });
    await publishLive(eventId);
    // Lot 49 : tampon « staff » si « là » est posé le jour J (3 h avant le début à la fin), retiré si « pas là ».
    await passportService.onStaffPresence(event, v.user.id, present);
    return { presence };
  },

  /** « Où je suis staff » : événements publiés jusqu'à leur fermeture à J+1. */
  async myEvents(v: Viewer): Promise<MyStaffEvent[]> {
    const t = now();
    const rows = await db
      .select({ e: events, s: structures })
      .from(structureMembers)
      .innerJoin(events, eq(events.structureId, structureMembers.structureId))
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(
        and(
          eq(structureMembers.userId, v.user.id),
          eq(structureMembers.role, "staff"),
          eq(structureMembers.status, "active"),
          eq(events.status, "published"),
          gt(sql`${events.endsAt} + interval '1 day'`, t),
        ),
      )
      .orderBy(asc(events.startsAt));
    const result: MyStaffEvent[] = [];
    for (const { e, s } of rows) {
      const mine = (await members(e)).find((m) => m.userId === v.user.id);
      if (!mine) continue;
      const locked = isLocked(e, t);
      const lock = lockAt(e);
      result.push({
        event: {
          id: e.id,
          eventNo: e.eventNo,
          slug: e.slug,
          title: e.title,
          format: e.format,
          startsAt: e.startsAt.toISOString(),
          endsAt: e.endsAt.toISOString(),
          city: e.city,
          lockAt: lock.toISOString(),
          isLocked: locked,
        },
        structure: { id: s.id, name: s.name },
        roles: mine.effectiveRoles,
        canDecide: mine.effectiveCanDecide,
        presence: mine.presence,
        syncedAt: mine.syncedAt?.toISOString() ?? null,
        pendingSync: !mine.syncedAt || (locked && mine.syncedAt < lock),
        staffModeOpensAt: staffModeOpensAt(e).toISOString(),
        staffModeClosesAt: staffModeClosesAt(e).toISOString(),
        staffModeOpen: t >= staffModeOpensAt(e) && t < staffModeClosesAt(e),
      });
    }
    return result;
  },

  /**
   * Liste d'accès signée (§ 4.1, § 3.2) : une entrée par pass (valide ou révoqué), complète ou depuis `since`.
   * Plaque : 3 premiers caractères + hachage salé (le staff) ; en clair pour l'organisateur seulement.
   * Coordonnées : super staff et organisateur.
   */
  async sync(v: Viewer, eventId: string, since?: Date): Promise<StaffSync> {
    const event = await eventsRepo.byId(eventId);
    if (event.status === "draft") throw notFound("Événement introuvable");
    const access = await requireEventStaff(v, event);
    const t = now();
    assertStaffWindow(event, access);
    const days = await daysRepo.list(event.id);
    const multiDays = isMultiDay(days) ? days : [];
    const entries = await accessEntries(event, access, new Map(multiDays.map((d) => [d.id, d.dayDate])));
    // Rôle boutique (lot 24) : billets du public, seulement si la boutique est activée pour cet événement. Un staff
    // sans ce rôle n'en reçoit jamais (le corps signé ne contient alors ni `tickets` ni `shopEnabled`).
    const withShop = event.shopEnabled && access.roles.includes("shop");
    const allTickets = withShop ? await shopService.ticketEntries(event) : [];
    // Delta : `>=` sur le curseur (au milliseconde près) ; une entrée renvoyée deux fois est simplement réécrite.
    const newer = <T extends { updatedAt: string }>(list: T[]) =>
      since ? list.filter((e) => Date.parse(e.updatedAt) >= since.getTime()) : list;
    const delta = newer(entries);
    const cursor = syncCursor([...entries, ...allTickets]);
    const zones = await db.query.eventZones.findMany({
      where: eq(eventZones.eventId, eventId),
      orderBy: [asc(eventZones.position), asc(eventZones.code)],
    });
    const body: Omit<StaffSync, "signature" | "signatureKid"> = {
      event: {
        id: event.id,
        eventNo: event.eventNo,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        lockAt: lockAt(event).toISOString(),
        isLocked: isLocked(event, t),
        plateSalt: event.plateSalt.toString("base64url"),
        zones: zones.map((z) => ({ id: z.id, code: z.code, name: z.name, capacity: z.capacity })),
        // Plusieurs jours (lot 26) : les jours, pour le filtre « Aujourd'hui » et le jour affiché de chaque entrée.
        days: multiDays.map((d) => ({
          id: d.id,
          date: d.dayDate,
          startsAt: d.startsAt.toISOString(),
          endsAt: d.endsAt.toISOString(),
        })),
      },
      keys: (await signing.publicKeys()).map((k) => ({ kid: k.kid, publicKey: k.publicKey, retiredAt: k.retiredAt })),
      myRoles: access.roles,
      full: !since,
      entries: delta,
      ...(withShop ? { tickets: newer(allTickets), shopEnabled: true } : {}),
      removedPassIds: [],
      cursor,
      generatedAt: t.toISOString(),
    };
    const digest = createHash("sha256").update(accessListSigningText(body), "utf8").digest();
    const { kid, signature } = signing.sign(digest);
    if (access.actor === "staff") {
      await db
        .update(eventStaff)
        .set({ syncedAt: t })
        .where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.userId, v.user.id)));
    }
    return { ...body, signatureKid: kid, signature: signature.toString("base64url") };
  },

  /**
   * Tâche `staff.remind` (chaque jour à 10:00, Paris) : relance par notification et e-mail le staff qui n'a pas dit
   * s'il serait là ; arrêt le jour J (docs/01). Une seule relance par jour et par personne.
   */
  async remindUnanswered(): Promise<number> {
    const t = now();
    const today = wallTime(t);
    const upcoming = await db.query.events.findMany({
      where: and(eq(events.status, "published"), gt(events.startsAt, t)),
    });
    let sent = 0;
    for (const event of upcoming) {
      if (isEventDay(event.startsAt, t)) continue;
      sent += await remindPending(event, today);
    }
    return sent;
  },

  /**
   * « Relancer » depuis le site (lot 24) : l'organisation relance tout de suite ceux qui n'ont pas dit s'ils seraient
   * là (ou une seule personne). Même règle que la relance du matin : une par jour et par personne, arrêt au début de
   * l'événement. Rend le nombre de personnes relancées.
   */
  async remind(v: Viewer, eventId: string, userId?: string): Promise<{ reminded: number }> {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    if (event.status !== "published") throw notFound("Événement introuvable");
    const t = now();
    if (t >= event.startsAt || isEventDay(event.startsAt, t)) {
      throw lockedError("Le jour J, le staff est sur place : plus de relance");
    }
    if (userId && !(await members(event)).some((m) => m.userId === userId)) {
      throw notFound("Ce membre n'est pas dans le staff de l'événement");
    }
    return { reminded: await remindPending(event, wallTime(t), userId) };
  },

  /** Rappel de synchronisation au verrouillage, au staff présent ou qui n'a pas répondu (§ 2.3). */
  async notifySyncReminder(tx: Executor, event: EventRow) {
    for (const m of await members(event, tx)) {
      if (m.presence === "absent") continue;
      await notificationsService.notify(tx, m.userId, "staff_sync_reminder", {
        title: "Synchronise la liste",
        body: `Les inscriptions de « ${event.title} » sont verrouillées : synchronise la liste d'accès avant d'arriver, le scan marchera sans réseau.`,
        eventId: event.id,
        eventStartsAt: event.startsAt,
        data: { eventId: event.id, screen: "staff" },
        link: { label: "Ouvrir le mode staff", path: "/app/sorties?vue=staff" },
      });
    }
  },
};

/** Entrées de la liste d'accès, une par pass de l'événement. */
async function accessEntries(
  event: EventRow,
  access: StaffAccess,
  dayDates: Map<string, string> = new Map(),
): Promise<AccessListEntry[]> {
  const organizer = access.actor !== "staff";
  const withContact = organizer || access.roles.includes("super_staff");
  const rows = await db
    .select({ pass: accessPasses, app: applications, checkin: checkins, profile: profiles, email: user.email })
    .from(accessPasses)
    .innerJoin(applications, eq(applications.id, accessPasses.applicationId))
    .innerJoin(profiles, eq(profiles.userId, applications.userId))
    .innerJoin(user, eq(user.id, applications.userId))
    .leftJoin(checkins, eq(checkins.applicationId, applications.id))
    .where(eq(accessPasses.eventId, event.id))
    .orderBy(asc(profiles.pseudo), asc(accessPasses.issuedAt));
  // Lot 48 : secret du code tournant OR2 de chaque pass valide (généré ici pour un pass antérieur au lot 48), envoyé
  // seulement aux rôles qui pointent et à l'organisateur (relecture : qui détient le secret peut fabriquer le code).
  const withSecrets = organizer || access.roles.some((r) => checkinStaffRoles.includes(r));
  const otpSecrets = withSecrets
    ? await ensureOtpSecrets(
        db,
        rows.map((r) => r.pass),
      )
    : new Map<string, Buffer>();
  const vehicleIds = [...new Set(rows.flatMap((r) => (r.app.vehicleId ? [r.app.vehicleId] : [])))];
  const vehicles = new Map((await vehiclesRepo.findFullByIds(vehicleIds)).map((x) => [x.id, x]));
  const providers = await loadProviders(
    rows.flatMap((r) => (r.app.providerProfileId ? [r.app.providerProfileId] : [])),
  );
  // Lot 45 : accréditation presse, « Presse · Sud Cars » (le nom vient du profil média).
  const mediaIds = [...new Set(rows.flatMap((r) => (r.app.mediaProfileId ? [r.app.mediaProfileId] : [])))];
  const mediaNames = new Map(
    (mediaIds.length ? await db.select().from(mediaProfiles).where(inArray(mediaProfiles.id, mediaIds)) : []).map(
      (m) => [m.id, m.name],
    ),
  );
  // Lot 26 : plusieurs jours, dernière lecture reçue par candidature (arrivés du jour d'un « tout l'événement »).
  const lastSeen = new Map<string, Date>();
  if (dayDates.size) {
    const seen = await db
      .select({ appId: scanEvents.applicationId, at: sql<Date>`max(${scanEvents.scannedAt})` })
      .from(scanEvents)
      .where(
        and(
          eq(scanEvents.eventId, event.id),
          inArray(scanEvents.serverResult, ["accepted", "duplicate_same_device", "duplicate_other_device"]),
        ),
      )
      .groupBy(scanEvents.applicationId);
    for (const r of seen) if (r.appId && r.at) lastSeen.set(r.appId, new Date(r.at));
  }
  const zoneIds = [...new Set(rows.flatMap((r) => (r.app.zoneId ? [r.app.zoneId] : [])))];
  const zones = new Map(
    (zoneIds.length ? await db.query.eventZones.findMany({ where: inArray(eventZones.id, zoneIds) }) : []).map((z) => [
      z.id,
      z,
    ]),
  );
  return rows.map(({ pass, app, checkin, profile, email }) => {
    const v = app.vehicleId ? vehicles.get(app.vehicleId) : undefined;
    const zone = app.zoneId ? zones.get(app.zoneId) : undefined;
    const plate = v?.plateNormalized && !v.unregistered ? v.plateNormalized : null;
    const valid = !pass.revokedAt;
    const seenAt = lastSeen.get(app.id) ?? null;
    const updatedAt = Math.max(
      pass.updatedAt.getTime(),
      app.updatedAt.getTime(),
      checkin?.updatedAt.getTime() ?? 0,
      seenAt?.getTime() ?? 0,
      // Secret OR2 généré à l'instant : l'entrée part aussi dans une synchro différentielle.
      !pass.otpSecret && otpSecrets.has(pass.id) ? Date.now() : 0,
    );
    if (!valid) {
      // Pass révoqué : juste de quoi refuser le QR au scan (« Désisté », « Non admis »…), rien de plus en cache.
      return {
        passId: pass.id,
        applicationId: app.id,
        status: "revoked",
        revokedReason: (pass.revokedReason as PassRevokedReason | null) ?? null,
        pseudo: profile.pseudo,
        vehicleLabel: null,
        vehicleType: null,
        kind: app.kind,
        providerType: null,
        providerName: null,
        categories: [],
        plateHint: null,
        plateHash: null,
        zoneCode: null,
        zoneName: null,
        checkedInAt: null,
        checkinMethod: null,
        dayDate: null,
        updatedAt: new Date(updatedAt).toISOString(),
      } satisfies AccessListEntry;
    }
    const prov = app.providerProfileId ? providers.get(app.providerProfileId) : undefined;
    const provType = prov ? providerTypeLabel(prov.type as VendorTypeCode, prov.customType) : null;
    const media = app.kind === "media" ? (mediaNames.get(app.mediaProfileId ?? "") ?? "") : null;
    const entry: AccessListEntry = {
      passId: pass.id,
      applicationId: app.id,
      status: "valid",
      revokedReason: null,
      pseudo: profile.pseudo,
      // Prestataire : « Food truck · La Caravane » (§ 6.2) ; l'écran de scan dit « Prestataire · Food truck ».
      vehicleLabel:
        media !== null
          ? mediaLabels.pressLabel(media)
          : prov
            ? `${provType} · ${prov.name}`
            : v
              ? vehicleLabel(v)
              : null,
      vehicleType: v?.vehicleType ?? null,
      kind: app.kind,
      // Média : résultat de scan « Presse », nom du média à la place du pseudo.
      providerType: media !== null ? mediaLabels.scanKind : provType,
      providerName: media ?? prov?.name ?? null,
      categories: v ? v.categories.map((c) => c.category.slug) : [],
      plateHint: plate ? plate.slice(0, 3) : null,
      plateHash: plate ? plateHash(event.plateSalt, plate) : null,
      otpSecret: otpSecrets.get(pass.id)?.toString("base64url") ?? null,
      zoneCode: zone?.code ?? null,
      zoneName: zone?.name ?? null,
      checkedInAt: checkin ? checkin.checkedInAt.toISOString() : null,
      checkinMethod: checkin ? (checkin.method as CheckinMethod) : null,
      // Lot 26 : jour de la candidature (`null` = tout l'événement), lu au scan (« Autre jour »).
      dayDate: app.eventDayId ? (dayDates.get(app.eventDayId) ?? null) : null,
      ...(dayDates.size ? { lastSeenAt: seenAt?.toISOString() ?? null } : {}),
      updatedAt: new Date(updatedAt).toISOString(),
    };
    if (organizer) entry.plate = v?.plate ? formatPlate(v.plate) : null;
    if (withContact) {
      entry.contact = { firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone, email };
    }
    return entry;
  });
}
