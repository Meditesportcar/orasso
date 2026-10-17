// Événements (ARCHITECTURE.md § 1.4, § 2.8) : lecture publique, création (assistant du lot 13), duplication,
// récurrence, publication, modification, statut Maintenu/Incertain, annulation, zones.
import { randomBytes } from "node:crypto";
import {
  departmentFromPostalCode,
  duplicateDates,
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
  type RecurrenceRule,
  recurrenceOccurrences,
  registrationOpensAt,
  staffRoles,
  type zoneCreateSchema,
  type zoneUpdateSchema,
} from "@orasso/shared";
import { and, asc, eq } from "drizzle-orm";
import sharp from "sharp";
import type { z } from "zod";

import { db } from "../../db/client";
import { applications, events, eventZones, orders, structureFollows, structureMembers, tickets } from "../../db/schema";
import { requireOrganizer, staffAccess } from "../../lib/access";
import { deps, now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { addressQuery, geocode } from "../../lib/geocode";
import { rateLimit } from "../../lib/rateLimit";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { uniqueSlug } from "../../lib/slug";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { applicationsService } from "../applications/service";
import { announcementsService } from "../communication/announcements";
import { staffChatsService } from "../communication/staff-chats";
import { assertCanSeeEvent } from "../invitations/access";
import { notificationsService } from "../notifications/service";
import { staffService } from "../staff/service";
import { isFollowing, structureById } from "../structures/service";
import { card, type StructureRow } from "./card";
import { exploreEvents } from "./explore";
import { scheduleEventJobs } from "./jobs";
import { type EventRow, eventsRepo } from "./repo";

async function publicView(e: EventRow, s: StructureRow, showInstructions: boolean): Promise<EventPublic> {
  const counters = await eventsRepo.counters(e);
  const t = now();
  return {
    ...card(e, s, counters.remaining),
    description: e.description,
    addressLine: e.addressLine,
    postalCode: e.postalCode,
    timezone: e.timezone,
    vendorTypes: e.vendorTypes,
    admittedVehicleTypes: e.admittedVehicleTypes as EventPublic["admittedVehicleTypes"],
    maxVehiclesPerUser: e.maxVehiclesPerUser,
    admission: e.admission,
    criteria: e.criteria ?? null,
    publicAccess: e.publicAccess,
    externalTicketUrl: e.externalTicketUrl,
    registrationsOpenAt: e.registrationsOpenAt.toISOString(),
    previewHours: e.previewHours,
    highGradePriority: e.highGradePriority,
    highGradePreviewHours: e.highGradePreviewHours,
    highGradeMin: e.highGradeMin,
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

/** Structure suspendue (lot 27) : plus de création ni de publication d'événement ; tout reste lisible (S31). */
const SUSPENDED_MESSAGE = "Structure suspendue : plus de création ni de publication d'événement.";
async function assertNotSuspended(structureId: string) {
  const s = await structureById(structureId);
  if (s.verification === "suspended") throw forbidden(SUSPENDED_MESSAGE);
}

const ADDRESS_FIELDS = ["addressLine", "postalCode", "city", "lat", "lng"] as const;

/** Département et position d'une adresse saisie (meilleur effort : une adresse introuvable ne bloque rien). */
async function locate(a: {
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  department?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const out: { department?: string; lat?: number; lng?: number } = {};
  if (!a.department) {
    const d = departmentFromPostalCode(a.postalCode);
    if (d) out.department = d;
  }
  if (a.lat == null || a.lng == null) {
    const hit = await geocode(addressQuery(a));
    if (hit) {
      out.lat = hit.lat;
      out.lng = hit.lng;
      if (!out.department && !a.department && hit.department) out.department = hit.department;
    }
  }
  return out;
}

/** Réglages recopiés d'un événement à sa copie ou à ses occurrences. */
function copyValues(e: EventRow) {
  return {
    title: e.title,
    description: e.description,
    posterKey: e.posterKey,
    format: e.format,
    timezone: e.timezone,
    addressLine: e.addressLine,
    postalCode: e.postalCode,
    city: e.city,
    department: e.department,
    lat: e.lat,
    lng: e.lng,
    admittedVehicleTypes: e.admittedVehicleTypes,
    capacity: e.capacity,
    maxVehiclesPerUser: e.maxVehiclesPerUser,
    admission: e.admission,
    criteria: e.criteria,
    publicAccess: e.publicAccess,
    externalTicketUrl: e.externalTicketUrl,
    previewHours: e.previewHours,
    highGradePriority: e.highGradePriority,
    highGradePreviewHours: e.highGradePreviewHours,
    highGradeMin: e.highGradeMin,
    lockOffsetMinutes: e.lockOffsetMinutes,
    rulesText: e.rulesText,
    instructions: e.instructions,
    vendorTypes: e.vendorTypes,
    shopEnabled: e.shopEnabled,
  };
}

export const eventsService = {
  /** `GET /events` : liste publique ; connecté, elle sait trier par affinités et par distance (lot 29, `explore.ts`). */
  list(q: EventListQuery, viewer: Viewer | null = null): Promise<Page<EventCard>> {
    return exploreEvents(q, viewer);
  },

  /**
   * Page publique d'un événement (`/e/<slug>`). Brouillon : 404. Sur invitation (lot 25, § 9.1) : `403 invite_only`
   * sans rien de l'événement, sauf pour les ayants droit (organisation, staff, inscrits, invités).
   */
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
    await assertCanSeeEvent(e, viewer);
    const accepted = mine.some((a) => a.status === "accepted");
    const view = await publicView(e, s, member || accepted);
    if (!viewer) return view;
    const follower = await isFollowing(e.structureId, viewer.user.id);
    return {
      ...view,
      // Les candidatures de prestataire ont leur propre liste (`GET /me/provider-applications`, lot 21).
      myApplications: mine
        .filter((a) => a.kind === "vehicle")
        .map((a) => ({ id: a.id, vehicleId: a.vehicleId, status: a.status })),
      registrationOpensAtForMe: registrationOpensAt(e, { follower, grade: viewer.profile.grade }).toISOString(),
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
      parentEventId: e.parentEventId,
      recurrenceRule: e.recurrenceRule ?? null,
      shopEnabled: e.shopEnabled,
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
    await assertNotSuspended(structureId);
    const year = input.startsAt.getUTCFullYear();
    const slug = await uniqueSlug(`${input.title} ${year}`, (s) => eventsRepo.slugTaken(s));
    const located = await locate(input);
    const [e] = await db
      .insert(events)
      .values({
        ...input,
        ...located,
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
    // Nouvelle adresse sans position : la position est recalculée (jamais bloquant).
    const touchesAddress = ["addressLine", "postalCode", "city"].some((k) => k in input);
    const located =
      touchesAddress && !("lat" in input)
        ? await locate({
            addressLine: input.addressLine ?? e.addressLine,
            postalCode: input.postalCode ?? e.postalCode,
            city: input.city ?? e.city,
            department: "postalCode" in input ? (input.department ?? null) : e.department,
          })
        : {};
    const updated = await withTx(async (tx, after) => {
      const current = await eventsRepo.lockForUpdate(tx, id);
      const [row] = await tx
        .update(events)
        .set({ ...input, ...located, criteria: input.criteria === undefined ? undefined : (input.criteria ?? null) })
        .where(eq(events.id, id))
        .returning();
      if (!row) throw notFound("Événement introuvable");
      if (row.status !== "published") return row;
      const datesChanged =
        row.startsAt.getTime() !== current.startsAt.getTime() || row.endsAt.getTime() !== current.endsAt.getTime();
      const addressChanged = ADDRESS_FIELDS.some((f) => row[f] !== current[f]);
      if (datesChanged || addressChanged) {
        const what = datesChanged ? `nouvelle date : ${formatDateTime(row.startsAt)}` : "nouvelle adresse";
        for (const userId of await eventsRepo.activeApplicantIds(id, tx, { awaitingMembers: true })) {
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
        row.highGradePreviewHours !== current.highGradePreviewHours ||
        row.highGradeMin !== current.highGradeMin ||
        row.registrationsOpenAt.getTime() !== current.registrationsOpenAt.getTime();
      if (rescheduled) after(() => scheduleEventJobs(row));
      await applicationsService.offerNext(tx, row, after);
      after(() => notificationsService.kick());
      return row;
    });
    return this.getForOrganizer(v, updated.id);
  },

  /** Publication : réservée aux structures vérifiées (docs/01). Abonnés prévenus ; tâches planifiées. */
  async publish(v: Viewer, id: string): Promise<EventOrganizer> {
    const { e } = await organizerEvent(v, id);
    const s = await structureById(e.structureId);
    if (s.verification === "suspended") throw forbidden(SUSPENDED_MESSAGE);
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
      // Staff de l'événement (relances « je suis là », mode staff) : une ligne par membre staff actif.
      await staffService.ensureRows(row, tx);
      // Discussion du staff de l'événement (lot 20) : créée à la publication.
      await staffChatsService.ensureEventChat(tx, row);
      after(() => scheduleEventJobs(row));
      // « Près de chez toi » (lot 15) : après les abonnés, centres d'intérêt et rayon.
      if (row.admission !== "invite_only") after(() => deps.jobs.send("event.notify-nearby", { eventId: id }));
      after(() => notificationsService.kick());
    });
    return this.getForOrganizer(v, id);
  },

  /** Annulation (irréversible) : candidatures actives annulées sans malus, tout le monde notifié. */
  async cancel(v: Viewer, id: string): Promise<EventOrganizer> {
    await organizerEvent(v, id);
    await withTx(async (tx, after) => {
      const e = await eventsRepo.lockForUpdate(tx, id);
      if (e.status === "cancelled") throw conflict("conflict", "Déjà annulé");
      await this.cancelInTx(tx, after, id, v.user.id, "organizer");
    });
    return this.getForOrganizer(v, id);
  },

  /**
   * Annulation dans une transaction ouverte, l'événement déjà verrouillé et non annulé : par l'organisateur, ou par
   * l'équipe Orasso quand la modération retire l'événement (lot 32, dans la transaction de sa décision).
   */
  async cancelInTx(
    tx: Tx,
    after: (cb: () => unknown) => void,
    id: string,
    actorId: string,
    by: "organizer" | "orasso",
  ) {
    {
      const [row] = await tx
        .update(events)
        .set({ status: "cancelled", cancelledAt: now() })
        .where(eq(events.id, id))
        .returning();
      if (!row) throw notFound("Événement introuvable");
      const cancelled = await applicationsService.cancelAll(tx, row, after);
      // Fil de l'événement (lot 20) : une entrée « Annulé », une seule fois (verrou + statut contrôlé ci-dessus).
      await announcementsService.recordStatusChange(tx, id, "cancelled", actorId);
      // Billets de visiteurs (lot 14) : les billets valables sont annulés, les paiements en cours abandonnés.
      const cancelledTickets = await tx
        .update(tickets)
        .set({ status: "cancelled", cancelledAt: now() })
        .where(and(eq(tickets.eventId, id), eq(tickets.status, "valid")))
        .returning({ userId: tickets.userId });
      await tx
        .update(orders)
        .set({ status: "cancelled" })
        .where(and(eq(orders.eventId, id), eq(orders.status, "pending")));
      for (const userId of new Set([...cancelled.map((a) => a.userId), ...cancelledTickets.map((t) => t.userId)])) {
        await notificationsService.notify(tx, userId, "event_cancelled", {
          title: "Événement annulé",
          body: `« ${row.title} » (${formatDateTime(row.startsAt)}) est annulé par ${by === "orasso" ? "l'équipe Orasso" : "l'organisateur"}.`,
          eventId: id,
          eventStartsAt: row.startsAt,
          data: { eventId: id },
          link: { label: "Voir l'événement", path: `/e/${row.slug}` },
        });
      }
      after(() => realtime.publish(`event:${id}:access`, "event.cancelled", { eventId: id }));
      after(() => notificationsService.kick());
    }
  },

  /**
   * Duplication en un clic (docs/01) : copie en brouillon, mêmes réglages et mêmes zones, dates décalées de 52
   * semaines (même jour, même heure) tant que ce n'est pas dans le futur. Ni candidatures ni avis ne sont copiés.
   */
  async duplicate(v: Viewer, id: string): Promise<EventOrganizer> {
    const { e } = await organizerEvent(v, id);
    await assertNotSuspended(e.structureId);
    const dates = duplicateDates(e.startsAt, e.endsAt, now());
    const shiftMs = dates.startsAt.getTime() - e.startsAt.getTime();
    const copyId = await withTx(async (tx) => {
      const slug = await uniqueSlug(`${e.title} ${dates.startsAt.getUTCFullYear()}`, (s) => eventsRepo.slugTaken(s));
      const opens = new Date(Math.max(e.registrationsOpenAt.getTime() + shiftMs, now().getTime()));
      const [copy] = await tx
        .insert(events)
        .values({
          ...copyValues(e),
          slug,
          structureId: e.structureId,
          plateSalt: randomBytes(16),
          startsAt: dates.startsAt,
          endsAt: dates.endsAt,
          registrationsOpenAt: opens,
          status: "draft",
          parentEventId: e.id,
          createdBy: v.user.id,
        })
        .returning();
      if (!copy) throw new Error("Duplication impossible");
      const zones = await tx.select().from(eventZones).where(eq(eventZones.eventId, e.id));
      if (zones.length) {
        await tx.insert(eventZones).values(
          zones.map((z) => ({
            eventId: copy.id,
            code: z.code,
            name: z.name,
            capacity: z.capacity,
            position: z.position,
          })),
        );
      }
      return copy.id;
    });
    return this.getForOrganizer(v, copyId);
  },

  /**
   * Récurrence (« chaque premier dimanche du mois ») créée une seule fois : les occurrences suivantes sont créées
   * d'un coup en brouillons, rattachées à l'événement d'origine qui garde la règle. Une seule règle par série.
   */
  async createRecurrence(v: Viewer, id: string, rule: RecurrenceRule) {
    const { e } = await organizerEvent(v, id);
    if (e.recurrenceRule) throw conflict("conflict", "Cet événement a déjà une récurrence");
    if (e.parentEventId) throw conflict("conflict", "La récurrence se crée depuis l'événement d'origine");
    const dates = recurrenceOccurrences(e.startsAt, e.endsAt, rule);
    if (dates.length === 0) throw validation("Aucune occurrence à créer avec cette règle");
    const openLead = e.startsAt.getTime() - e.registrationsOpenAt.getTime();
    const ids = await withTx(async (tx) => {
      await tx.update(events).set({ recurrenceRule: rule }).where(eq(events.id, id));
      const zones = await tx.select().from(eventZones).where(eq(eventZones.eventId, e.id));
      const out: string[] = [];
      for (const d of dates) {
        const slug = await uniqueSlug(`${e.title} ${d.startsAt.toISOString().slice(0, 10)}`, (s) =>
          eventsRepo.slugTaken(s),
        );
        const [copy] = await tx
          .insert(events)
          .values({
            ...copyValues(e),
            slug,
            structureId: e.structureId,
            plateSalt: randomBytes(16),
            startsAt: d.startsAt,
            endsAt: d.endsAt,
            registrationsOpenAt: new Date(d.startsAt.getTime() - openLead),
            status: "draft",
            parentEventId: e.id,
            createdBy: v.user.id,
          })
          .returning();
        if (!copy) throw new Error("Occurrence non créée");
        if (zones.length) {
          await tx.insert(eventZones).values(
            zones.map((z) => ({
              eventId: copy.id,
              code: z.code,
              name: z.name,
              capacity: z.capacity,
              position: z.position,
            })),
          );
        }
        out.push(copy.id);
      }
      return out;
    });
    const s = await structureById(e.structureId);
    const rows = await Promise.all(ids.map((x) => eventsRepo.byId(x)));
    return rows.map((r) => card(r, s, r.capacity));
  },

  /** Affiche de l'événement (WebP, 1600 px de large au plus). */
  async setPoster(v: Viewer, id: string, file: File): Promise<EventOrganizer> {
    await organizerEvent(v, id);
    rateLimit("fileUpload", v.user.id);
    if (file.size === 0) throw validation("Fichier vide");
    if (file.size > 15 * 1024 * 1024) throw new AppError(413, "payload_too_large", "Affiche de 15 Mo au plus");
    let data: Buffer;
    try {
      data = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new AppError(415, "unsupported_media_type", "Image illisible (JPEG, PNG ou WebP)");
    }
    const key = `events/${id}/poster-${randomBytes(6).toString("hex")}.webp`;
    await storage.put(key, data);
    await db.update(events).set({ posterKey: key }).where(eq(events.id, id));
    // L'ancienne affiche peut servir à une copie : elle reste sur le disque (pas de ramasse-miettes en V1).
    return this.getForOrganizer(v, id);
  },

  /** Bandeau Maintenu / Incertain, envoyé à tous les inscrits (docs/01, bloc 4). */
  async setOutlook(v: Viewer, id: string, outlook: EventOutlook): Promise<EventOrganizer> {
    const { e } = await organizerEvent(v, id);
    if (e.status !== "published") throw conflict("conflict", "Événement non publié ou annulé");
    if (e.outlook !== outlook) {
      await withTx(async (tx, after) => {
        // Verrou et nouveau contrôle (lot 20) : deux changements simultanés n'envoient le statut qu'une fois.
        const current = await eventsRepo.lockForUpdate(tx, id);
        if (current.outlook === outlook || current.status !== "published") return;
        await tx.update(events).set({ outlook }).where(eq(events.id, id));
        // Fil de l'événement : entrée « Maintenu » / « Incertain » (une par changement).
        await announcementsService.recordStatusChange(tx, id, outlook, v.user.id);
        const body =
          outlook === "uncertain"
            ? `« ${e.title} » passe en « ${eventOutlookLabels.uncertain} » : l'organisateur confirmera.`
            : `« ${e.title} » est « ${eventOutlookLabels.maintained} ».`;
        for (const userId of await eventsRepo.activeApplicantIds(id, tx, { awaitingMembers: true })) {
          await notificationsService.notify(tx, userId, "event_outlook_changed", {
            title: eventOutlookLabels[outlook],
            body,
            eventId: id,
            eventStartsAt: e.startsAt,
            data: { eventId: id },
            link: { label: "Voir l'événement", path: `/e/${e.slug}` },
          });
        }
        after(() => notificationsService.kick());
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
    const access = await staffAccess(v, e.structureId, kind === "access" ? [...staffRoles] : ["filtering"], e.id).catch(
      () => null,
    );
    if (!access) return false;
    return kind !== "live" || access.actor !== "staff";
  },
};
