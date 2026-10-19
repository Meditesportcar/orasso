// Passeport et tampons (lot 49, ARCHITECTURE-DA-V2 § 5.5, prototype DA v2 `s-passport`) : un tampon par événement
// pointé (participation), par billet scanné (visite), par présence du staff le jour J ; les rares (première sortie,
// 10e événement, nuit de pleine lune, prix du public) au règlement de J+2, qui rattrape aussi les tampons manqués.
// Idempotent : un seul tampon par personne, événement et genre (contrainte unique).
import {
  baseStampKinds,
  fromWallTime,
  isFullMoon,
  isRare,
  type PassportStamp,
  type PassportView,
  passportPages,
  passportTexts,
  type StampInk,
  type StampKind,
  seasonDates,
  seasonYear,
  stampInk,
  stampSeed,
  stampSentence,
  stampShape,
  wallTime,
} from "@orasso/shared";
import { and, asc, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, checkins, eventStaff, events, passportStamps, seasons, tickets } from "../../db/schema";
import { now } from "../../lib/deps";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";
import type { EventRow } from "../events/repo";
import { notificationsService } from "../notifications/service";

type StampRow = typeof passportStamps.$inferSelect;
type StampEvent = Pick<EventRow, "id" | "slug" | "title" | "format" | "startsAt" | "city" | "department">;

const passportLink = { label: "Voir mon passeport", path: "/app/passeport" };

/** Saison d'une date (année civile, heure de Paris), créée au besoin (comme les points). */
async function seasonIdFor(ex: Executor, date: Date): Promise<string> {
  const d = seasonDates(seasonYear(date));
  await ex.insert(seasons).values(d).onConflictDoNothing();
  const row = await ex.query.seasons.findFirst({ where: eq(seasons.startsOn, d.startsOn) });
  if (!row) throw new Error("Saison introuvable");
  return row.id;
}

async function stampEvent(ex: Executor, eventId: string): Promise<StampEvent | null> {
  const [row] = await ex
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      format: events.format,
      startsAt: events.startsAt,
      city: events.city,
      department: events.department,
    })
    .from(events)
    .where(eq(events.id, eventId));
  return row ?? null;
}

function serialize(row: StampRow, event: StampEvent): PassportStamp {
  return {
    id: row.id,
    kind: row.kind,
    shape: row.shape,
    ink: row.ink as StampInk,
    seed: row.seed,
    rare: row.rare,
    stampedAt: row.stampedAt.toISOString(),
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      format: event.format,
      startsAt: event.startsAt.toISOString(),
      city: event.city,
      department: event.department,
    },
  };
}

/**
 * Pose un tampon (dans la transaction de l'appelant) ; `null` s'il existe déjà. Forme, encre et aléa sont figés ici.
 * Notification `stamp_received` au Journal (ni push ni e-mail : le tampon tombe déjà à l'écran au scan).
 */
async function stamp(
  ex: Executor,
  userId: string,
  event: StampEvent,
  kind: StampKind,
  opts: { applicationId?: string | null; ticketId?: string | null; at?: Date } = {},
): Promise<PassportStamp | null> {
  const ink = stampInk(event.department);
  const [row] = await ex
    .insert(passportStamps)
    .values({
      userId,
      eventId: event.id,
      seasonId: await seasonIdFor(ex, event.startsAt),
      kind,
      shape: stampShape(event.format),
      ink,
      seed: stampSeed(userId, event.id, kind),
      rare: isRare(kind),
      applicationId: opts.applicationId ?? null,
      ticketId: opts.ticketId ?? null,
      stampedAt: opts.at ?? now(),
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return null;
  await notificationsService.notify(ex, userId, "stamp_received", {
    title: passportTexts.notificationTitle(kind),
    body: stampSentence({ kind, format: event.format, ink, department: event.department }),
    eventId: event.id,
    data: { eventId: event.id, stampId: row.id, kind, screen: "passport" },
    link: passportLink,
  });
  return serialize(row, event);
}

/** Jour J : du début de la journée (heure de l'événement) où il commence jusqu'à sa fin. */
function isEventDay(event: Pick<EventRow, "startsAt" | "endsAt" | "timezone">, t: Date): boolean {
  const dayStart = fromWallTime({ ...wallTime(event.startsAt, event.timezone), hour: 0, minute: 0 }, event.timezone);
  return t >= dayStart && t <= event.endsAt;
}

export const passportService = {
  stamp,

  /** Le tampon tombe à l'écran : canal `user:{id}`, événement `passport.stamped` (après validation). */
  publish(userId: string, s: PassportStamp) {
    realtime.publish(`user:${userId}`, "passport.stamped", s);
  },

  /**
   * Pointage d'une candidature (scan, liste, plaque, drive, express) : tampon de participation au titulaire d'une
   * candidature de véhicule. Renvoie le tampon posé, `null` s'il existait.
   */
  async stampCheckin(ex: Executor, input: { applicationId: string; eventId: string; at?: Date }) {
    const app = await ex.query.applications.findFirst({ where: eq(applications.id, input.applicationId) });
    if (app?.kind !== "vehicle") return null;
    const event = await stampEvent(ex, input.eventId);
    if (!event) return null;
    const s = await stamp(ex, app.userId, event, "participation", { applicationId: app.id, at: input.at });
    return s ? { userId: app.userId, stamp: s } : null;
  },

  /** Billet du public accepté à l'entrée : tampon de visite à son titulaire. */
  async stampVisit(ex: Executor, ticketId: string) {
    const ticket = await ex.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    if (!ticket) return null;
    const event = await stampEvent(ex, ticket.eventId);
    if (!event) return null;
    const s = await stamp(ex, ticket.userId, event, "visit", { ticketId: ticket.id });
    return s ? { userId: ticket.userId, stamp: s } : null;
  },

  /** « Je suis là » du staff : tampon le jour J seulement (avant, il viendra au règlement si la présence tient). */
  async stampStaffPresence(event: EventRow, userId: string) {
    if (!isEventDay(event, now())) return null;
    const s = await stamp(db, userId, event, "staff");
    if (s) {
      passportService.publish(userId, s);
      void notificationsService.kick();
    }
    return s;
  },

  /** Après un lot de pointages validé : publie les tampons de participation de ces candidatures. */
  async announce(eventId: string, applicationIds: readonly string[]) {
    if (!applicationIds.length) return;
    const event = await stampEvent(db, eventId);
    if (!event) return;
    const rows = await db.query.passportStamps.findMany({
      where: and(
        eq(passportStamps.eventId, eventId),
        eq(passportStamps.kind, "participation"),
        inArray(passportStamps.applicationId, [...applicationIds]),
      ),
    });
    for (const r of rows) passportService.publish(r.userId, serialize(r, event));
    if (rows.length) void notificationsService.kick();
  },

  /**
   * Règlement de J+2 (dans sa transaction) : rattrapage des tampons ordinaires (pointés, billets scannés, staff
   * présent), puis les rares. Rejoué, il ne pose rien de plus.
   */
  async onSettled(ex: Executor, event: EventRow, winner: { userId: string; applicationId: string } | null) {
    const entered = await ex
      .select({ applicationId: checkins.applicationId, userId: applications.userId, at: checkins.checkedInAt })
      .from(checkins)
      .innerJoin(applications, eq(applications.id, checkins.applicationId))
      .where(and(eq(checkins.eventId, event.id), eq(applications.kind, "vehicle")));
    for (const e of entered) await stamp(ex, e.userId, event, "participation", { applicationId: e.applicationId });
    const visitors = await ex
      .select({ id: tickets.id, userId: tickets.userId })
      .from(tickets)
      .where(and(eq(tickets.eventId, event.id), isNotNull(tickets.usedAt)));
    for (const t of visitors) await stamp(ex, t.userId, event, "visit", { ticketId: t.id });
    const staff = await ex
      .select({ userId: eventStaff.userId })
      .from(eventStaff)
      .where(and(eq(eventStaff.eventId, event.id), eq(eventStaff.presence, "present")));
    for (const m of staff) await stamp(ex, m.userId, event, "staff");

    // Rares : toutes les personnes qui ont un tampon ordinaire de cet événement.
    const holders = await ex
      .selectDistinct({ userId: passportStamps.userId })
      .from(passportStamps)
      .where(and(eq(passportStamps.eventId, event.id), inArray(passportStamps.kind, [...baseStampKinds])));
    const fullMoon = isFullMoon(event.startsAt);
    for (const { userId } of holders) {
      // Événements où la personne était, commencés avant celui-ci (toutes saisons).
      const [before] = await ex
        .select({ n: sql<number>`count(distinct ${passportStamps.eventId})::int` })
        .from(passportStamps)
        .innerJoin(events, eq(events.id, passportStamps.eventId))
        .where(
          and(
            eq(passportStamps.userId, userId),
            inArray(passportStamps.kind, [...baseStampKinds]),
            lt(events.startsAt, event.startsAt),
          ),
        );
      const earlier = before?.n ?? 0;
      if (earlier === 0) await stamp(ex, userId, event, "first_outing");
      if (earlier === 9) await stamp(ex, userId, event, "tenth_event");
      if (fullMoon) await stamp(ex, userId, event, "full_moon");
    }
    if (winner) await stamp(ex, winner.userId, event, "audience_prize", { applicationId: winner.applicationId });
  },

  /** Tampons d'une personne pour un événement (récap). */
  async ofEvent(userId: string, eventId: string): Promise<(PassportStamp & { sentence: string })[]> {
    const event = await stampEvent(db, eventId);
    if (!event) return [];
    const rows = await db.query.passportStamps.findMany({
      where: and(eq(passportStamps.userId, userId), eq(passportStamps.eventId, eventId)),
      orderBy: [asc(passportStamps.stampedAt)],
    });
    return rows.map((r) => ({
      ...serialize(r, event),
      sentence: stampSentence({
        kind: r.kind,
        format: event.format,
        ink: r.ink as StampInk,
        department: event.department,
      }),
    }));
  },

  /** `GET /me/passport?season=` : pages de 8 tampons, total, rares, saisons disponibles. */
  async mine(v: Viewer, seasonYearWanted?: number): Promise<PassportView> {
    const current = seasonYear(now());
    const year = seasonYearWanted ?? current;
    const perSeason = await db
      .select({ startsOn: seasons.startsOn, name: seasons.name, n: sql<number>`count(*)::int` })
      .from(passportStamps)
      .innerJoin(seasons, eq(seasons.id, passportStamps.seasonId))
      .where(eq(passportStamps.userId, v.user.id))
      .groupBy(seasons.startsOn, seasons.name)
      .orderBy(desc(seasons.startsOn));
    const list = perSeason.map((s) => ({ year: Number(s.startsOn.slice(0, 4)), name: s.name, total: s.n }));
    for (const y of [current, year]) {
      if (!list.some((s) => s.year === y)) list.push({ year: y, name: seasonDates(y).name, total: 0 });
    }
    list.sort((a, b) => b.year - a.year);
    const rows = await db
      .select({
        stamp: passportStamps,
        event: {
          id: events.id,
          slug: events.slug,
          title: events.title,
          format: events.format,
          startsAt: events.startsAt,
          city: events.city,
          department: events.department,
        },
      })
      .from(passportStamps)
      .innerJoin(events, eq(events.id, passportStamps.eventId))
      .innerJoin(seasons, eq(seasons.id, passportStamps.seasonId))
      .where(and(eq(passportStamps.userId, v.user.id), eq(seasons.startsOn, seasonDates(year).startsOn)))
      .orderBy(asc(passportStamps.stampedAt), asc(passportStamps.createdAt));
    const stamps = rows.map((r) => serialize(r.stamp, r.event));
    const season = list.find((s) => s.year === year) ?? { year, name: seasonDates(year).name, total: 0 };
    return {
      season,
      seasons: list,
      pages: passportPages(stamps).map((page) => ({ stamps: page })),
      total: stamps.length,
      rare: stamps.filter((s) => s.rare).length,
    };
  },
};
