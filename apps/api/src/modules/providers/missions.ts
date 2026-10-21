// Prestataires v2 (lot 46, ARCHITECTURE-DA-V2 § 5.2) : besoins d'un événement (« missions »), missions proposées aux
// prestataires du plus proche au plus loin, emplacement attribué à un prestataire retenu, avis des organisateurs.
// Fonctions validées par Damien dans le prototype DA v2 (19/10/2026) : `s-missions`, `s-pcand`, `s-vitrine`.
import {
  type ApplicationStatus,
  activeApplicationStatuses,
  arrivalHourLabel,
  boundingBox,
  departmentCentroids,
  distanceKm,
  type EventNeedForOrganizer,
  type EventNeedInput,
  type EventNeedPublic,
  type EventNeedUpdate,
  type EventNeedView,
  eventAcceptsVendorType,
  isLocked,
  lockAt,
  type MissionCard,
  type MissionsQuery,
  type MissionsResult,
  missionDistanceSort,
  missionTexts,
  PROVIDER_DEFAULT_RADIUS_KM,
  type ProviderPower,
  type ProviderReviewInput,
  type ProviderReviewIssue,
  type ProviderReviewsSummary,
  type ProviderReviewView,
  type ProviderSpotInput,
  providerReviewIssue,
  providerReviewTexts,
  providerSpotTexts,
  type StaffRole,
  type VendorTypeCode,
  vendorTypeLabels,
} from "@orasso/shared";
import { and, asc, between, desc, eq, gt, inArray, isNull, max, ne, or } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  eventNeeds,
  events,
  providerProfiles,
  providerReviews,
  structures,
  ticketTypes,
} from "../../db/schema";
import { activeMembership, requireOrganizer, requireOrganizerWrite, staffAccess } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, forbidden, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { type Tx, withTx } from "../../lib/tx";
import { eventsRepo } from "../events/repo";
import { notificationsService } from "../notifications/service";
import {
  filledByNeed,
  type NeedRow,
  needView,
  needViewsForOrganizer,
  needViewsOfEvent,
  reviewsOf,
  reviewView,
} from "./needs";
import { providerOfUser } from "./service";

const ACTIVE = activeApplicationStatuses as readonly ApplicationStatus[];
/** Lecture des besoins : l'organisation et le staff de l'événement (jour J et filtration). */
const NEEDS_READ_ROLES = [
  "scan",
  "placement",
  "control",
  "filtering",
  "super_staff",
] as const satisfies readonly StaffRole[];

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

const reviewIssueMessages: Record<ProviderReviewIssue, string> = {
  not_accepted: providerReviewTexts.notAccepted,
  event_cancelled: providerReviewTexts.eventCancelled,
  not_ended: providerReviewTexts.notEnded,
  window_closed: providerReviewTexts.windowClosed,
};

/** Événement modifiable par ses besoins : ni annulé ni terminé. */
function assertNeedsEditable(event: { status: string; endsAt: Date }) {
  if (event.status === "cancelled") throw conflict("conflict", "Événement annulé");
  if (event.endsAt <= now()) throw conflict("conflict", "Événement terminé : ses besoins ne changent plus");
}

/** Un besoin crée aussi son métier dans `vendor_types` s'il n'y est pas (compatibilité avec le lot 21). */
async function ensureVendorType(tx: Tx, event: { id: string; vendorTypes: string[] }, trade: VendorTypeCode) {
  if (eventAcceptsVendorType(event.vendorTypes, trade)) return;
  await tx
    .update(events)
    .set({ vendorTypes: [...event.vendorTypes, vendorTypeLabels[trade]] })
    .where(eq(events.id, event.id));
}

async function needOfEvent(tx: Tx, eventId: string, needId: string): Promise<NeedRow> {
  const [need] = await tx
    .select()
    .from(eventNeeds)
    .where(and(eq(eventNeeds.id, needId), eq(eventNeeds.eventId, eventId)))
    .for("update");
  if (!need) throw notFound("Besoin introuvable");
  return need;
}

/** Une candidature de prestataire de l'événement, verrouillée. */
async function providerApplicationOf(tx: Tx, eventId: string, applicationId: string) {
  const [app] = await tx
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.eventId, eventId)))
    .for("update");
  if (app?.kind !== "provider" || !app.providerProfileId) throw notFound("Candidature introuvable");
  return app;
}

/** Visiteurs attendus : places de la billetterie Orasso ouverte (`null` sans billetterie ou si un billet est sans limite). */
async function expectedVisitors(eventIds: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!eventIds.length) return out;
  const rows = await db
    .select({ eventId: ticketTypes.eventId, capacity: ticketTypes.capacity })
    .from(ticketTypes)
    .where(inArray(ticketTypes.eventId, eventIds));
  for (const r of rows) {
    const prev = out.get(r.eventId);
    out.set(r.eventId, prev === null || r.capacity === null ? null : (prev ?? 0) + r.capacity);
  }
  return out;
}

export const missionsService = {
  // --- Besoins de l'organisateur ---------------------------------------------------------------------------------

  /**
   * `GET /events/:id/needs` (organisation) : les besoins, places comblées et prestataires retenus (emplacement, avis
   * donné). Lecture permise au staff de l'événement (rôles du jour J et de filtration) ; l'écriture reste à
   * l'organisation.
   */
  async listNeeds(v: Viewer, eventId: string): Promise<EventNeedForOrganizer[]> {
    const event = await eventsRepo.byId(eventId);
    const access = await staffAccess(v, event.structureId, NEEDS_READ_ROLES, eventId);
    if (!access) throw forbidden("Réservé à l'organisation de l'événement");
    return needViewsForOrganizer(eventId);
  },

  /** `POST /events/:id/needs` : « cherche 1 food truck, électricité fournie ». */
  async createNeed(v: Viewer, eventId: string, input: EventNeedInput): Promise<EventNeedView> {
    rateLimit("proWrite", v.user.id);
    const event = await eventsRepo.byId(eventId);
    await requireOrganizerWrite(v, event.structureId);
    return withTx(async (tx, after) => {
      const locked = await eventsRepo.lockForUpdate(tx, eventId);
      assertNeedsEditable(locked);
      // Correctif 53c : même clé de création (nouvel essai après une réponse perdue) = la mission déjà créée. Le verrou
      // de l'événement range les créations l'une après l'autre ; l'index unique `(event_id, client_key)` en répond.
      if (input.clientKey) {
        const [existing] = await tx
          .select()
          .from(eventNeeds)
          .where(and(eq(eventNeeds.eventId, eventId), eq(eventNeeds.clientKey, input.clientKey)));
        if (existing) return needView(existing, (await filledByNeed([existing.id], tx)).get(existing.id) ?? 0);
      }
      const [agg] = await tx
        .select({ maxPos: max(eventNeeds.position) })
        .from(eventNeeds)
        .where(eq(eventNeeds.eventId, eventId));
      const [row] = await tx
        .insert(eventNeeds)
        .values({
          eventId,
          trade: input.trade,
          quantity: input.quantity,
          power: input.power,
          water: input.water,
          frontageM: input.frontageM ?? null,
          installAt: input.installAt ? new Date(input.installAt) : null,
          notes: input.notes,
          position: (agg?.maxPos ?? -1) + 1,
          clientKey: input.clientKey ?? null,
        })
        .returning();
      if (!row) throw new Error("Besoin non enregistré");
      await ensureVendorType(tx, locked, input.trade);
      after(() => realtime.publish(`event:${eventId}:triage`, "needs.changed", { eventId }));
      return needView(row, 0);
    });
  },

  /** `PATCH /events/:id/needs/:needId` : champs envoyés seulement. */
  async updateNeed(v: Viewer, eventId: string, needId: string, input: EventNeedUpdate): Promise<EventNeedView> {
    rateLimit("proWrite", v.user.id);
    const event = await eventsRepo.byId(eventId);
    await requireOrganizerWrite(v, event.structureId);
    return withTx(async (tx, after) => {
      const locked = await eventsRepo.lockForUpdate(tx, eventId);
      assertNeedsEditable(locked);
      await needOfEvent(tx, eventId, needId);
      const { installAt, ...rest } = input;
      const [row] = await tx
        .update(eventNeeds)
        .set({ ...rest, ...(installAt !== undefined ? { installAt: installAt ? new Date(installAt) : null } : {}) })
        .where(eq(eventNeeds.id, needId))
        .returning();
      if (!row) throw notFound("Besoin introuvable");
      if (input.trade) await ensureVendorType(tx, locked, input.trade);
      after(() => realtime.publish(`event:${eventId}:triage`, "needs.changed", { eventId }));
      return needView(row, (await filledByNeed([row.id], tx)).get(row.id) ?? 0);
    });
  },

  /** `DELETE /events/:id/needs/:needId` : les candidatures restent, sans mission (`need_id` → null par la base). */
  async deleteNeed(v: Viewer, eventId: string, needId: string): Promise<void> {
    rateLimit("proWrite", v.user.id);
    const event = await eventsRepo.byId(eventId);
    await requireOrganizerWrite(v, event.structureId);
    await withTx(async (tx, after) => {
      const locked = await eventsRepo.lockForUpdate(tx, eventId);
      assertNeedsEditable(locked);
      await needOfEvent(tx, eventId, needId);
      await tx.delete(eventNeeds).where(eq(eventNeeds.id, needId));
      after(() => realtime.publish(`event:${eventId}:triage`, "needs.changed", { eventId }));
    });
  },

  /** `GET /events/by-slug/:slug/needs` (public) : ce que cherche l'événement, sans les candidats. */
  async needsPublic(slug: string): Promise<EventNeedPublic[]> {
    const event = await db.query.events.findFirst({ where: eq(events.slug, slug) });
    if (!event || event.status === "draft" || event.admission === "invite_only") {
      throw notFound("Événement introuvable");
    }
    return (await needViewsOfEvent(event.id)).map(
      ({ filled: _f, notes: _n, position: _p, clientKey: _k, ...rest }) => rest,
    );
  },

  // --- Missions du prestataire -----------------------------------------------------------------------------------

  /**
   * `GET /missions?trade=&radiusKm=&from=` (`s-missions`) : événements publiés, à venir, non verrouillés, hors
   * invitation, qui ont un besoin non comblé de ce métier, à moins du rayon du centre du département de départ ; du
   * plus proche au plus loin. Un événement sans position (ni coordonnées ni département) n'est pas proposé : sa
   * distance est inconnue.
   */
  async missions(v: Viewer, q: MissionsQuery): Promise<MissionsResult> {
    const profile = await providerOfUser(v.user.id);
    const trade = q.trade ?? (profile?.type as VendorTypeCode | undefined);
    if (!trade) throw validation("Choisis un métier (ou crée ton profil de prestataire)");
    const radiusKm = q.radiusKm ?? profile?.radiusKm ?? PROVIDER_DEFAULT_RADIUS_KM;
    const from = q.from ?? profile?.departments[0] ?? null;
    const center = from ? departmentCentroids[from] : undefined;
    if (!from || !center) return { trade, radiusKm, from: null, items: [] };
    const t = now();
    // Préfiltre en base, avant la limite : coordonnées dans la boîte qui contient le cercle, ou, sans coordonnées, un
    // département dont le centre est dans le rayon. La distance exacte est vérifiée ensuite.
    const box = boundingBox(center, radiusKm);
    const nearDepartments = Object.entries(departmentCentroids)
      .filter(([, c]) => distanceKm(center, c) <= radiusKm)
      .map(([code]) => code);
    const rows = await db
      .select({ need: eventNeeds, e: events, structureName: structures.name })
      .from(eventNeeds)
      .innerJoin(events, eq(events.id, eventNeeds.eventId))
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(
        and(
          eq(eventNeeds.trade, trade),
          eq(events.status, "published"),
          gt(events.endsAt, t),
          ne(events.admission, "invite_only"),
          or(
            and(between(events.lat, box.minLat, box.maxLat), between(events.lng, box.minLng, box.maxLng)),
            nearDepartments.length ? and(isNull(events.lat), inArray(events.department, nearDepartments)) : undefined,
          ),
        ),
      )
      .orderBy(asc(events.startsAt), asc(eventNeeds.position))
      .limit(500);
    const filled = await filledByNeed(rows.map((r) => r.need.id));
    const byEvent = new Map<string, { e: typeof events.$inferSelect; structureName: string; needs: EventNeedView[] }>();
    for (const r of rows) {
      const view = needView(r.need, filled.get(r.need.id) ?? 0);
      if (view.remaining === 0 || isLocked(r.e, t)) continue;
      const entry = byEvent.get(r.e.id) ?? { e: r.e, structureName: r.structureName, needs: [] };
      entry.needs.push(view);
      byEvent.set(r.e.id, entry);
    }
    const near = [...byEvent.values()].flatMap((entry) => {
      const pos =
        entry.e.lat !== null && entry.e.lng !== null
          ? { lat: entry.e.lat, lng: entry.e.lng }
          : entry.e.department
            ? departmentCentroids[entry.e.department]
            : undefined;
      if (!pos) return [];
      const km = distanceKm(center, pos);
      return km <= radiusKm ? [{ ...entry, km }] : [];
    });
    const ids = near.map((n) => n.e.id);
    const visitors = await expectedVisitors(near.filter((n) => n.e.ticketsEnabled).map((n) => n.e.id));
    const mine =
      profile && ids.length
        ? await db
            .select()
            .from(applications)
            .where(and(eq(applications.providerProfileId, profile.id), inArray(applications.eventId, ids)))
            .orderBy(desc(applications.createdAt))
        : [];
    const items: MissionCard[] = near.map(({ e, structureName, needs, km }) => {
      const app =
        mine.find((a) => a.eventId === e.id && ACTIVE.includes(a.status)) ?? mine.find((a) => a.eventId === e.id);
      return {
        id: e.id,
        slug: e.slug,
        title: e.title,
        format: e.format,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        city: e.city,
        status: e.status,
        department: e.department,
        structureName,
        distanceKm: Math.round(km),
        lockAt: lockAt(e).toISOString(),
        expectedVisitors: e.ticketsEnabled ? (visitors.get(e.id) ?? null) : null,
        needs,
        myApplication: app ? { id: app.id, status: app.status, needId: app.needId } : null,
      };
    });
    return { trade, radiusKm, from, items: missionDistanceSort(items) };
  },

  // --- Emplacement -----------------------------------------------------------------------------------------------

  /**
   * `PATCH /events/:id/applications/:appId/spot` : emplacement (« B2 ») et note d'un prestataire retenu. Le prestataire
   * est prévenu (`provider_spot_assigned`) avec l'emplacement, l'arrivée et l'électricité de sa mission, puis les
   * consignes de l'événement s'il y en a — seulement quand l'emplacement ou sa note change. Ni sur un événement annulé
   * ni après sa fin. Permis à une structure suspendue (comme le tri et l'accueil des événements publiés).
   */
  async setSpot(v: Viewer, eventId: string, applicationId: string, input: ProviderSpotInput) {
    rateLimit("proWrite", v.user.id);
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    return withTx(async (tx, after) => {
      const locked = await eventsRepo.lockForUpdate(tx, eventId);
      if (locked.status === "cancelled") throw conflict("conflict", "Événement annulé");
      if (locked.endsAt <= now()) throw conflict("conflict", "Événement terminé : l'emplacement ne change plus");
      const app = await providerApplicationOf(tx, eventId, applicationId);
      if (app.status !== "accepted") throw conflict("conflict", "L'emplacement se donne à un prestataire retenu");
      const changed = app.spotLabel !== input.spotLabel || app.spotNote !== input.spotNote;
      const [row] = await tx
        .update(applications)
        .set({ spotLabel: input.spotLabel, spotNote: input.spotNote })
        .where(eq(applications.id, app.id))
        .returning();
      if (!row) throw notFound("Candidature introuvable");
      const notify = changed && Boolean(row.spotLabel);
      if (notify && row.spotLabel) {
        const need = app.needId
          ? (await tx.select().from(eventNeeds).where(eq(eventNeeds.id, app.needId)))[0]
          : undefined;
        const parts = [
          providerSpotTexts.spot(row.spotLabel),
          need?.installAt ? providerSpotTexts.arrival(arrivalHourLabel(need.installAt)) : null,
          need ? missionTexts.powerDetail(need.power as ProviderPower) : null,
          row.spotNote,
        ].filter((x): x is string => Boolean(x));
        const body = [providerSpotTexts.notifBody(parts), locked.instructions ?? ""].filter(Boolean).join("\n\n");
        await notificationsService.notify(tx, row.userId, "provider_spot_assigned", {
          title: providerSpotTexts.notifTitle(locked.title),
          body,
          data: { applicationId: row.id, eventId, spotLabel: row.spotLabel },
          eventId,
          eventStartsAt: locked.startsAt,
          link: { label: "Voir mes candidatures", path: "/app/prestataire" },
        });
      }
      after(() => {
        const payload = { applicationId: row.id, eventId, status: row.status };
        realtime.publish(`event:${eventId}:triage`, "application.changed", payload);
        realtime.publish(`user:${row.userId}`, "application.changed", payload);
        if (notify) notificationsService.kick();
      });
      return { applicationId: row.id, spotLabel: row.spotLabel, spotNote: row.spotNote };
    });
  },

  // --- Avis des organisateurs ------------------------------------------------------------------------------------

  /**
   * `POST /events/:id/applications/:appId/provider-review` : un avis par candidature retenue, de 1 à 5, entre la fin de
   * l'événement et 30 jours après (V10), par un propriétaire ou co-organisateur de la structure (jamais le super
   * admin en assistance : l'avis engage la structure). Jamais d'auto-évaluation : refusé (403) si le prestataire est
   * lui-même propriétaire ou co-organisateur de la structure, ou s'il est l'auteur.
   */
  async review(v: Viewer, eventId: string, applicationId: string, input: ProviderReviewInput) {
    rateLimit("proWrite", v.user.id);
    const event = await eventsRepo.byId(eventId);
    const access = await requireOrganizerWrite(v, event.structureId);
    if (access.role === "super_admin") throw forbidden(providerReviewTexts.authorRole);
    try {
      const created = await withTx(async (tx, after) => {
        const locked = await eventsRepo.lockForUpdate(tx, eventId);
        const app = await providerApplicationOf(tx, eventId, applicationId);
        if (app.userId === v.user.id) throw forbidden(providerReviewTexts.selfReview);
        const member = await activeMembership(app.userId, locked.structureId);
        if (member && (member.role === "owner" || member.role === "co_organizer")) {
          throw forbidden(providerReviewTexts.selfReview);
        }
        const issue = providerReviewIssue(app, locked, now());
        if (issue) throw conflict("conflict", reviewIssueMessages[issue], { reason: issue });
        const [row] = await tx
          .insert(providerReviews)
          .values({
            providerProfileId: app.providerProfileId as string,
            structureId: locked.structureId,
            eventId,
            applicationId: app.id,
            authorId: v.user.id,
            rating: input.rating,
            comment: input.comment,
          })
          .returning();
        if (!row) throw new Error("Avis non enregistré");
        const [structure] = await tx
          .select({ name: structures.name })
          .from(structures)
          .where(eq(structures.id, locked.structureId));
        await notificationsService.notify(tx, app.userId, "provider_review_received", {
          title: providerReviewTexts.notifTitle(structure?.name ?? ""),
          body: providerReviewTexts.notifBody(locked.title, input.rating),
          data: { applicationId: app.id, eventId, reviewId: row.id },
          eventId,
          link: { label: "Voir mes candidatures", path: "/app/prestataire" },
        });
        after(() => notificationsService.kick());
        return row;
      });
      const [full] = await db
        .select({
          r: providerReviews,
          structureName: structures.name,
          eventTitle: events.title,
          eventEndsAt: events.endsAt,
        })
        .from(providerReviews)
        .innerJoin(structures, eq(structures.id, providerReviews.structureId))
        .innerJoin(events, eq(events.id, providerReviews.eventId))
        .where(eq(providerReviews.id, created.id));
      return reviewView(full as Parameters<typeof reviewView>[0]) satisfies ProviderReviewView;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("conflict", providerReviewTexts.duplicate, { reason: "duplicate" });
      throw error;
    }
  },

  /** `GET /providers/:id/reviews` (connectés) : moyenne, nombre et 3 derniers avis visibles. */
  async reviewsOfProvider(providerId: string): Promise<ProviderReviewsSummary> {
    const [p] = await db
      .select({ id: providerProfiles.id, deletedAt: providerProfiles.deletedAt })
      .from(providerProfiles)
      .where(eq(providerProfiles.id, providerId));
    if (!p || p.deletedAt) throw notFound("Prestataire introuvable");
    return reviewsOf(providerId);
  },
};
