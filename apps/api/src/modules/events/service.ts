// Événements (ARCHITECTURE.md § 1.4, § 2.8) : lecture publique, création (assistant du lot 13), duplication,
// récurrence, publication, modification, statut Maintenu/Incertain, annulation, zones.
import { randomBytes } from "node:crypto";
import {
  type ApplicationStatus,
  type ApplyContext,
  addDays,
  BUSINESS_TIMEZONE,
  calendarDaysBetween,
  canApply,
  type DaysError,
  departmentFromPostalCode,
  duplicateDates,
  type EventCard,
  type EventCreate,
  type EventDaysPut,
  type EventListQuery,
  type EventOrganizer,
  type EventOutlook,
  type EventPublic,
  type EventUpdate,
  eventAddressRequired,
  eventOutlookLabels,
  formatDayDate,
  fromWallTime,
  invitationLabels,
  isActiveStatus,
  isLocked,
  isMultiDay,
  localDate,
  lockAt,
  type Page,
  type PosterSettings,
  type RecurrenceRule,
  recurrenceOccurrences,
  registrationOpensAt,
  resolveDays,
  staffRoles,
  wallTime,
  type zoneCreateSchema,
  type zoneUpdateSchema,
} from "@orasso/shared";
import { and, asc, count, eq } from "drizzle-orm";
import sharp from "sharp";
import type { z } from "zod";

import { db } from "../../db/client";
import {
  applications,
  eventDays,
  events,
  eventZones,
  orders,
  structureBans,
  structureFollows,
  structureMembers,
  tickets,
  vehicles,
} from "../../db/schema";
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
import { assertCanSeeEvent, hasPendingInvitation } from "../invitations/access";
import { decorateForMedia } from "../media/explore";
import { notificationsService } from "../notifications/service";
import { staffService } from "../staff/service";
import { isFollowing, structureById } from "../structures/service";
import { vehiclesRepo } from "../vehicles/repo";
import { arrivalColumns, arrivalsOf, assertArrivals } from "./arrivals";
import { card, type StructureRow } from "./card";
import { dayInUse, daysRepo } from "./days";
import { exploreEvents } from "./explore";
import { scheduleEventJobs } from "./jobs";
import { posterColumns, posterService, posterSettingsOf, posterYearStale, samePoster } from "./poster/service";
import { type EventRow, eventsRepo } from "./repo";

/**
 * Ce que la fiche montre au-delà du public : les consignes (retenus et organisation) et, depuis le lot M4, le créneau
 * d'arrivée strict des exposants.
 */
type ViewRights = { instructions: boolean; exhibitorSlot: boolean };

async function publicView(e: EventRow, s: StructureRow, rights: ViewRights): Promise<EventPublic> {
  const counters = await eventsRepo.counters(e);
  const t = now();
  // Plusieurs jours (lot 26) : jours avec leurs places ; un événement d'un jour n'en a pas et reste `whole`.
  const days = await daysRepo.serialize(e);
  const postUrl = storage.url(e.posterPostKey);
  const storyUrl = storage.url(e.posterStoryKey);
  const style = posterSettingsOf(e)?.style;
  // Lot R3b, tour 2 : une affiche qui n'écrit plus la bonne année (rendue avant le lot, ou un Nouvel An passé) est
  // refaite à l'affichage de la fiche, par la tâche de rendu (une seule en file par événement) ; d'ici là, l'ancienne.
  if (posterYearStale(e, t)) void posterService.schedule(e.id).catch(() => undefined);
  return {
    days,
    dayAccess: days.length ? e.dayAccess : "whole",
    ...card(e, s, counters.remaining),
    description: e.description,
    // Lot 47 : créneaux d'arrivée, affiche générée (Post et Story), affiche perso de l'organisateur. Lot M4 (correction
    // de Damien) : le créneau des exposants est privé, jamais dans une réponse publique ni anonyme.
    arrivals: rights.exhibitorSlot ? arrivalsOf(e) : { ...arrivalsOf(e), exhibitors: null },
    poster: postUrl && storyUrl && style ? { postUrl, storyUrl, style } : null,
    customPosterUrl: storage.url(e.posterKey),
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
    instructions: rights.instructions ? e.instructions : null,
    entranceNote: e.entranceNote,
    acceptedCount: counters.accepted,
  };
}

/**
 * Un véhicule qui peut candidater à cet événement, avec les règles de la candidature (`applicationsService.apply`) :
 * actif, sans transfert de plaque en cours, d'un type admis, avec au moins une photo.
 */
async function hasEligibleVehicle(userId: string, e: Pick<EventRow, "admittedVehicleTypes">) {
  const garage = await vehiclesRepo.findFull(and(eq(vehicles.ownerId, userId), eq(vehicles.status, "active")));
  return garage.some(
    (x) => !x.pendingTransferId && e.admittedVehicleTypes.includes(x.vehicleType) && x.photos.length > 0,
  );
}

/**
 * Lot M4, tour 2 : le créneau strict des exposants n'appartient qu'à l'organisation (membres actifs de la structure,
 * staff compris) et à qui a une candidature **en cours ou acceptée** avec un véhicule, membre de crew compris (à
 * confirmer). Une candidature refusée, retirée, expirée ou annulée ne l'ouvre plus.
 */
function holdsExhibitorSlot(member: boolean, mine: { kind: string; status: ApplicationStatus }[]): boolean {
  return member || mine.some((a) => a.kind === "vehicle" && isActiveStatus(a.status));
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

/** Modification d'un événement (réglages, affiche, zones, récurrence) : refusée à une structure suspendue (lot 27). */
async function organizerEventWrite(v: Viewer, id: string) {
  const out = await organizerEvent(v, id);
  await assertNotSuspended(out.e.structureId);
  return out;
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
    entranceNote: e.entranceNote,
    vendorTypes: e.vendorTypes,
    shopEnabled: e.shopEnabled,
    dayAccess: e.dayAccess,
    // Lot 47 : créneaux d'arrivée et réglages de l'affiche générée (les rendus sont refaits avec la nouvelle date).
    ...arrivalColumns(arrivalsOf(e)),
    ...posterColumns(posterSettingsOf(e)),
  };
}

/**
 * Jours d'un événement recopiés sur sa copie ou une occurrence (lot 26), décalés comme les dates de l'événement. La date
 * locale suit le nouvel instant de début (même jour de la semaine pour un décalage de semaines entières).
 */
async function copyDays(tx: Tx, from: EventRow, to: Pick<EventRow, "id" | "startsAt">) {
  const days = await daysRepo.list(from.id, tx);
  if (!isMultiDay(days)) return;
  // Décalage en jours calendaires, heures murales gardées (changements d'heure compris).
  const shift = calendarDaysBetween(from.startsAt, to.startsAt, from.timezone);
  const move = (at: Date) => fromWallTime(addDays(wallTime(at, from.timezone), shift), from.timezone);
  const rows = days.map((d) => {
    const startsAt = move(d.startsAt);
    return {
      eventId: to.id,
      dayDate: localDate(startsAt, from.timezone),
      startsAt,
      endsAt: move(d.endsAt),
      capacity: d.capacity,
    };
  });
  await tx.insert(eventDays).values(rows);
  // Les dates de la copie restent les bornes de ses jours.
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first && last) {
    await tx.update(events).set({ startsAt: first.startsAt, endsAt: last.endsAt }).where(eq(events.id, to.id));
  }
}

const daysErrors: Record<DaysError, string> = {
  too_few: "Au moins deux jours (ou aucun : événement d'un jour)",
  too_many: "Quatorze jours au plus",
  duplicate_date: "Deux jours ont la même date",
  overlap: "Deux jours se chevauchent",
};

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
    if (!e) throw notFound("Événement introuvable");
    // Lot 36 : « Aperçu » d'un brouillon, pour l'équipe de la structure seulement (organisateurs et staff).
    if (e.status === "draft" && !(viewer && (await isMember(e.structureId, viewer.user.id)))) {
      throw notFound("Événement introuvable");
    }
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
    // Lot M4, tour 2 : le créneau strict des exposants n'est donné qu'aux concernés (`holdsExhibitorSlot`). La feuille
    // de candidature le lit à part, par `applyContext`, seulement si l'on peut candidater maintenant.
    const exhibitorSlot = viewer !== null && holdsExhibitorSlot(member, mine);
    const view = await publicView(e, s, { instructions: member || accepted, exhibitorSlot });
    if (!viewer) return view;
    const follower = await isFollowing(e.structureId, viewer.user.id);
    const full: EventPublic = {
      ...view,
      // Les candidatures de prestataire ont leur propre liste (`GET /me/provider-applications`, lot 21).
      myApplications: mine
        .filter((a) => a.kind === "vehicle")
        .map((a) => ({ id: a.id, vehicleId: a.vehicleId, status: a.status, eventDayId: a.eventDayId })),
      registrationOpensAtForMe: registrationOpensAt(e, { follower, grade: viewer.profile.grade }).toISOString(),
    };
    // Lot 55 : pour un média connecté, l'état de l'accréditation presse (`accreditation {open, mine}`, `travelMinutes`).
    await decorateForMedia([full], {} as EventListQuery, viewer);
    return full;
  },

  /**
   * `GET /events/:id/apply-context` (lot M4, tour 2), lu à l'ouverture de la feuille de candidature : le créneau strict
   * des exposants, pour la case « J'ai vu ». Seulement si la personne peut candidater **maintenant** : événement publié
   * et non verrouillé, inscriptions ouvertes pour elle (avant-première comprise), invitation en attente si l'événement
   * est privé, pas bannie par la structure, un véhicule actif au garage. Sinon, les mêmes refus que la candidature.
   */
  async applyContext(v: Viewer, eventId: string): Promise<ApplyContext> {
    const e = await eventsRepo.byId(eventId);
    if (e.status === "draft") throw notFound("Événement introuvable");
    await assertCanSeeEvent(e, v);
    if (e.admission === "invite_only" && !(await hasPendingInvitation(e.id, v))) {
      throw new AppError(403, "invitation_required", invitationLabels.invitationRequired);
    }
    const t = now();
    // Compte suspendu : lecture seule, aucune candidature (lot 32).
    if (v.profile.suspendedUntil && v.profile.suspendedUntil > t) {
      throw forbidden("Ton compte est suspendu : lecture seule.");
    }
    const applicant = { follower: await isFollowing(e.structureId, v.user.id), grade: v.profile.grade };
    const check = canApply(e, applicant, t);
    if (!check.ok) {
      if (check.reason === "locked") throw new AppError(423, "locked", "Inscriptions closes");
      if (check.reason === "not_open") {
        throw conflict("conflict", "Les candidatures ne sont pas encore ouvertes pour toi", {
          opensAt: registrationOpensAt(e, applicant).toISOString(),
        });
      }
      throw conflict("conflict", "Événement annulé");
    }
    const banned = await db.query.structureBans.findFirst({
      where: and(eq(structureBans.structureId, e.structureId), eq(structureBans.userId, v.user.id)),
      columns: { id: true },
    });
    if (banned) throw forbidden("Tu ne peux pas candidater aux événements de cette structure");
    if (!(await hasEligibleVehicle(v.user.id, e))) {
      throw conflict("conflict", "Aucun véhicule de ton garage ne peut candidater à cet événement", {
        noVehicle: true,
      });
    }
    return { exhibitors: arrivalsOf(e).exhibitors };
  },

  async getForOrganizer(v: Viewer, id: string): Promise<EventOrganizer> {
    const { e } = await organizerEvent(v, id);
    const s = await structureById(e.structureId);
    const zones = await db.query.eventZones.findMany({
      where: eq(eventZones.eventId, id),
      orderBy: [asc(eventZones.position), asc(eventZones.code)],
    });
    const settings = posterSettingsOf(e);
    return {
      ...(await publicView(e, s, { instructions: true, exhibitorSlot: true })),
      zones: zones.map((z) => ({ id: z.id, code: z.code, name: z.name, capacity: z.capacity, position: z.position })),
      counters: await eventsRepo.counters(e),
      publishedAt: e.publishedAt?.toISOString() ?? null,
      cancelledAt: e.cancelledAt?.toISOString() ?? null,
      lockedAt: e.lockedAt?.toISOString() ?? null,
      parentEventId: e.parentEventId,
      recurrenceRule: e.recurrenceRule ?? null,
      shopEnabled: e.shopEnabled,
      posterSettings: settings ? { ...settings, photoUrl: storage.url(settings.photoKey) } : null,
    };
  },

  async listForStructure(v: Viewer, structureId: string) {
    await requireOrganizer(v, structureId);
    const s = await structureById(structureId);
    const rows = await db.query.events.findMany({
      where: eq(events.structureId, structureId),
      orderBy: [asc(events.startsAt)],
    });
    // Lot 52 : les compteurs de candidatures accompagnent la carte (l'onglet Événements n'ouvre plus chaque fiche).
    return Promise.all(
      rows.map(async (e) => {
        const counters = await eventsRepo.counters(e);
        return { ...card(e, s, counters.remaining), counters };
      }),
    );
  },

  /** Création minimale en brouillon (organisateur). */
  async create(v: Viewer, structureId: string, input: EventCreate): Promise<EventOrganizer> {
    await requireOrganizer(v, structureId);
    await assertNotSuspended(structureId);
    const { arrivals, poster, ...fields } = input;
    const year = input.startsAt.getUTCFullYear();
    const timezone = BUSINESS_TIMEZONE;
    // Lot 47 : créneaux d'arrivée contrôlés avec les dates.
    assertArrivals(arrivals, input.startsAt, input.endsAt, timezone);
    const slug = await uniqueSlug(`${input.title} ${year}`, (s) => eventsRepo.slugTaken(s));
    const located = await locate(input);
    const e = await withTx(async (tx) => {
      if (poster) await posterService.acceptPhoto(tx, v, null, poster.photoKey);
      const [row] = await tx
        .insert(events)
        .values({
          ...fields,
          ...located,
          ...arrivalColumns(arrivals ?? null),
          ...posterColumns(poster ?? null),
          criteria: input.criteria ?? null,
          slug,
          structureId,
          plateSalt: randomBytes(16),
          status: "draft",
          createdBy: v.user.id,
        })
        .returning();
      if (!row) throw new Error("Création de l'événement impossible");
      return row;
    });
    // Lot 47 : affiche générée rendue après l'enregistrement (hors transaction : le rendu prend une seconde).
    if (poster) await posterService.refresh(e, v.user.id);
    return this.getForOrganizer(v, e.id);
  },

  /**
   * Modification. Après publication : changement de date ou d'adresse → tous les inscrits prévenus (docs/01) ;
   * tâches replanifiées ; une capacité augmentée libère des places pour la liste d'attente.
   */
  async update(v: Viewer, id: string, input: EventUpdate): Promise<EventOrganizer> {
    const { e } = await organizerEventWrite(v, id);
    if (e.status === "cancelled") throw conflict("conflict", "Événement annulé");
    const { arrivals, poster: posterInput, ...fields } = input;
    // L'assistant renvoie l'affiche telle qu'il l'a reçue : mêmes réglages = pas de nouveau rendu.
    const poster = samePoster(posterInput, posterSettingsOf(e)) ? undefined : posterInput;
    const startsAt = input.startsAt ?? e.startsAt;
    const endsAt = input.endsAt ?? e.endsAt;
    if (endsAt <= startsAt) throw validation("La fin doit suivre le début", { field: "endsAt" });
    // Lot 47 : les créneaux (nouveaux ou en place) restent cohérents avec les dates.
    assertArrivals(arrivals !== undefined ? arrivals : arrivalsOf(e), startsAt, endsAt, e.timezone);
    // Plusieurs jours (lot 26) : les dates de l'événement sont les bornes de ses jours, elles se règlent jour par jour.
    const changesDates =
      (input.startsAt && input.startsAt.getTime() !== e.startsAt.getTime()) ||
      (input.endsAt && input.endsAt.getTime() !== e.endsAt.getTime());
    const datesByDay = () =>
      validation("Événement sur plusieurs jours : les dates se règlent jour par jour", { field: "days" });
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
    let before: EventRow = e;
    const updated = await withTx(async (tx, after) => {
      const current = await eventsRepo.lockForUpdate(tx, id);
      before = current;
      if (changesDates && isMultiDay(await daysRepo.list(id, tx))) throw datesByDay();
      if (poster) await posterService.acceptPhoto(tx, v, current.posterPhotoKey, poster.photoKey);
      const [row] = await tx
        .update(events)
        .set({
          ...fields,
          ...located,
          ...(arrivals !== undefined ? arrivalColumns(arrivals) : {}),
          ...(poster !== undefined ? posterColumns(poster) : {}),
          criteria: input.criteria === undefined ? undefined : (input.criteria ?? null),
        })
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
    // Lot 47 : affiche générée rendue après l'enregistrement (jamais bloquant : reprise par une tâche) ; régénérée
    // d'elle-même si la date ou la ville change. Les rendus en place restent jusqu'au nouveau rendu réussi.
    if (poster) {
      await posterService.refresh(updated, v.user.id);
    } else if (poster === null) {
      await posterService.removeRenders(before);
    } else if (
      posterSettingsOf(updated) &&
      (updated.startsAt.getTime() !== before.startsAt.getTime() || updated.city !== before.city)
    ) {
      await posterService.refresh(updated, v.user.id);
    }
    return this.getForOrganizer(v, updated.id);
  },

  /**
   * `PUT /events/:id/days` (lot 26, § 10) : la liste complète des jours. Deux jours ou plus : les dates de l'événement
   * deviennent les bornes (début du premier, fin du dernier) ; liste vide : retour à un événement d'un jour (dates
   * inchangées, accès `whole`). Un jour est reconnu par sa date : horaires et capacité se modifient ; un jour qui a des
   * candidatures (quel que soit leur statut) ne se retire pas. Après publication : inscrits prévenus si les jours
   * changent, tâches replanifiées, places libérées offertes à la liste d'attente. Propriétaire ou co-organisateur
   * (double authentification), structure non suspendue ; plus de changement une fois l'événement commencé.
   */
  async setDays(v: Viewer, id: string, input: EventDaysPut): Promise<EventOrganizer> {
    // Écriture d'organisateur (lot 27) : structure suspendue en lecture seule.
    const { e } = await organizerEventWrite(v, id);
    if (e.status === "cancelled") throw conflict("conflict", "Événement annulé");
    if (input.days.length === 1) throw validation(daysErrors.too_few, { field: "days" });
    await withTx(async (tx, after) => {
      const t = now();
      const current = await eventsRepo.lockForUpdate(tx, id);
      if (current.status === "cancelled") throw conflict("conflict", "Événement annulé");
      if (current.status === "published" && t >= current.startsAt) {
        throw new AppError(423, "locked", "L'événement a commencé : les jours ne se modifient plus");
      }
      let resolved: ReturnType<typeof resolveDays> | null = null;
      if (input.days.length) {
        resolved = resolveDays(input.days, current.timezone);
        if (!resolved.ok) throw validation(daysErrors[resolved.error], { field: "days", reason: resolved.error });
        // Lot 47 : les créneaux d'arrivée restent cohérents avec les nouvelles bornes.
        assertArrivals(arrivalsOf(current), resolved.startsAt, resolved.endsAt, current.timezone);
      }
      const next = resolved?.ok ? resolved.days : [];
      const existing = await daysRepo.list(id, tx);
      const keep = new Set(next.map((d) => d.dayDate));
      for (const old of existing.filter((d) => !keep.has(d.dayDate))) {
        const [used] = await tx.select({ n: count() }).from(applications).where(eq(applications.eventDayId, old.id));
        if ((used?.n ?? 0) > 0) throw dayInUse(formatDayDate(old.dayDate));
        await tx.delete(eventDays).where(eq(eventDays.id, old.id));
      }
      const byDate = new Map(existing.map((d) => [d.dayDate, d]));
      let daysChanged = existing.length !== next.length;
      for (const d of next) {
        const old = byDate.get(d.dayDate);
        if (!old) {
          daysChanged = true;
          await tx.insert(eventDays).values({ eventId: id, ...d });
        } else if (
          old.startsAt.getTime() !== d.startsAt.getTime() ||
          old.endsAt.getTime() !== d.endsAt.getTime() ||
          old.capacity !== d.capacity
        ) {
          if (old.startsAt.getTime() !== d.startsAt.getTime() || old.endsAt.getTime() !== d.endsAt.getTime()) {
            daysChanged = true;
          }
          await tx
            .update(eventDays)
            .set({ startsAt: d.startsAt, endsAt: d.endsAt, capacity: d.capacity })
            .where(eq(eventDays.id, old.id));
        }
      }
      const patch: Partial<typeof events.$inferInsert> = resolved?.ok
        ? { startsAt: resolved.startsAt, endsAt: resolved.endsAt, dayAccess: input.dayAccess ?? current.dayAccess }
        : { dayAccess: "whole" };
      const [row] = await tx.update(events).set(patch).where(eq(events.id, id)).returning();
      if (!row) throw notFound("Événement introuvable");
      if (row.status !== "published") return;
      const datesChanged =
        row.startsAt.getTime() !== current.startsAt.getTime() || row.endsAt.getTime() !== current.endsAt.getTime();
      if (daysChanged || datesChanged) {
        const what = next.length
          ? `jours : ${next.map((d) => formatDayDate(d.dayDate, { weekday: false })).join(", ")}`
          : `nouvelle date : ${formatDateTime(row.startsAt)}`;
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
        after(() => scheduleEventJobs(row));
      }
      // Une capacité de jour augmentée (ou un jour ajouté) libère des places pour la liste d'attente.
      await applicationsService.offerNext(tx, row, after);
      after(() => realtime.publish(`event:${id}:access`, "access.changed", { applicationIds: [] }));
      after(() => notificationsService.kick());
    });
    // Lot 47 : le premier jour change la date de l'affiche générée.
    const fresh = await eventsRepo.byId(id);
    if (posterSettingsOf(fresh) && fresh.startsAt.getTime() !== e.startsAt.getTime()) {
      await posterService.refresh(fresh, v.user.id);
    }
    return this.getForOrganizer(v, id);
  },

  /** Publication : réservée aux structures vérifiées (docs/01). Abonnés prévenus ; tâches planifiées. */
  async publish(v: Viewer, id: string): Promise<EventOrganizer> {
    const { e } = await organizerEvent(v, id);
    const s = await structureById(e.structureId);
    if (s.verification === "suspended") throw forbidden(SUSPENDED_MESSAGE);
    if (s.verification !== "verified") throw forbidden("Publication réservée aux structures vérifiées");
    if (e.status !== "draft") throw conflict("conflict", "Déjà publié ou annulé");
    // Lot 36 : un brouillon créé avant l'adresse obligatoire ne se publie pas sans elle.
    if (!e.addressLine?.trim() || !e.city?.trim()) {
      throw validation(eventAddressRequired, { fields: { addressLine: eventAddressRequired } });
    }
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
          body: `« ${row.title} » (${formatDateTime(row.startsAt)}) est annulé par ${by === "orasso" ? "l'équipe Orasso" : "l'équipe organisatrice"}.`,
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
      await copyDays(tx, e, copy);
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
    // Lot 47 : l'affiche générée de la copie est rendue avec sa nouvelle date.
    await posterService.refresh(await eventsRepo.byId(copyId), v.user.id);
    return this.getForOrganizer(v, copyId);
  },

  /**
   * Récurrence (« chaque premier dimanche du mois ») créée une seule fois : les occurrences suivantes sont créées
   * d'un coup en brouillons, rattachées à l'événement d'origine qui garde la règle. Une seule règle par série.
   */
  async createRecurrence(v: Viewer, id: string, rule: RecurrenceRule) {
    const { e } = await organizerEventWrite(v, id);
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
        await copyDays(tx, e, copy);
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
    const rows: EventRow[] = [];
    // Lot 47 : chaque occurrence a son affiche, à sa date (rendues l'une après l'autre).
    for (const x of ids) rows.push(await posterService.refresh(await eventsRepo.byId(x), v.user.id));
    return rows.map((r) => card(r, s, r.capacity));
  },

  /** Affiche de l'événement (WebP, 1600 px de large au plus). */
  async setPoster(v: Viewer, id: string, file: File): Promise<EventOrganizer> {
    await organizerEventWrite(v, id);
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

  /**
   * `POST /events/:id/poster/generate` (lot 47) : enregistre photo, style et titre de l'affiche générée et rend les deux
   * formats (Post et Story). Organisateur, structure non suspendue.
   */
  async generatePoster(v: Viewer, id: string, settings: PosterSettings): Promise<EventOrganizer> {
    const { e } = await organizerEventWrite(v, id);
    if (e.status === "cancelled") throw conflict("conflict", "Événement annulé");
    const updated = await withTx(async (tx) => {
      const current = await eventsRepo.lockForUpdate(tx, id);
      await posterService.acceptPhoto(tx, v, current.posterPhotoKey, settings.photoKey);
      const [row] = await tx.update(events).set(posterColumns(settings)).where(eq(events.id, id)).returning();
      if (!row) throw notFound("Événement introuvable");
      return row;
    });
    // Les anciens rendus ne s'effacent qu'une fois le nouveau rendu écrit (`regenerate`).
    await posterService.refresh(updated, v.user.id);
    return this.getForOrganizer(v, id);
  },

  /** `GET /events/:id/poster/story` (lot 47) : la Story 9:16 à télécharger pour Instagram (organisateur). */
  async posterStory(v: Viewer, id: string): Promise<{ data: Buffer; filename: string }> {
    const { e } = await organizerEvent(v, id);
    const data = e.posterStoryKey ? await storage.get(e.posterStoryKey) : null;
    if (!data) throw notFound("Pas encore d'affiche générée");
    return { data, filename: `affiche-${e.slug}-story.png` };
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
            ? `« ${e.title} » passe en « ${eventOutlookLabels.uncertain} » : l'équipe organisatrice confirmera.`
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
    await organizerEventWrite(v, id);
    const [zone] = await db
      .insert(eventZones)
      .values({ ...input, eventId: id })
      .onConflictDoNothing()
      .returning();
    if (!zone) throw conflict("conflict", `La zone ${input.code} existe déjà`);
    return zone;
  },

  async updateZone(v: Viewer, id: string, zoneId: string, input: z.output<typeof zoneUpdateSchema>) {
    await organizerEventWrite(v, id);
    const [zone] = await db
      .update(eventZones)
      .set(input)
      .where(and(eq(eventZones.id, zoneId), eq(eventZones.eventId, id)))
      .returning();
    if (!zone) throw notFound("Zone introuvable");
    return zone;
  },

  async removeZone(v: Viewer, id: string, zoneId: string) {
    await organizerEventWrite(v, id);
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
