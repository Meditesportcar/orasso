// Lecture des candidatures : cartes « Accès » du passionné, fiches et liste du tri de l'organisateur.
import {
  type ApplicationAlert,
  type ApplicationForTriage,
  type ApplicationKind,
  canContest,
  contestDeadline,
  type EventCounters,
  lockAt,
  type MyApplication,
  type Page,
  pointsPending,
  type RefusalReason,
  type StructureNoteView,
  type TriageQuery,
} from "@orasso/shared";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lte, ne, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  checkins,
  events,
  eventZones,
  malusContests,
  pointEntries,
  profiles,
  providerProfiles,
  structureBans,
  user,
  vehicleCategories,
  vehicleMakes,
  vehicleModels,
  vehicles,
} from "../../db/schema";
import { requireOrganizer, staffAccess } from "../../lib/access";
import { now } from "../../lib/deps";
import { forbidden, notFound } from "../../lib/errors";
import { escapeLike } from "../../lib/pagination";
import type { Viewer } from "../../lib/session";
import { contactViews } from "../after-event/contact-views";
import { notesService } from "../after-event/notes";
import { crewsForApplications, crewsForTriage, eventCrewFilters } from "../crews/application-info";
import { type DayRow, daysRepo } from "../events/days";
import { type EventRow, eventsRepo } from "../events/repo";
import { pointsService } from "../points/service";
import { providerTriageExtras } from "../providers/needs";
import { loadProviders, triageView } from "../providers/serializers";
import { reviewsService } from "../reviews/service";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleFull, vehicleLabel } from "../vehicles/serializers";
import type { ApplicationRow } from "./service";

/** Candidature seule, ou venue en crew confirmée par le membre (lot 19) : seules visibles de l'organisation. */
const confirmedByMember = sql`(${applications.crewApplicationId} is null or ${applications.memberConfirmedAt} is not null)`;

/** Jour d'une candidature tel que les clients le reçoivent (lot 26). */
export const dayView = (d: DayRow | undefined) =>
  d ? { id: d.id, date: d.dayDate, startsAt: d.startsAt.toISOString(), endsAt: d.endsAt.toISOString() } : null;

/** Rangs affichés (1 = prochain servi) de toutes les candidatures en liste d'attente d'un événement. */
async function waitlistRanks(eventIds: string[]): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  if (!eventIds.length) return ranks;
  const rows = await db
    .select({
      id: applications.id,
      eventId: applications.eventId,
      kind: applications.kind,
      eventDayId: applications.eventDayId,
    })
    .from(applications)
    .where(and(inArray(applications.eventId, eventIds), eq(applications.status, "waitlisted")))
    .orderBy(
      sql`${applications.waitlistRank} asc nulls last`,
      asc(applications.waitlistedAt),
      asc(applications.createdAt),
    );
  // Un rang par file : les prestataires ont leur propre liste d'attente, hors capacité (lot 21). Plusieurs jours
  // (lot 26) : devant une candidature d'un jour, seules celles de ce jour et de tout l'événement.
  const seen: typeof rows = [];
  for (const r of rows) {
    const ahead = seen.filter(
      (s) =>
        s.eventId === r.eventId &&
        s.kind === r.kind &&
        (r.eventDayId === null || s.eventDayId === null || s.eventDayId === r.eventDayId),
    ).length;
    seen.push(r);
    ranks.set(r.id, ahead + 1);
  }
  return ranks;
}

async function toMine(rows: ApplicationRow[]): Promise<MyApplication[]> {
  if (!rows.length) return [];
  const eventRows = await db.query.events.findMany({
    where: inArray(events.id, [...new Set(rows.map((r) => r.eventId))]),
  });
  const eventsById = new Map(eventRows.map((e) => [e.id, e]));
  const vehicleRows = await vehiclesRepo.findFullByIds([
    ...new Set(rows.flatMap((r) => (r.vehicleId ? [r.vehicleId] : []))),
  ]);
  const vehiclesById = new Map(vehicleRows.map((v) => [v.id, v]));
  const zoneIds = rows.flatMap((r) => (r.zoneId ? [r.zoneId] : []));
  const zones = zoneIds.length ? await db.query.eventZones.findMany({ where: inArray(eventZones.id, zoneIds) }) : [];
  const zonesById = new Map(zones.map((z) => [z.id, z]));
  const ranks = await waitlistRanks(eventRows.map((e) => e.id));
  // Jour J et après (lot 06) : entrée, points de la candidature, malus et contestation.
  const appIds = rows.map((r) => r.id);
  const entries = await db.query.checkins.findMany({ where: inArray(checkins.applicationId, appIds) });
  const enteredAt = new Map(entries.map((c) => [c.applicationId, c.checkedInAt]));
  const pts = await db.query.pointEntries.findMany({ where: inArray(pointEntries.applicationId, appIds) });
  const contests = await db.query.malusContests.findMany({ where: inArray(malusContests.applicationId, appIds) });
  // Avis après l'événement (lot 12) : candidatures pointées seulement.
  const myReviews = await reviewsService.mine(rows[0]?.userId ?? "", rows, eventsById, new Set(enteredAt.keys()));
  // Inscription en crew (lot 19) : le crew, son chef, l'échéance de confirmation.
  const crewInfo = await crewsForApplications(rows);
  // Plusieurs jours (lot 26) : le jour choisi.
  const daysById = await daysRepo.byIds(rows.map((r) => r.eventDayId));
  const t = now();
  return rows.flatMap((r) => {
    const e = eventsById.get(r.eventId);
    if (!e) return [];
    const v = r.vehicleId ? vehiclesById.get(r.vehicleId) : undefined;
    const z = r.zoneId ? zonesById.get(r.zoneId) : undefined;
    const mine = pts.filter((p) => p.applicationId === r.id);
    const malusEntry = mine.find((p) => p.kind === "malus");
    const reversed = mine.some((p) => p.kind === "malus_reversal");
    const contest = contests.find((c) => c.applicationId === r.id);
    return [
      {
        id: r.id,
        status: r.status,
        event: {
          id: e.id,
          slug: e.slug,
          title: e.title,
          format: e.format,
          startsAt: e.startsAt.toISOString(),
          endsAt: e.endsAt.toISOString(),
          city: e.city,
          status: e.status,
        },
        vehicle: v ? { id: v.id, label: vehicleLabel(v) } : null,
        day: dayView(r.eventDayId ? daysById.get(r.eventDayId) : undefined),
        waitlistRank: r.status === "waitlisted" ? (ranks.get(r.id) ?? null) : null,
        offerExpiresAt: r.status === "offered" ? (r.offerExpiresAt?.toISOString() ?? null) : null,
        withdrawDeadline: lockAt(e).toISOString(),
        withdrawnAfterLock: r.withdrawnAfterLock,
        refusalReasons: r.status === "refused" && r.refusalSent ? (r.refusalReasons as RefusalReason[]) : null,
        refusalNote: r.status === "refused" && r.refusalSent ? r.refusalNote : null,
        zone: z && r.status === "accepted" ? { code: z.code, name: z.name } : null,
        createdAt: r.createdAt.toISOString(),
        checkedInAt: enteredAt.get(r.id)?.toISOString() ?? null,
        pointsPending:
          (r.status === "accepted" || r.withdrawnAfterLock) && e.status === "published" && pointsPending(e, t),
        points: mine.length ? mine.reduce((sum, p) => sum + p.points, 0) : null,
        malus: malusEntry
          ? {
              deadline: contestDeadline(malusEntry.createdAt).toISOString(),
              canContest: !contest && !reversed && canContest(malusEntry.createdAt, t),
              contestStatus: contest?.status ?? null,
            }
          : null,
        review: myReviews.get(r.id) ?? null,
        crew: crewInfo(r, e),
      },
    ];
  });
}

/** Fiches de tri, hydratées par lots. `withContact` : organisateur (plaque, nom, téléphone, e-mail). */
async function toTriage(
  event: EventRow,
  rows: ApplicationRow[],
  withContact: boolean,
  viewerId: string,
  withNotes: boolean,
): Promise<ApplicationForTriage[]> {
  if (!rows.length) return [];
  // Lot 27 : après J+7, montrer des coordonnées est tracé (une entrée par fiche et par jour), avant de les rendre.
  if (withContact) {
    await contactViews.trace(
      viewerId,
      event,
      rows.map((r) => r.id),
    );
  }
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const vehicleRows = await vehiclesRepo.findFullByIds(rows.flatMap((r) => (r.vehicleId ? [r.vehicleId] : [])));
  const vehiclesById = new Map(vehicleRows.map((v) => [v.id, v]));
  const providersById = await loadProviders(rows.flatMap((r) => (r.providerProfileId ? [r.providerProfileId] : [])));
  // Lot 46 : mission, emplacement et avis des candidatures de prestataires.
  const providerExtras = await providerTriageExtras(rows);
  const people = await db
    .select({ p: profiles, email: user.email })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(inArray(profiles.userId, userIds));
  const peopleById = new Map(people.map((x) => [x.p.userId, x]));

  // Nombre d'événements (retenu sur un événement terminé) ; absences = malus de J+2 non annulés (lot 06).
  const t = now();
  const absences = await pointsService.absences(userIds);
  const past = await db
    .select({ userId: applications.userId, n: count() })
    .from(applications)
    .innerJoin(events, eq(events.id, applications.eventId))
    .where(
      and(
        inArray(applications.userId, userIds),
        eq(applications.kind, "vehicle"),
        eq(applications.status, "accepted"),
        lte(events.endsAt, t),
      ),
    )
    .groupBy(applications.userId);
  const pastById = new Map(past.map((x) => [x.userId, x.n]));

  // Historique avec la même structure (autres événements).
  const history = await db
    .select({ userId: applications.userId, status: applications.status, n: count() })
    .from(applications)
    .innerJoin(events, eq(events.id, applications.eventId))
    .where(
      and(
        inArray(applications.userId, userIds),
        eq(applications.kind, "vehicle"),
        eq(events.structureId, event.structureId),
        ne(applications.eventId, event.id),
        confirmedByMember,
      ),
    )
    .groupBy(applications.userId, applications.status);

  const bans = await db
    .select({ userId: structureBans.userId })
    .from(structureBans)
    .where(and(eq(structureBans.structureId, event.structureId), inArray(structureBans.userId, userIds)));
  const banned = new Set(bans.map((b) => b.userId));

  // « Plaque en double » : même plaque sur plusieurs candidatures actives de l'événement.
  const dupRows = await db
    .select({ plate: vehicles.plateNormalized })
    .from(applications)
    .innerJoin(vehicles, eq(vehicles.id, applications.vehicleId))
    .where(
      and(
        eq(applications.eventId, event.id),
        inArray(applications.status, ["pending", "accepted", "waitlisted", "offered"]),
        sql`${vehicles.plateNormalized} is not null`,
      ),
    )
    .groupBy(vehicles.plateNormalized)
    .having(sql`count(distinct ${vehicles.id}) > 1`);
  const dupPlates = new Set(dupRows.map((d) => d.plate));

  const opinionAuthors = [...new Set(rows.flatMap((r) => (r.filteringOpinion ?? []).map((o) => o.userId)))];
  const authors = opinionAuthors.length
    ? await db
        .select({ userId: profiles.userId, pseudo: profiles.pseudo })
        .from(profiles)
        .where(inArray(profiles.userId, opinionAuthors))
    : [];
  const authorPseudo = new Map(authors.map((a) => [a.userId, a.pseudo]));
  const ranks = await waitlistRanks([event.id]);
  // Crew et autres candidatures confirmées du crew (lot 19).
  const crewOf = await crewsForTriage(event.id, rows);
  // Notes internes de la structure (lot 27) : l'organisateur seulement, jamais le staff de filtration.
  const notesOf = withNotes
    ? await notesService.forSubjects(db, event.structureId, userIds, viewerId)
    : new Map<string, StructureNoteView[]>();
  const daysById = await daysRepo.byIds(rows.map((r) => r.eventDayId));

  return rows.map((r) => {
    const v = r.vehicleId ? vehiclesById.get(r.vehicleId) : undefined;
    const person = peopleById.get(r.userId);
    const h = history.filter((x) => x.userId === r.userId);
    const alerts: ApplicationAlert[] = [];
    if (v?.plateNormalized && dupPlates.has(v.plateNormalized)) alerts.push("duplicatePlate");
    if (banned.has(r.userId)) alerts.push("banned");
    if (v?.unregistered) alerts.push("unregistered");
    const vehicle = v ? vehicleFull(v) : null;
    const prov = r.providerProfileId ? providersById.get(r.providerProfileId) : undefined;
    return {
      id: r.id,
      kind: r.kind,
      provider: prov ? triageView(prov, r.accreditedMedia, withContact, providerExtras.get(r.id)) : null,
      accreditedMedia: r.accreditedMedia,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      companions: r.companions,
      message: r.message,
      arrivalSeenAt: r.arrivalSeenAt?.toISOString() ?? null,
      arrivalNote: r.arrivalNote,
      waitlistRank: r.status === "waitlisted" ? (ranks.get(r.id) ?? null) : null,
      offerExpiresAt: r.offerExpiresAt?.toISOString() ?? null,
      refusalReasons: r.refusalReasons as RefusalReason[],
      refusalNote: r.refusalNote,
      refusalSent: r.refusalSent,
      withdrawnAfterLock: r.withdrawnAfterLock,
      zoneId: r.zoneId,
      day: dayView(r.eventDayId ? daysById.get(r.eventDayId) : undefined),
      // La plaque n'est visible que de l'organisateur (docs/01) : le staff de filtration voit la fiche sans elle.
      vehicle: vehicle && !withContact ? { ...vehicle, plate: null } : vehicle,
      applicant: {
        userId: r.userId,
        pseudo: person?.p.pseudo ?? "",
        grade: person?.p.grade ?? "rodage",
        firstName: withContact ? (person?.p.firstName ?? null) : null,
        lastName: withContact ? (person?.p.lastName ?? null) : null,
        phone: withContact ? (person?.p.phone ?? null) : null,
        email: withContact ? (person?.email ?? null) : null,
        eventsCount: pastById.get(r.userId) ?? 0,
        absencesCount: absences.get(r.userId) ?? 0,
        historyWithStructure: {
          accepted: h.filter((x) => x.status === "accepted").reduce((a, x) => a + x.n, 0),
          refused: h.filter((x) => x.status === "refused").reduce((a, x) => a + x.n, 0),
          total: h.reduce((a, x) => a + x.n, 0),
        },
        notes: notesOf.get(r.userId) ?? [],
      },
      filteringOpinions: (r.filteringOpinion ?? []).map((o) => ({ ...o, pseudo: authorPseudo.get(o.userId) ?? "" })),
      alerts,
      crew: crewOf(r),
    };
  });
}

/** Organisateur (fiche complète) ou staff de filtration (sans plaque ni coordonnées). */
async function triageAccess(v: Viewer, event: EventRow): Promise<{ withContact: boolean; withNotes: boolean }> {
  const access = await staffAccess(v, event.structureId, ["filtering"], event.id);
  if (!access) throw forbidden("Réservé à l'organisation");
  return { withContact: access.actor !== "staff", withNotes: access.actor === "organizer" };
}

const encodeOffset = (n: number) => Buffer.from(String(n)).toString("base64url");
const decodeOffset = (c?: string) => {
  const n = c ? Number(Buffer.from(c, "base64url").toString()) : 0;
  return Number.isInteger(n) && n >= 0 ? n : 0;
};

export const applicationsQueries = {
  async mine(v: Viewer, scope: "upcoming" | "past"): Promise<MyApplication[]> {
    const t = now();
    const rows = await db
      .select({ a: applications })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .where(
        and(
          eq(applications.userId, v.user.id),
          // Les candidatures de prestataire ont leur propre liste (`GET /me/provider-applications`, lot 21).
          eq(applications.kind, "vehicle"),
          scope === "upcoming" ? gt(events.endsAt, t) : lte(events.endsAt, t),
        ),
      )
      .orderBy(scope === "upcoming" ? asc(events.startsAt) : desc(events.startsAt), asc(applications.createdAt));
    return toMine(rows.map((r) => r.a));
  },

  /** Candidat : sa carte Accès. Organisation : la fiche de tri. */
  async one(v: Viewer, id: string): Promise<MyApplication | ApplicationForTriage> {
    const app = await db.query.applications.findFirst({ where: eq(applications.id, id) });
    if (!app) throw notFound("Candidature introuvable");
    if (app.userId === v.user.id) {
      const [card] = await toMine([app]);
      if (!card) throw notFound("Candidature introuvable");
      return card;
    }
    // Venue en crew jamais confirmée : rien n'est montré à l'organisation sans l'accord du membre (lot 19).
    if (app.crewApplicationId && !app.memberConfirmedAt) throw notFound("Candidature introuvable");
    const event = await eventsRepo.byId(app.eventId);
    const access = await staffAccess(v, event.structureId, ["filtering"], event.id).catch(() => null);
    if (!access) throw notFound("Candidature introuvable");
    const [card] = await toTriage(event, [app], access.actor !== "staff", v.user.id, access.actor === "organizer");
    if (!card) throw notFound("Candidature introuvable");
    return card;
  },

  async triageList(v: Viewer, eventId: string, q: TriageQuery): Promise<Page<ApplicationForTriage>> {
    const event = await eventsRepo.byId(eventId);
    const { withContact, withNotes } = await triageAccess(v, event);
    const filters: (SQL | undefined)[] = [
      eq(applications.eventId, eventId),
      eq(applications.kind, q.kind),
      // Venues en crew jamais confirmées (à confirmer, refusées, expirées) : hors de la file de tri, seulement comptées
      // dans le groupe du crew (lot 19) : rien n'est montré à l'organisation sans l'accord du membre.
      confirmedByMember,
    ];
    if (q.status) filters.push(eq(applications.status, q.status));
    if (q.crewId) filters.push(eq(applications.crewId, q.crewId));
    // Plusieurs jours (lot 26) : un jour, ou tout l'événement.
    if (q.dayId)
      filters.push(q.dayId === "whole" ? isNull(applications.eventDayId) : eq(applications.eventDayId, q.dayId));
    if (q.makeId) filters.push(eq(vehicles.makeId, q.makeId));
    if (q.country) filters.push(eq(vehicleMakes.country, q.country.toUpperCase()));
    if (q.yearFrom) filters.push(sql`${vehicles.year} >= ${q.yearFrom}`);
    if (q.yearTo) filters.push(sql`${vehicles.year} <= ${q.yearTo}`);
    if (q.grade) filters.push(eq(profiles.grade, q.grade));
    if (q.categoryId) {
      filters.push(
        inArray(
          applications.vehicleId,
          db
            .select({ id: vehicleCategories.vehicleId })
            .from(vehicleCategories)
            .where(eq(vehicleCategories.categoryId, q.categoryId)),
        ),
      );
    }
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`;
      filters.push(
        or(
          ilike(profiles.pseudo, like),
          ilike(vehicleMakes.name, like),
          ilike(vehicleModels.name, like),
          ilike(providerProfiles.name, like),
        ),
      );
    }
    const order = {
      created_at: [asc(applications.createdAt)],
      waitlist_rank: [sql`${applications.waitlistRank} asc nulls last`, asc(applications.waitlistedAt)],
      year: [sql`${vehicles.year} asc nulls last`],
      pseudo: [asc(profiles.pseudo)],
    }[q.sort];
    const offset = decodeOffset(q.cursor);
    const rows = await db
      .select({ a: applications })
      .from(applications)
      .leftJoin(vehicles, eq(vehicles.id, applications.vehicleId))
      .leftJoin(vehicleMakes, eq(vehicleMakes.id, vehicles.makeId))
      .leftJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
      .leftJoin(providerProfiles, eq(providerProfiles.id, applications.providerProfileId))
      .innerJoin(profiles, eq(profiles.userId, applications.userId))
      .where(and(...filters))
      .orderBy(...order, asc(applications.id))
      .limit(q.limit + 1)
      .offset(offset);
    const items = await toTriage(
      event,
      rows.slice(0, q.limit).map((r) => r.a),
      withContact,
      v.user.id,
      withNotes,
    );
    return { items, nextCursor: rows.length > q.limit ? encodeOffset(offset + q.limit) : null };
  },

  /** File une par une : la plus ancienne candidature à trier. */
  async next(v: Viewer, eventId: string, kind: ApplicationKind = "vehicle"): Promise<ApplicationForTriage | null> {
    const event = await eventsRepo.byId(eventId);
    const { withContact, withNotes } = await triageAccess(v, event);
    const app = await db.query.applications.findFirst({
      where: and(eq(applications.eventId, eventId), eq(applications.status, "pending"), eq(applications.kind, kind)),
      orderBy: [asc(applications.createdAt), asc(applications.id)],
    });
    if (!app) return null;
    const [card] = await toTriage(event, [app], withContact, v.user.id, withNotes);
    return card ?? null;
  },

  /** Filtre « crew » du tri (lot 19) : les crews inscrits à l'événement. */
  async crewFilters(v: Viewer, eventId: string) {
    const event = await eventsRepo.byId(eventId);
    await triageAccess(v, event);
    return eventCrewFilters(eventId);
  },

  /** Compteurs du tri ; `dayId` (lot 26) : ceux d'un jour (ses candidatures et celles de tout l'événement). */
  async counters(v: Viewer, eventId: string, dayId?: string): Promise<EventCounters> {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    if (dayId) {
      // Jour d'un autre événement (IDOR) : introuvable.
      const days = await daysRepo.list(eventId);
      if (!days.some((d) => d.id === dayId)) throw notFound("Jour introuvable");
    }
    return eventsRepo.counters(event, db, dayId ?? null);
  },
};
