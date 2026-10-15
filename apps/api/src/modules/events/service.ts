// Événements (ARCHITECTURE.md § 1.4, § 2.8) : lecture publique, création minimale (l'assistant complet est au
// lot 13), publication, modification, statut Maintenu/Incertain, annulation, zones.
import { randomBytes } from "node:crypto";
import {
  type EventCard,
  type EventCreate,
  type EventListQuery,
  type EventOrganizer,
  type EventOutlook,
  type EventPublic,
  type EventUpdate,
  eventOutlookLabels,
  isLocked,
  lockAt,
  type Page,
  registrationOpensAt,
  staffRoles,
  type zoneCreateSchema,
  type zoneUpdateSchema,
} from "@orasso/shared";
import { and, asc, eq, gte, ilike, ne, or, type SQL, sql } from "drizzle-orm";
import type { z } from "zod";

import { db } from "../../db/client";
import { applications, events, eventZones, structureFollows, structureMembers, structures } from "../../db/schema";
import { requireOrganizer, staffAccess } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, forbidden, notFound, validation } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { uniqueSlug } from "../../lib/slug";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { applicationsService } from "../applications/service";
import { notificationsService } from "../notifications/service";
import { isFollowing, structureById } from "../structures/service";
import { scheduleEventJobs } from "./jobs";
import { type EventRow, eventsRepo } from "./repo";

type StructureRow = typeof structures.$inferSelect;

function card(
  e: EventRow,
  s: Pick<StructureRow, "id" | "slug" | "name" | "logoKey">,
  remaining: number | null,
): EventCard {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    format: e.format,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    city: e.city,
    department: e.department,
    posterUrl: storage.url(e.posterKey),
    status: e.status,
    outlook: e.outlook,
    structure: { id: s.id, slug: s.slug, name: s.name, logoUrl: storage.url(s.logoKey) },
    capacity: e.capacity,
    remaining,
  };
}

async function publicView(e: EventRow, s: StructureRow, showInstructions: boolean): Promise<EventPublic> {
  const counters = await eventsRepo.counters(e);
  const t = now();
  return {
    ...card(e, s, counters.remaining),
    description: e.description,
    addressLine: e.addressLine,
    postalCode: e.postalCode,
    lat: e.lat,
    lng: e.lng,
    timezone: e.timezone,
    admittedVehicleTypes: e.admittedVehicleTypes as EventPublic["admittedVehicleTypes"],
    maxVehiclesPerUser: e.maxVehiclesPerUser,
    admission: e.admission,
    criteria: e.criteria ?? null,
    publicAccess: e.publicAccess,
    externalTicketUrl: e.externalTicketUrl,
    registrationsOpenAt: e.registrationsOpenAt.toISOString(),
    previewHours: e.previewHours,
    lockAt: lockAt(e).toISOString(),
    isLocked: isLocked(e, t),
    rulesText: e.rulesText,
    instructions: showInstructions ? e.instructions : null,
    acceptedCount: counters.accepted,
  };
}

async function isMember(structureId: string, userId: string) {
  const m = await db.query.structureMembers.findFirst({
    where: and(
      eq(structureMembers.structureId, structureId),
      eq(structureMembers.userId, userId),
      eq(structureMembers.status, "active"),
    ),
    columns: { id: true },
  });
  return Boolean(m);
}

/** Organisateur de l'événement ; renvoie l'événement. */
async function organizerEvent(v: Viewer, id: string) {
  const e = await eventsRepo.byId(id);
  const access = await requireOrganizer(v, e.structureId);
  return { e, access };
}

const ADDRESS_FIELDS = ["addressLine", "postalCode", "city", "lat", "lng"] as const;

export const eventsService = {
  async list(q: EventListQuery): Promise<Page<EventCard>> {
    const t = now();
    const filters: (SQL | undefined)[] = [
      eq(events.status, "published"),
      ne(events.admission, "invite_only"),
      eq(structures.verification, "verified"),
      gte(events.endsAt, q.from ?? t),
    ];
    if (q.to) filters.push(sql`${events.startsAt} <= ${q.to.toISOString()}::timestamptz`);
    if (q.format) filters.push(eq(events.format, q.format));
    if (q.department) filters.push(eq(events.department, q.department));
    if (q.structureId) filters.push(eq(events.structureId, q.structureId));
    if (q.categoryId) filters.push(sql`${events.criteria} -> 'categoryIds' ? ${q.categoryId}`);
    if (q.q) filters.push(or(ilike(events.title, `%${q.q}%`), ilike(events.city, `%${q.q}%`)));
    if (q.lat !== undefined && q.lng !== undefined) {
      // Distance à vol d'oiseau (pas de PostGIS en V1, choix C24).
      const radius = q.radiusKm ?? 50;
      filters.push(sql`${events.lat} is not null and 6371 * acos(least(1, cos(radians(${q.lat})) * cos(radians(${events.lat}))
        * cos(radians(${events.lng}) - radians(${q.lng})) + sin(radians(${q.lat})) * sin(radians(${events.lat}))))
        <= ${radius}`);
    }
    const offset = q.cursor ? Number(Buffer.from(q.cursor, "base64url").toString()) || 0 : 0;
    const rows = await db
      .select({ e: events, s: structures })
      .from(events)
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(and(...filters))
      .orderBy(asc(events.startsAt), asc(events.id))
      .limit(q.limit + 1)
      .offset(offset);
    const items = await Promise.all(
      rows.slice(0, q.limit).map(async ({ e, s }) => card(e, s, (await eventsRepo.counters(e)).remaining)),
    );
    return {
      items,
      nextCursor: rows.length > q.limit ? Buffer.from(String(offset + q.limit)).toString("base64url") : null,
    };
  },

  /** Page publique d'un événement (`/e/<slug>`). Brouillon : 404 ; sur invitation : membres et candidats seulement. */
  async getPublic(slug: string, viewer: Viewer | null): Promise<EventPublic> {
    const e = await db.query.events.findFirst({ where: eq(events.slug, slug) });
    if (!e || e.status === "draft") throw notFound("Événement introuvable");
    const s = await structureById(e.structureId);
    const mine = viewer
      ? await db.query.applications.findMany({
          where: and(eq(applications.eventId, e.id), eq(applications.userId, viewer.user.id)),
          orderBy: [asc(applications.createdAt)],
        })
      : [];
    const member = viewer ? await isMember(e.structureId, viewer.user.id) : false;
    if (e.admission === "invite_only" && !member && mine.length === 0) throw notFound("Événement introuvable");
    const accepted = mine.some((a) => a.status === "accepted");
    const view = await publicView(e, s, member || accepted);
    if (!viewer) return view;
    const follower = await isFollowing(e.structureId, viewer.user.id);
    return {
      ...view,
      myApplications: mine.map((a) => ({ id: a.id, vehicleId: a.vehicleId, status: a.status })),
      registrationOpensAtForMe: registrationOpensAt(e, follower).toISOString(),
    };
  },

  async getForOrganizer(v: Viewer, id: string): Promise<EventOrganizer> {
    const { e } = await organizerEvent(v, id);
    const s = await structureById(e.structureId);
    const zones = await db.query.eventZones.findMany({
      where: eq(eventZones.eventId, id),
      orderBy: [asc(eventZones.position), asc(eventZones.code)],
    });
    return {
      ...(await publicView(e, s, true)),
      zones: zones.map((z) => ({ id: z.id, code: z.code, name: z.name, capacity: z.capacity, position: z.position })),
      counters: await eventsRepo.counters(e),
      publishedAt: e.publishedAt?.toISOString() ?? null,
      cancelledAt: e.cancelledAt?.toISOString() ?? null,
      lockedAt: e.lockedAt?.toISOString() ?? null,
    };
  },

  async listForStructure(v: Viewer, structureId: string) {
    await requireOrganizer(v, structureId);
    const s = await structureById(structureId);
    const rows = await db.query.events.findMany({
      where: eq(events.structureId, structureId),
      orderBy: [asc(events.startsAt)],
    });
    return Promise.all(rows.map(async (e) => card(e, s, (await eventsRepo.counters(e)).remaining)));
  },

  /** Création minimale en brouillon (organisateur). */
  async create(v: Viewer, structureId: string, input: EventCreate): Promise<EventOrganizer> {
    await requireOrganizer(v, structureId);
    const year = input.startsAt.getUTCFullYear();
    const slug = await uniqueSlug(`${input.title} ${year}`, (s) => eventsRepo.slugTaken(s));
    const [e] = await db
      .insert(events)
      .values({
        ...input,
        criteria: input.criteria ?? null,
        slug,
        structureId,
        plateSalt: randomBytes(16),
        status: "draft",
        createdBy: v.user.id,
      })
      .returning();
    if (!e) throw new Error("Création de l'événement impossible");
    return this.getForOrganizer(v, e.id);
  },

  /**
   * Modification. Après publication : changement de date ou d'adresse → tous les inscrits prévenus (docs/01) ;
   * tâches replanifiées ; une capacité augmentée libère des places pour la liste d'attente.
   */
  async update(v: Viewer, id: string, input: EventUpdate): Promise<EventOrganizer> {
    const { e } = await organizerEvent(v, id);
    if (e.status === "cancelled") throw conflict("conflict", "Événement annulé");
    const startsAt = input.startsAt ?? e.startsAt;
    const endsAt = input.endsAt ?? e.endsAt;
    if (endsAt <= startsAt) throw validation("La fin doit suivre le début", { field: "endsAt" });
    const updated = await withTx(async (tx, after) => {
      const current = await eventsRepo.lockForUpdate(tx, id);
      const [row] = await tx
        .update(events)
        .set({ ...input, criteria: input.criteria === undefined ? undefined : (input.criteria ?? null) })
        .where(eq(events.id, id))
        .returning();
      if (!row) throw notFound("Événement introuvable");
      if (row.status !== "published") return row;
      const datesChanged =
        row.startsAt.getTime() !== current.startsAt.getTime() || row.endsAt.getTime() !== current.endsAt.getTime();
      const addressChanged = ADDRESS_FIELDS.some((f) => row[f] !== current[f]);
      if (datesChanged || addressChanged) {
        const what = datesChanged ? `nouvelle date : ${formatDateTime(row.startsAt)}` : "nouvelle adresse";
        for (const userId of await eventsRepo.activeApplicantIds(id, tx)) {
          await notificationsService.notify(tx, userId, "event_updated", {
            title: "Événement modifié",
            body: `« ${row.title} » a changé (${what}).`,
            eventId: id,
            eventStartsAt: row.startsAt,
            data: { eventId: id },
            link: { label: "Voir l'événement", path: `/e/${row.slug}` },
          });
        }
      }
      const rescheduled =
        datesChanged ||
        row.lockOffsetMinutes !== current.lockOffsetMinutes ||
        row.previewHours !== current.previewHours ||
        row.registrationsOpenAt.getTime() !== current.registrationsOpenAt.getTime();
      if (rescheduled) after(() => scheduleEventJobs(row));
      await applicationsService.offerNext(tx, row, after);
      after(() => notificationsService.deliverDue());
      return row;
    });
    return this.getForOrganizer(v, updated.id);
  },

  /** Publication : réservée aux structures vérifiées (docs/01). Abonnés prévenus ; tâches planifiées. */
  async publish(v: Viewer, id: string): Promise<EventOrganizer> {
    const { e } = await organizerEvent(v, id);
    const s = await structureById(e.structureId);
    if (s.verification !== "verified") throw forbidden("Publication réservée aux structures vérifiées");
    if (e.status !== "draft") throw conflict("conflict", "Déjà publié ou annulé");
    await withTx(async (tx, after) => {
      const [row] = await tx
        .update(events)
        .set({ status: "published", publishedAt: now() })
        .where(and(eq(events.id, id), eq(events.status, "draft")))
        .returning();
      if (!row) throw conflict("conflict", "Déjà publié ou annulé");
      if (row.admission !== "invite_only") {
        const followers = await tx
          .select({ userId: structureFollows.userId })
          .from(structureFollows)
          .where(eq(structureFollows.structureId, row.structureId));
        for (const f of followers) {
          await notificationsService.notify(tx, f.userId, "new_event_followed", {
            title: `Nouvel événement · ${s.name}`,
            body: `« ${row.title} », ${formatDateTime(row.startsAt)}${row.city ? `, ${row.city}` : ""}.`,
            eventId: id,
            data: { eventId: id },
            link: { label: "Voir l'événement", path: `/e/${row.slug}` },
          });
        }
      }
      after(() => scheduleEventJobs(row));
      after(() => notificationsService.deliverDue());
    });
    return this.getForOrganizer(v, id);
  },

  /** Annulation (irréversible) : candidatures actives annulées sans malus, tout le monde notifié. */
  async cancel(v: Viewer, id: string): Promise<EventOrganizer> {
    await organizerEvent(v, id);
    await withTx(async (tx, after) => {
      const e = await eventsRepo.lockForUpdate(tx, id);
      if (e.status === "cancelled") throw conflict("conflict", "Déjà annulé");
      const [row] = await tx
        .update(events)
        .set({ status: "cancelled", cancelledAt: now() })
        .where(eq(events.id, id))
        .returning();
      if (!row) throw notFound("Événement introuvable");
      const cancelled = await applicationsService.cancelAll(tx, row, after);
      for (const userId of new Set(cancelled.map((a) => a.userId))) {
        await notificationsService.notify(tx, userId, "event_cancelled", {
          title: "Événement annulé",
          body: `« ${row.title} » (${formatDateTime(row.startsAt)}) est annulé par l'organisateur.`,
          eventId: id,
          eventStartsAt: row.startsAt,
          data: { eventId: id },
          link: { label: "Voir l'événement", path: `/e/${row.slug}` },
        });
      }
      after(() => realtime.publish(`event:${id}:access`, "event.cancelled", { eventId: id }));
      after(() => notificationsService.deliverDue());
    });
    return this.getForOrganizer(v, id);
  },

  /** Bandeau Maintenu / Incertain, envoyé à tous les inscrits (docs/01, bloc 4). */
  async setOutlook(v: Viewer, id: string, outlook: EventOutlook): Promise<EventOrganizer> {
    const { e } = await organizerEvent(v, id);
    if (e.status !== "published") throw conflict("conflict", "Événement non publié ou annulé");
    if (e.outlook !== outlook) {
      await withTx(async (tx, after) => {
        await tx.update(events).set({ outlook }).where(eq(events.id, id));
        const body =
          outlook === "uncertain"
            ? `« ${e.title} » passe en « ${eventOutlookLabels.uncertain} » : l'organisateur confirmera.`
            : `« ${e.title} » est « ${eventOutlookLabels.maintained} ».`;
        for (const userId of await eventsRepo.activeApplicantIds(id, tx)) {
          await notificationsService.notify(tx, userId, "event_outlook_changed", {
            title: eventOutlookLabels[outlook],
            body,
            eventId: id,
            eventStartsAt: e.startsAt,
            data: { eventId: id },
            link: { label: "Voir l'événement", path: `/e/${e.slug}` },
          });
        }
        after(() => notificationsService.deliverDue());
      });
    }
    return this.getForOrganizer(v, id);
  },

  async zones(v: Viewer, id: string) {
    await organizerEvent(v, id);
    return db.query.eventZones.findMany({ where: eq(eventZones.eventId, id), orderBy: [asc(eventZones.position)] });
  },

  async addZone(v: Viewer, id: string, input: z.output<typeof zoneCreateSchema>) {
    await organizerEvent(v, id);
    const [zone] = await db
      .insert(eventZones)
      .values({ ...input, eventId: id })
      .onConflictDoNothing()
      .returning();
    if (!zone) throw conflict("conflict", `La zone ${input.code} existe déjà`);
    return zone;
  },

  async updateZone(v: Viewer, id: string, zoneId: string, input: z.output<typeof zoneUpdateSchema>) {
    await organizerEvent(v, id);
    const [zone] = await db
      .update(eventZones)
      .set(input)
      .where(and(eq(eventZones.id, zoneId), eq(eventZones.eventId, id)))
      .returning();
    if (!zone) throw notFound("Zone introuvable");
    return zone;
  },

  async removeZone(v: Viewer, id: string, zoneId: string) {
    await organizerEvent(v, id);
    await db.delete(eventZones).where(and(eq(eventZones.id, zoneId), eq(eventZones.eventId, id)));
  },

  /** Droit d'abonnement aux canaux temps réel d'un événement (`event:<id>:triage|live|access`). */
  async canSubscribe(v: Viewer, channel: string): Promise<boolean> {
    const m = /^event:([0-9a-f-]{36}):(triage|live|access)$/.exec(channel);
    if (!m?.[1]) return false;
    const e = await db.query.events.findFirst({ where: eq(events.id, m[1]) });
    if (!e) return false;
    const kind = m[2];
    // triage : organisation et staff de filtration ; live : organisation ; access : tout le staff.
    const access = await staffAccess(v, e.structureId, kind === "access" ? [...staffRoles] : ["filtering"]).catch(
      () => null,
    );
    if (!access) return false;
    return kind !== "live" || access.actor !== "staff";
  },
};
