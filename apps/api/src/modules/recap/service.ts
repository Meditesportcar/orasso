// Récap (lot 49, ARCHITECTURE-DA-V2 § 5.5, V8, prototype DA v2 `s-recap`) : calculé à la demande, jamais stocké.
// « Arrivée dimanche à 10 h, automatiquement » : la tâche `event.recap` (fin + 1 jour à 10 h, heure de l'événement)
// prévient les pointés et les billets scannés ; les points y sont projetés (participation, staff, prix du public),
// puis acquis après le règlement de J+2 : le même écran se met à jour.
import {
  addDays,
  fromWallTime,
  nextGrade,
  pointKindLabels,
  type RecapListItem,
  type RecapPointLine,
  type RecapView,
  recapTexts,
  reviewDeadline,
  reviewWindowOpen,
  wallTime,
} from "@orasso/shared";
import { and, desc, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  audiencePrizeResults,
  checkins,
  events,
  notifications,
  pointEntries,
  profiles,
  reviews,
  tickets,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { getPointsConfig, settingsStore } from "../../lib/settings";
import { withTx } from "../../lib/tx";
import { audiencePrizeService } from "../audience-prize/service";
import { type EventRow, eventsRepo } from "../events/repo";
import { notificationsService } from "../notifications/service";
import { isVerifiedStaff } from "../passport/presence";
import { passportService } from "../passport/service";

/** Le lendemain de la fin, à 10 h (heure de l'événement). */
export function recapReadyAt(event: Pick<EventRow, "endsAt" | "timezone">): Date {
  return fromWallTime({ ...addDays(wallTime(event.endsAt, event.timezone), 1), hour: 10, minute: 0 }, event.timezone);
}

const sameInstant = (a: Date, iso: unknown) =>
  typeof iso === "string" && Math.abs(a.getTime() - Date.parse(iso)) < 60_000;

/** Ma présence : entrée d'un de mes véhicules, billet scanné, présence au staff. */
async function presenceOf(eventId: string, userId: string) {
  const [entry] = await db
    .select({ applicationId: checkins.applicationId, at: checkins.checkedInAt })
    .from(checkins)
    .innerJoin(applications, eq(applications.id, checkins.applicationId))
    .where(and(eq(checkins.eventId, eventId), eq(applications.userId, userId), eq(applications.kind, "vehicle")))
    .orderBy(checkins.checkedInAt)
    .limit(1);
  const [ticket] = await db
    .select({ at: tickets.usedAt })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), eq(tickets.userId, userId), isNotNull(tickets.usedAt)))
    .orderBy(tickets.usedAt)
    .limit(1);
  // Staff présent vérifiable (trace du jour J), relecture du lot 49.
  const staffPresent = await isVerifiedStaff(db, eventId, userId);
  return { entry: entry ?? null, ticketAt: ticket?.at ?? null, staffPresent };
}

/** Personnes à prévenir : pointées (véhicule) et billets scannés. */
async function recipients(eventId: string): Promise<string[]> {
  const entered = await db
    .selectDistinct({ userId: applications.userId })
    .from(checkins)
    .innerJoin(applications, eq(applications.id, checkins.applicationId))
    .where(and(eq(checkins.eventId, eventId), eq(applications.kind, "vehicle")));
  const visitors = await db
    .selectDistinct({ userId: tickets.userId })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), isNotNull(tickets.usedAt)));
  return [...new Set([...entered, ...visitors].map((r) => r.userId))];
}

export const recapService = {
  recapReadyAt,

  /** `GET /me/recaps/:eventId` ; 404 si la personne n'a été ni pointée ni contrôlée avec un billet. */
  async get(v: Viewer, eventId: string): Promise<RecapView> {
    const event = await eventsRepo.byId(eventId).catch(() => null);
    const t = now();
    if (event?.status !== "published" || t < event.endsAt) throw notFound("Récap introuvable");
    const me = await presenceOf(eventId, v.user.id);
    if (!me.entry && !me.ticketAt) throw notFound("Récap introuvable");

    const arrival = [me.entry?.at, me.ticketAt].filter((d): d is Date => Boolean(d)).sort((a, b) => +a - +b)[0] ?? null;
    const span = event.endsAt.getTime() - event.startsAt.getTime();
    const myDuration = arrival
      ? Math.round(Math.min(Math.max(event.endsAt.getTime() - arrival.getTime(), 0), span) / 60_000)
      : null;

    const prize = await audiencePrizeService.rankOf(eventId, v.user.id);
    const settledWinner = event.settledAt
      ? ((
          await db.query.audiencePrizeResults.findFirst({
            where: and(eq(audiencePrizeResults.eventId, eventId), eq(audiencePrizeResults.winner, true)),
          })
        )?.applicationId ?? null)
      : null;
    const audienceRank =
      prize.best && prize.total > 0
        ? {
            rank: prize.best.rank,
            of: prize.of,
            votes: prize.best.votes,
            winner: event.settledAt ? settledWinner === prize.best.applicationId : Boolean(prize.projectedWinner),
          }
        : null;

    // Points : acquis (lignes écrites au règlement) ou projetés (ce que le règlement écrira).
    const cfg = await getPointsConfig();
    let detail: RecapPointLine[];
    const status = event.settledAt ? "settled" : "projected";
    if (event.settledAt) {
      const rows = await db
        .select({ kind: pointEntries.kind, points: pointEntries.points })
        .from(pointEntries)
        .where(and(eq(pointEntries.userId, v.user.id), eq(pointEntries.eventId, eventId)));
      detail = rows.map((r) => ({ kind: r.kind, points: r.points, label: pointKindLabels[r.kind] }));
    } else {
      detail = [];
      if (me.entry && cfg.participation) {
        detail.push({ kind: "participation", points: cfg.participation, label: pointKindLabels.participation });
      }
      if (me.staffPresent && cfg.staff) detail.push({ kind: "staff", points: cfg.staff, label: pointKindLabels.staff });
      const prizePoints = await settingsStore.get("points.audience_prize");
      if (prize.projectedWinner && prizePoints > 0) {
        detail.push({ kind: "audience_prize", points: prizePoints, label: pointKindLabels.audience_prize });
      }
    }
    const total = detail.reduce((n, d) => n + d.points, 0);
    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, v.user.id) });
    const after = (profile?.pointsSeason ?? 0) + (status === "projected" ? total : 0);
    const next = nextGrade(after, cfg.thresholds);

    const stamps = await passportService.ofEvent(v.user.id, eventId);
    const stamp = [...stamps].reverse().find((s) => s.rare) ?? stamps[0] ?? null;

    let reviewApplicationId: string | null = null;
    if (me.entry && reviewWindowOpen(event, t)) {
      const done = await db.query.reviews.findFirst({
        where: and(eq(reviews.eventId, eventId), eq(reviews.userId, v.user.id)),
      });
      if (!done) reviewApplicationId = me.entry.applicationId;
    }
    const vehiclesCount = prize.of;
    return {
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        format: event.format,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        city: event.city,
        department: event.department,
      },
      vehiclesCount,
      myArrival: arrival?.toISOString() ?? null,
      myDuration,
      audienceRank,
      points: { status, total, detail },
      nextGradeIn: next ? { grade: next.grade, points: next.threshold - after } : null,
      stamp,
      reviewDeadline: reviewDeadline(event).toISOString(),
      reviewApplicationId,
      shareText: recapTexts.shareText(
        event.title,
        vehiclesCount,
        audienceRank ? { rank: audienceRank.rank, of: audienceRank.of } : null,
      ),
      photos: [],
    };
  },

  /** `GET /me/recaps` : les 12 derniers événements finis où la personne a été pointée ou contrôlée. */
  async list(v: Viewer): Promise<RecapListItem[]> {
    const t = now();
    const entered = db
      .select({ id: checkins.eventId })
      .from(checkins)
      .innerJoin(applications, eq(applications.id, checkins.applicationId))
      .where(and(eq(applications.userId, v.user.id), eq(applications.kind, "vehicle")));
    const visited = db
      .select({ id: tickets.eventId })
      .from(tickets)
      .where(and(eq(tickets.userId, v.user.id), isNotNull(tickets.usedAt)));
    const rows = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.status, "published"),
          lte(events.endsAt, t),
          or(inArray(events.id, entered), inArray(events.id, visited)),
        ),
      )
      .orderBy(desc(events.endsAt))
      .limit(12);
    return rows.map((e) => ({
      eventId: e.id,
      slug: e.slug,
      title: e.title,
      format: e.format,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      readyAt: recapReadyAt(e).toISOString(),
    }));
  },

  /**
   * Tâche `event.recap` (fin + 1 jour à 10 h) : « Ton récap de <titre> est arrivé » aux pointés et aux billets
   * scannés. L'instant prévu est revérifié (dates changées → une autre tâche a été planifiée) ; rejouée, la tâche ne
   * prévient personne deux fois.
   */
  async notifyReady(data: { eventId: string; at: string }): Promise<number> {
    const e = await eventsRepo.byId(data.eventId).catch(() => null);
    if (e?.status !== "published" || !sameInstant(recapReadyAt(e), data.at)) return 0;
    const users = await recipients(e.id);
    if (!users.length) return 0;
    return withTx(async (tx, after) => {
      // Verrou consultatif par événement : deux exécutions simultanées (deux workers) n'envoient jamais deux fois.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`recap:${e.id}`}))`);
      const sent = await tx
        .select({ userId: notifications.userId })
        .from(notifications)
        .where(
          and(
            eq(notifications.type, "event_recap_ready"),
            eq(notifications.eventId, e.id),
            inArray(notifications.userId, users),
          ),
        );
      const done = new Set(sent.map((s) => s.userId));
      const todo = users.filter((u) => !done.has(u));
      await notificationsService.notifyMany(tx, todo, "event_recap_ready", {
        title: recapTexts.readyTitle(e.title),
        body: recapTexts.readyBody,
        eventId: e.id,
        data: { eventId: e.id, screen: "recap" },
        link: { label: "Voir mon récap", path: `/app/recap/${e.id}` },
      });
      after(() => notificationsService.kick());
      return todo.length;
    });
  },
};
