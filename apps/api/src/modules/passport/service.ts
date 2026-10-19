// Passeport et tampons (lot 49, ARCHITECTURE-DA-V2 § 5.5, prototype DA v2 `s-passport`) : un tampon par événement
// pointé (participation), par billet scanné (visite), par présence du staff le jour J ; les rares (première sortie,
// 10e événement, nuit de pleine lune, prix du public) au règlement de J+2, qui rattrape aussi les tampons manqués.
// Idempotent : un seul tampon par personne, événement et genre (contrainte unique).
import {
  baseStampKinds,
  inStaffPresenceWindow,
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
} from "@orasso/shared";
import { and, asc, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, checkins, events, passportStamps, seasons, tickets } from "../../db/schema";
import { now } from "../../lib/deps";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import type { Executor, Tx } from "../../lib/tx";
import type { EventRow } from "../events/repo";
import { notificationsService } from "../notifications/service";
import { participationsBefore, verifiedStaffIds } from "./presence";

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

/**
 * Le tampon ne fait jamais échouer un pointage, un contrôle de billet ni le règlement (relecture) : il est posé dans
 * un point de reprise ; une erreur est journalisée et le règlement de J+2 rattrape.
 */
async function safely<T>(ex: Executor, what: string, fn: (sp: Executor) => Promise<T>): Promise<T | null> {
  try {
    return await (ex as Tx).transaction((sp) => fn(sp));
  } catch (error) {
    console.error(`Tampon du passeport non posé (${what}, rattrapé au règlement) :`, error);
    return null;
  }
}

/** Tampons de participation tout juste posés, en attente de publication après validation (`announce`). */
const freshCheckinStamps = new Map<string, { userId: string; stamp: PassportStamp }>();
const FRESH_MAX = 5_000;

/** Rares d'une personne pour un événement : première sortie, 10e événement, pleine lune (historique réel). */
async function evaluateRares(ex: Executor, event: StampEvent, userId: string) {
  const earlier = await participationsBefore(ex, userId, event.startsAt);
  if (earlier === 0) await stamp(ex, userId, event, "first_outing");
  if (earlier === 9) await stamp(ex, userId, event, "tenth_event");
  if (isFullMoon(event.startsAt)) await stamp(ex, userId, event, "full_moon");
}

export const passportService = {
  stamp,
  safely,

  /** Le tampon tombe à l'écran : canal `user:{id}`, événement `passport.stamped` (après validation). */
  publish(userId: string, s: PassportStamp) {
    realtime.publish(`user:${userId}`, "passport.stamped", s);
  },

  /**
   * Pointage d'une candidature (scan, liste, plaque, drive, express) : tampon de participation au titulaire d'une
   * candidature de véhicule, à l'heure de l'entrée. Renvoie le tampon posé, `null` s'il existait (ou en cas d'erreur,
   * journalisée sans faire échouer le pointage). `announce` : publié par `announce` après validation.
   */
  async stampCheckin(ex: Executor, input: { applicationId: string; eventId: string; at?: Date; announce?: boolean }) {
    const done = await safely(ex, "pointage", async (sp) => {
      const app = await sp.query.applications.findFirst({ where: eq(applications.id, input.applicationId) });
      if (app?.kind !== "vehicle") return null;
      const event = await stampEvent(sp, input.eventId);
      if (!event) return null;
      const s = await stamp(sp, app.userId, event, "participation", { applicationId: app.id, at: input.at });
      return s ? { userId: app.userId, stamp: s } : null;
    });
    if (done && input.announce) {
      if (freshCheckinStamps.size >= FRESH_MAX) freshCheckinStamps.clear();
      freshCheckinStamps.set(input.applicationId, done);
    }
    return done;
  },

  /** Billet du public accepté à l'entrée : tampon de visite à son titulaire. */
  async stampVisit(ex: Executor, ticketId: string) {
    return safely(ex, "billet", async (sp) => {
      const ticket = await sp.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
      if (!ticket) return null;
      const event = await stampEvent(sp, ticket.eventId);
      if (!event) return null;
      const s = await stamp(sp, ticket.userId, event, "visit", { ticketId: ticket.id });
      return s ? { userId: ticket.userId, stamp: s } : null;
    });
  },

  /**
   * Présence du staff (« Je suis là / pas là », ou corrigée par l'organisateur) : tampon si « là » est posé dans la
   * fenêtre du jour J (3 h avant le début jusqu'à la fin) ; « pas là » retire le tampon staff.
   */
  async onStaffPresence(event: EventRow, userId: string, present: boolean) {
    if (!present) {
      await db
        .delete(passportStamps)
        .where(
          and(
            eq(passportStamps.eventId, event.id),
            eq(passportStamps.userId, userId),
            eq(passportStamps.kind, "staff"),
          ),
        );
      return null;
    }
    if (!inStaffPresenceWindow(event, now())) return null;
    const s = await safely(db, "staff", (sp) => stamp(sp, userId, event, "staff"));
    if (s) {
      passportService.publish(userId, s);
      void notificationsService.kick();
    }
    return s;
  },

  /** Après un lot de pointages validé : publie les tampons de participation **tout juste posés** de ces candidatures. */
  async announce(eventId: string, applicationIds: readonly string[]) {
    const fresh = applicationIds.flatMap((id) => {
      const f = freshCheckinStamps.get(id);
      freshCheckinStamps.delete(id);
      return f ? [f] : [];
    });
    if (!fresh.length) return;
    // Seulement ceux qui existent après validation (une transaction annulée n'a rien posé).
    const kept = new Set(
      (
        await db
          .select({ id: passportStamps.id })
          .from(passportStamps)
          .where(
            and(
              eq(passportStamps.eventId, eventId),
              inArray(
                passportStamps.id,
                fresh.map((f) => f.stamp.id),
              ),
            ),
          )
      ).map((r) => r.id),
    );
    for (const f of fresh) if (kept.has(f.stamp.id)) passportService.publish(f.userId, f.stamp);
    void notificationsService.kick();
  },

  /**
   * Règlement de J+2 (dans sa transaction ; l'appelant le met dans un point de reprise) : rattrapage des tampons
   * ordinaires (pointés, billets contrôlés, staff présent vérifiable ; un tampon staff sans trace du jour J est
   * retiré), puis les rares, calculés sur la participation réelle. Rejoué, il ne pose rien de plus.
   */
  async onSettled(ex: Executor, event: EventRow, winner: { userId: string; applicationId: string } | null) {
    const entered = await ex
      .select({ applicationId: checkins.applicationId, userId: applications.userId, at: checkins.checkedInAt })
      .from(checkins)
      .innerJoin(applications, eq(applications.id, checkins.applicationId))
      .where(and(eq(checkins.eventId, event.id), eq(applications.kind, "vehicle")));
    for (const e of entered) {
      await stamp(ex, e.userId, event, "participation", { applicationId: e.applicationId, at: e.at });
    }
    const visitors = await ex
      .select({ id: tickets.id, userId: tickets.userId, at: tickets.usedAt })
      .from(tickets)
      .where(and(eq(tickets.eventId, event.id), isNotNull(tickets.usedAt)));
    for (const t of visitors) await stamp(ex, t.userId, event, "visit", { ticketId: t.id, at: t.at ?? undefined });
    const staff = await verifiedStaffIds(ex, event.id);
    await ex
      .delete(passportStamps)
      .where(
        and(
          eq(passportStamps.eventId, event.id),
          eq(passportStamps.kind, "staff"),
          staff.size ? notInArray(passportStamps.userId, [...staff]) : undefined,
        ),
      );
    for (const userId of staff) await stamp(ex, userId, event, "staff");

    // Rares : toutes les personnes qui ont un tampon ordinaire de cet événement.
    const holders = await ex
      .selectDistinct({ userId: passportStamps.userId })
      .from(passportStamps)
      .where(and(eq(passportStamps.eventId, event.id), inArray(passportStamps.kind, [...baseStampKinds])));
    for (const { userId } of holders) await evaluateRares(ex, event, userId);
    if (winner) await stamp(ex, winner.userId, event, "audience_prize", { applicationId: winner.applicationId });
  },

  /** Entrée reconnue après le règlement (contestation acceptée) : tampon de participation et rares de l'événement. */
  async lateEntry(ex: Executor, input: { applicationId: string; eventId: string; at: Date }) {
    await passportService.stampCheckin(ex, input);
    await safely(ex, "contestation", async (sp) => {
      const app = await sp.query.applications.findFirst({ where: eq(applications.id, input.applicationId) });
      const event = await stampEvent(sp, input.eventId);
      if (app?.kind === "vehicle" && event) await evaluateRares(sp, event, app.userId);
    });
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
