// Lecture des candidatures : cartes « Accès » du passionné, fiches et liste du tri de l'organisateur.
import {
  type ApplicationAlert,
  type ApplicationForTriage,
  type EventCounters,
  lockAt,
  type MyApplication,
  type Page,
  type RefusalReason,
  type TriageQuery,
} from "@orasso/shared";
import { and, asc, count, desc, eq, gt, ilike, inArray, lte, ne, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  events,
  eventZones,
  profiles,
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
import { type EventRow, eventsRepo } from "../events/repo";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleFull, vehicleLabel } from "../vehicles/serializers";
import type { ApplicationRow } from "./service";

/** Rangs affichés (1 = prochain servi) de toutes les candidatures en liste d'attente d'un événement. */
async function waitlistRanks(eventIds: string[]): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  if (!eventIds.length) return ranks;
  const rows = await db
    .select({ id: applications.id, eventId: applications.eventId })
    .from(applications)
    .where(and(inArray(applications.eventId, eventIds), eq(applications.status, "waitlisted")))
    .orderBy(
      sql`${applications.waitlistRank} asc nulls last`,
      asc(applications.waitlistedAt),
      asc(applications.createdAt),
    );
  const perEvent = new Map<string, number>();
  for (const r of rows) {
    const n = (perEvent.get(r.eventId) ?? 0) + 1;
    perEvent.set(r.eventId, n);
    ranks.set(r.id, n);
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
  return rows.flatMap((r) => {
    const e = eventsById.get(r.eventId);
    if (!e) return [];
    const v = r.vehicleId ? vehiclesById.get(r.vehicleId) : undefined;
    const z = r.zoneId ? zonesById.get(r.zoneId) : undefined;
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
        waitlistRank: r.status === "waitlisted" ? (ranks.get(r.id) ?? null) : null,
        offerExpiresAt: r.status === "offered" ? (r.offerExpiresAt?.toISOString() ?? null) : null,
        withdrawDeadline: lockAt(e).toISOString(),
        withdrawnAfterLock: r.withdrawnAfterLock,
        refusalReasons: r.status === "refused" && r.refusalSent ? (r.refusalReasons as RefusalReason[]) : null,
        refusalNote: r.status === "refused" && r.refusalSent ? r.refusalNote : null,
        zone: z && r.status === "accepted" ? { code: z.code, name: z.name } : null,
        createdAt: r.createdAt.toISOString(),
      },
    ];
  });
}

/** Fiches de tri, hydratées par lots. `withContact` : organisateur (plaque, nom, téléphone, e-mail). */
async function toTriage(
  event: EventRow,
  rows: ApplicationRow[],
  withContact: boolean,
): Promise<ApplicationForTriage[]> {
  if (!rows.length) return [];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const vehicleRows = await vehiclesRepo.findFullByIds(rows.flatMap((r) => (r.vehicleId ? [r.vehicleId] : [])));
  const vehiclesById = new Map(vehicleRows.map((v) => [v.id, v]));
  const people = await db
    .select({ p: profiles, email: user.email })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(inArray(profiles.userId, userIds));
  const peopleById = new Map(people.map((x) => [x.p.userId, x]));

  // Nombre d'événements (retenu sur un événement terminé) ; les absences viennent avec le pointage (lot 06).
  const t = now();
  const past = await db
    .select({ userId: applications.userId, n: count() })
    .from(applications)
    .innerJoin(events, eq(events.id, applications.eventId))
    .where(and(inArray(applications.userId, userIds), eq(applications.status, "accepted"), lte(events.endsAt, t)))
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
        eq(events.structureId, event.structureId),
        ne(applications.eventId, event.id),
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

  return rows.map((r) => {
    const v = r.vehicleId ? vehiclesById.get(r.vehicleId) : undefined;
    const person = peopleById.get(r.userId);
    const h = history.filter((x) => x.userId === r.userId);
    const alerts: ApplicationAlert[] = [];
    if (v?.plateNormalized && dupPlates.has(v.plateNormalized)) alerts.push("duplicatePlate");
    if (banned.has(r.userId)) alerts.push("banned");
    if (v?.unregistered) alerts.push("unregistered");
    const vehicle = v ? vehicleFull(v) : null;
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      companions: r.companions,
      message: r.message,
      waitlistRank: r.status === "waitlisted" ? (ranks.get(r.id) ?? null) : null,
      offerExpiresAt: r.offerExpiresAt?.toISOString() ?? null,
      refusalReasons: r.refusalReasons as RefusalReason[],
      refusalNote: r.refusalNote,
      refusalSent: r.refusalSent,
      withdrawnAfterLock: r.withdrawnAfterLock,
      zoneId: r.zoneId,
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
        absencesCount: 0,
        historyWithStructure: {
          accepted: h.filter((x) => x.status === "accepted").reduce((a, x) => a + x.n, 0),
          refused: h.filter((x) => x.status === "refused").reduce((a, x) => a + x.n, 0),
          total: h.reduce((a, x) => a + x.n, 0),
        },
      },
      filteringOpinions: (r.filteringOpinion ?? []).map((o) => ({ ...o, pseudo: authorPseudo.get(o.userId) ?? "" })),
      alerts,
    };
  });
}

/** Organisateur (fiche complète) ou staff de filtration (sans plaque ni coordonnées). */
async function triageAccess(v: Viewer, event: EventRow): Promise<{ withContact: boolean }> {
  const access = await staffAccess(v, event.structureId, ["filtering"]);
  if (!access) throw forbidden("Réservé à l'organisation");
  return { withContact: access.actor !== "staff" };
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
        and(eq(applications.userId, v.user.id), scope === "upcoming" ? gt(events.endsAt, t) : lte(events.endsAt, t)),
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
    const event = await eventsRepo.byId(app.eventId);
    const access = await staffAccess(v, event.structureId, ["filtering"]).catch(() => null);
    if (!access) throw notFound("Candidature introuvable");
    const [card] = await toTriage(event, [app], access.actor !== "staff");
    if (!card) throw notFound("Candidature introuvable");
    return card;
  },

  async triageList(v: Viewer, eventId: string, q: TriageQuery): Promise<Page<ApplicationForTriage>> {
    const event = await eventsRepo.byId(eventId);
    const { withContact } = await triageAccess(v, event);
    const filters: (SQL | undefined)[] = [eq(applications.eventId, eventId)];
    if (q.status) filters.push(eq(applications.status, q.status));
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
      filters.push(or(ilike(profiles.pseudo, like), ilike(vehicleMakes.name, like), ilike(vehicleModels.name, like)));
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
      .innerJoin(profiles, eq(profiles.userId, applications.userId))
      .where(and(...filters))
      .orderBy(...order, asc(applications.id))
      .limit(q.limit + 1)
      .offset(offset);
    const items = await toTriage(
      event,
      rows.slice(0, q.limit).map((r) => r.a),
      withContact,
    );
    return { items, nextCursor: rows.length > q.limit ? encodeOffset(offset + q.limit) : null };
  },

  /** File une par une : la plus ancienne candidature à trier. */
  async next(v: Viewer, eventId: string): Promise<ApplicationForTriage | null> {
    const event = await eventsRepo.byId(eventId);
    const { withContact } = await triageAccess(v, event);
    const app = await db.query.applications.findFirst({
      where: and(eq(applications.eventId, eventId), eq(applications.status, "pending")),
      orderBy: [asc(applications.createdAt), asc(applications.id)],
    });
    if (!app) return null;
    const [card] = await toTriage(event, [app], withContact);
    return card ?? null;
  },

  async counters(v: Viewer, eventId: string): Promise<EventCounters> {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    return eventsRepo.counters(event);
  },
};
