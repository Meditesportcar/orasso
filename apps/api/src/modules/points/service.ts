// Points, malus, contestations, grades, saisons (ARCHITECTURE.md § 2.6, docs/01 « Points et grades » et « après
// l'événement »). Barème et seuils provisoires (A6) : `POINTS` et `GRADE_THRESHOLDS` de `@orasso/shared`.
import {
  CONTEST_RESPONSE_MS,
  canContest,
  carryoverPoints,
  contestDeadline,
  contestEscalatesAt,
  type Grade,
  gradeFor,
  gradeLabels,
  type MalusContestView,
  type MyPoints,
  nextGrade,
  POINTS,
  type PointKind,
  pointKindLabels,
  REFERRAL_SEASON_CAP,
  SETTLE_DELAY_MS,
  seasonDates,
  seasonYear,
  settleAt,
  settlementKind,
} from "@orasso/shared";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  adminAuditLog,
  applications,
  checkins,
  events,
  malusContests,
  pointEntries,
  profiles,
  seasons,
} from "../../db/schema";
import { requireOrganizer, requirePlatformRole } from "../../lib/access";
import { deps, now } from "../../lib/deps";
import { AppError, conflict, notFound } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { lockEventCheckins } from "../../lib/locks";
import type { Viewer } from "../../lib/session";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { reportService } from "../after-event/report";
import { eventsRepo } from "../events/repo";
import { notificationsService } from "../notifications/service";
import { staffService } from "../staff/service";

type SeasonRow = typeof seasons.$inferSelect;
type EntryRow = typeof pointEntries.$inferSelect;
type ContestRow = typeof malusContests.$inferSelect;

const pointsLink = { label: "Voir mes points", path: "/app/moi" };
/** Le balayage ne rattrape que les règlements manqués depuis moins de 14 jours. */
const SWEEP_HORIZON_MS = 14 * 86_400_000;

/** Saison d'une date (année civile, heure de Paris), créée au besoin. */
async function seasonFor(ex: Executor, date: Date): Promise<SeasonRow> {
  const d = seasonDates(seasonYear(date));
  await ex.insert(seasons).values(d).onConflictDoNothing();
  const row = await ex.query.seasons.findFirst({ where: eq(seasons.startsOn, d.startsOn) });
  if (!row) throw new Error("Saison introuvable");
  return row;
}

/** Écrit une ligne de points ; `null` si elle existe déjà (index uniques d'idempotence). */
async function award(
  tx: Tx,
  season: SeasonRow,
  entry: {
    userId: string;
    kind: PointKind;
    points: number;
    eventId?: string | null;
    applicationId?: string | null;
    createdBy?: string | null;
    note?: string | null;
    subjectUserId?: string | null;
  },
): Promise<EntryRow | null> {
  const [row] = await tx
    .insert(pointEntries)
    .values({ ...entry, seasonId: season.id, createdAt: now() })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/**
 * Un seul compteur (docs/01) : `points_season` = somme de la saison courante, grade recalculé ; notification si le
 * grade change.
 */
async function recompute(tx: Tx, userId: string): Promise<{ points: number; grade: Grade }> {
  const season = await seasonFor(tx, now());
  const [sum] = await tx
    .select({ total: sql<number>`coalesce(sum(${pointEntries.points}), 0)::int` })
    .from(pointEntries)
    .where(and(eq(pointEntries.userId, userId), eq(pointEntries.seasonId, season.id)));
  const points = sum?.total ?? 0;
  const grade = gradeFor(points);
  const [before] = await tx.select({ grade: profiles.grade }).from(profiles).where(eq(profiles.userId, userId));
  await tx.update(profiles).set({ pointsSeason: points, grade }).where(eq(profiles.userId, userId));
  if (before && before.grade !== grade) {
    await notificationsService.notify(tx, userId, "grade_changed", {
      title: `Grade ${gradeLabels[grade]}`,
      body: `Tu passes ${gradeLabels[grade]} (${points} points cette saison).`,
      link: pointsLink,
    });
  }
  return { points, grade };
}

async function contestView(rows: ContestRow[]): Promise<MalusContestView[]> {
  if (!rows.length) return [];
  const people = await db
    .select({ userId: profiles.userId, pseudo: profiles.pseudo })
    .from(profiles)
    .where(inArray(profiles.userId, [...new Set(rows.map((r) => r.userId))]));
  const pseudo = new Map(people.map((p) => [p.userId, p.pseudo]));
  const evs = await db.query.events.findMany({ where: inArray(events.id, [...new Set(rows.map((r) => r.eventId))]) });
  const title = new Map(evs.map((e) => [e.id, e.title]));
  const appIds = rows.flatMap((r) => (r.applicationId ? [r.applicationId] : []));
  const entered = new Set(
    appIds.length
      ? (await db.query.checkins.findMany({ where: inArray(checkins.applicationId, appIds) })).map(
          (c) => c.applicationId,
        )
      : [],
  );
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
    escalatesAt: contestEscalatesAt(r.createdAt).toISOString(),
    escalatedAt: r.escalatedAt?.toISOString() ?? null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    organizerNote: r.organizerNote,
    user: { userId: r.userId, pseudo: pseudo.get(r.userId) ?? "" },
    event: { id: r.eventId, title: title.get(r.eventId) ?? "" },
    applicationId: r.applicationId,
    checkedIn: r.applicationId ? entered.has(r.applicationId) : false,
  }));
}

/** Décision sur une contestation (organisateur, ou administration après escalade). */
async function decideContest(
  actor: Viewer,
  contestId: string,
  input: { decision: "accept" | "reject"; note: string | null; checkin: boolean },
  allowed: ContestRow["status"][],
) {
  return withTx(async (tx, after) => {
    const [contest] = await tx.select().from(malusContests).where(eq(malusContests.id, contestId)).for("update");
    if (!contest) throw notFound("Contestation introuvable");
    if (!allowed.includes(contest.status)) {
      throw conflict(
        "conflict",
        contest.status === "escalated" ? "Contestation transmise à l'administration" : "Contestation déjà tranchée",
      );
    }
    const t = now();
    const event = await eventsRepo.byId(contest.eventId, tx);
    const accepted = input.decision === "accept";
    if (accepted && contest.applicationId) {
      await award(tx, await seasonFor(tx, t), {
        userId: contest.userId,
        kind: "malus_reversal",
        points: -POINTS.malus,
        eventId: contest.eventId,
        applicationId: contest.applicationId,
        createdBy: actor.user.id,
        note: input.note,
      });
      if (input.checkin) {
        const app = await tx.query.applications.findFirst({ where: eq(applications.id, contest.applicationId) });
        if (app?.status === "accepted") {
          await tx
            .insert(checkins)
            .values({
              applicationId: app.id,
              eventId: app.eventId,
              method: "manual",
              checkedInAt: event.startsAt,
              staffUserId: actor.user.id,
              zoneId: app.zoneId,
              note: `Contestation acceptée${input.note ? ` : ${input.note}` : ""}`,
            })
            .onConflictDoNothing();
        }
      }
    }
    const [row] = await tx
      .update(malusContests)
      .set({
        status: accepted ? "accepted" : "rejected",
        decidedBy: actor.user.id,
        decidedAt: t,
        organizerNote: input.note,
      })
      .where(eq(malusContests.id, contestId))
      .returning();
    await notificationsService.notify(tx, contest.userId, "contest_decided", {
      title: accepted ? "Malus annulé" : "Contestation refusée",
      body: accepted
        ? `Ta contestation pour « ${event.title} » est acceptée : le malus est annulé.`
        : `Ta contestation pour « ${event.title} » est refusée.${input.note ? `\n${input.note}` : ""}`,
      eventId: event.id,
      data: { eventId: event.id, applicationId: contest.applicationId ?? undefined },
      link: pointsLink,
    });
    await recompute(tx, contest.userId);
    after(() => notificationsService.kick());
    return row;
  });
}

export const pointsService = {
  seasonFor,
  recompute,

  /**
   * Tâche `event.settle` (fin + 48 h) : participation des retenus scannés ou pointés, malus des retenus absents et
   * des désistements après verrouillage, points du staff présent. Idempotente (index uniques + `settled_at`).
   */
  async settleEvent(eventId: string): Promise<boolean> {
    return withTx(async (tx, after) => {
      const t = now();
      // Même verrou que les pointages, pris AVANT la ligne de l'événement : un lot de pointage qui tient ce verrou
      // insère des entrées dont la clé étrangère verrouille l'événement en partage ; l'ordre inverse s'interbloque.
      await lockEventCheckins(tx, eventId);
      const event = await eventsRepo.lockForUpdate(tx, eventId);
      if (event.status !== "published" || event.settledAt) return false;
      const at = settleAt(event);
      if (t < at) {
        // Partie en avance ou date modifiée : on replanifie à l'échéance.
        after(() => deps.jobs.send("event.settle", { eventId, at: at.toISOString() }, at));
        return false;
      }
      const season = await seasonFor(tx, t);
      const rows = await tx
        .select({ app: applications, checkinId: checkins.id })
        .from(applications)
        .leftJoin(checkins, eq(checkins.applicationId, applications.id))
        .where(and(eq(applications.eventId, eventId), eq(applications.kind, "vehicle")));
      const users = new Set<string>();
      const deadline = formatDateTime(contestDeadline(t));
      for (const { app, checkinId } of rows) {
        const kind = settlementKind({
          status: app.status,
          withdrawnAfterLock: app.withdrawnAfterLock,
          checkedIn: Boolean(checkinId),
        });
        if (!kind) continue;
        const entry = await award(tx, season, {
          userId: app.userId,
          kind,
          points: POINTS[kind],
          eventId,
          applicationId: app.id,
        });
        if (!entry) continue;
        users.add(app.userId);
        await notificationsService.notify(
          tx,
          app.userId,
          kind === "participation" ? "points_awarded" : "malus_applied",
          kind === "participation"
            ? {
                title: `+${POINTS.participation} points`,
                body: `${pointKindLabels.participation} : « ${event.title} ».`,
                eventId,
                data: { eventId, applicationId: app.id },
                link: pointsLink,
              }
            : {
                title: `${POINTS.malus} points`,
                body: `${pointKindLabels.malus} : « ${event.title} ». Contestable jusqu'au ${deadline}.`,
                eventId,
                data: { eventId, applicationId: app.id, screen: "contest" },
                link: pointsLink,
              },
        );
      }
      for (const m of await staffService.members(event, tx)) {
        if (m.presence !== "present") continue;
        const entry = await award(tx, season, { userId: m.userId, kind: "staff", points: POINTS.staff, eventId });
        if (!entry) continue;
        users.add(m.userId);
        await notificationsService.notify(tx, m.userId, "points_awarded", {
          title: `+${POINTS.staff} points`,
          body: `${pointKindLabels.staff} : « ${event.title} ».`,
          eventId,
          data: { eventId },
          link: pointsLink,
        });
      }
      await tx.update(events).set({ settledAt: t }).where(eq(events.id, eventId));
      for (const userId of users) await recompute(tx, userId);
      // Lot 27 : bilan de l'événement, calculé sur les points qui viennent d'être écrits (même transaction).
      await reportService.onSettled(tx, event, after);
      after(() => notificationsService.kick());
      return true;
    });
  },

  /** `POST /applications/:id/malus-contest` : 7 jours après le malus, une seule fois. */
  async contest(v: Viewer, applicationId: string, message: string): Promise<MalusContestView> {
    const app = await db.query.applications.findFirst({ where: eq(applications.id, applicationId) });
    if (!app || app.userId !== v.user.id) throw notFound("Candidature introuvable");
    const malus = await db.query.pointEntries.findFirst({
      where: and(eq(pointEntries.applicationId, applicationId), eq(pointEntries.kind, "malus")),
    });
    if (!malus) throw notFound("Pas de malus sur cette candidature");
    const t = now();
    if (!canContest(malus.createdAt, t)) {
      throw new AppError(423, "locked", "Délai de contestation dépassé", {
        deadline: contestDeadline(malus.createdAt).toISOString(),
      });
    }
    const [row] = await db
      .insert(malusContests)
      .values({ pointEntryId: malus.id, userId: v.user.id, eventId: app.eventId, applicationId, message, createdAt: t })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict("conflict", "Malus déjà contesté");
    const at = contestEscalatesAt(row.createdAt);
    await deps.jobs.send("contest.escalate", { contestId: row.id, at: at.toISOString() }, at);
    const [view] = await contestView([row]);
    if (!view) throw new Error("Contestation introuvable");
    return view;
  },

  /** Organisateur : contestations de l'événement. */
  async listForEvent(v: Viewer, eventId: string): Promise<MalusContestView[]> {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    return contestView(
      await db.query.malusContests.findMany({
        where: eq(malusContests.eventId, eventId),
        orderBy: [asc(malusContests.createdAt)],
      }),
    );
  },

  /** Organisateur (propriétaire ou co-organisateur) : tant que la contestation n'est pas transmise. */
  async decide(
    v: Viewer,
    contestId: string,
    input: { decision: "accept" | "reject"; note: string | null; checkin: boolean },
  ) {
    const contest = await db.query.malusContests.findFirst({ where: eq(malusContests.id, contestId) });
    if (!contest) throw notFound("Contestation introuvable");
    const event = await eventsRepo.byId(contest.eventId);
    await requireOrganizer(v, event.structureId);
    await decideContest(v, contestId, input, ["pending"]);
    const [view] = await contestView(await db.query.malusContests.findMany({ where: eq(malusContests.id, contestId) }));
    return view;
  },

  /** Administration : contestations transmises (ou en attente), tranchées avec les mêmes effets. */
  async adminList(v: Viewer, status: ContestRow["status"] = "escalated") {
    await requirePlatformRole(v, "super_admin");
    return contestView(
      await db.query.malusContests.findMany({
        where: eq(malusContests.status, status),
        orderBy: [asc(malusContests.createdAt)],
      }),
    );
  },

  async adminDecide(
    v: Viewer,
    contestId: string,
    input: { decision: "accept" | "reject"; note: string | null; checkin: boolean },
  ) {
    await requirePlatformRole(v, "super_admin");
    await decideContest(v, contestId, input, ["pending", "escalated"]);
    await db.insert(adminAuditLog).values({
      actorUserId: v.user.id,
      action: "contest.decide",
      targetType: "malus_contest",
      targetId: contestId,
      reason: input.note,
    });
    const [view] = await contestView(await db.query.malusContests.findMany({ where: eq(malusContests.id, contestId) }));
    return view;
  },

  /** Tâche `contest.escalate` : sans décision 7 jours après le dépôt, l'administration tranche. */
  async escalateContest(contestId: string): Promise<boolean> {
    return withTx(async (tx, after) => {
      const [contest] = await tx.select().from(malusContests).where(eq(malusContests.id, contestId)).for("update");
      if (contest?.status !== "pending") return false;
      const at = contestEscalatesAt(contest.createdAt);
      if (now() < at) {
        after(() => deps.jobs.send("contest.escalate", { contestId, at: at.toISOString() }, at));
        return false;
      }
      await tx
        .update(malusContests)
        .set({ status: "escalated", escalatedAt: now() })
        .where(eq(malusContests.id, contestId));
      return true;
    });
  },

  /**
   * Tâche `points.sweep` (chaque heure) : règlements de J+2 et escalades manqués, et report de fin de saison si la
   * tâche du 1er janvier n'est pas passée (API arrêtée à minuit…) ; le report est idempotent (`opened_at`).
   */
  async sweep() {
    return {
      settled: await this.settleDue(),
      escalated: await this.escalateDue(),
      rolledOver: await this.rolloverSeason(),
    };
  },

  /** Balayage de secours (avec la tâche quotidienne) : contestations échues non transmises. */
  async escalateDue(): Promise<number> {
    const due = await db
      .select({ id: malusContests.id })
      .from(malusContests)
      .where(
        and(
          eq(malusContests.status, "pending"),
          lte(malusContests.createdAt, new Date(now().getTime() - CONTEST_RESPONSE_MS)),
        ),
      );
    let n = 0;
    for (const d of due) if (await this.escalateContest(d.id)) n++;
    return n;
  },

  /**
   * Balayage de secours : événements terminés depuis 48 h et pas encore réglés, mais seulement s'ils ont fini depuis
   * moins de 14 jours (une tâche manquée se rattrape ; un vieil événement jamais suivi n'est pas réglé d'office :
   * ses retenus prendraient tous un malus faute de pointage). La migration 0014 marque réglés ceux d'avant le lot 06.
   */
  async settleDue(): Promise<number> {
    const t = now().getTime();
    const due = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.status, "published"),
          isNull(events.settledAt),
          lte(events.endsAt, new Date(t - SETTLE_DELAY_MS)),
          gte(events.endsAt, new Date(t - SETTLE_DELAY_MS - SWEEP_HORIZON_MS)),
        ),
      );
    let n = 0;
    for (const d of due) if (await this.settleEvent(d.id)) n++;
    return n;
  },

  /**
   * Tâche `season.rollover` (1er janvier 00:10, Paris) : « on descend d'un grade et on continue ». Le report est
   * calculé sur la somme de la saison précédente, une seule fois (`seasons.opened_at`).
   */
  async rolloverSeason(): Promise<boolean> {
    return withTx(async (tx, after) => {
      const t = now();
      const season = await seasonFor(tx, t);
      const [locked] = await tx.select().from(seasons).where(eq(seasons.id, season.id)).for("update");
      if (!locked || locked.openedAt) return false;
      const prevDates = seasonDates(seasonYear(t) - 1);
      const prev = await tx.query.seasons.findFirst({ where: eq(seasons.startsOn, prevDates.startsOn) });
      const totals = prev
        ? await tx
            .select({ userId: pointEntries.userId, total: sql<number>`sum(${pointEntries.points})::int` })
            .from(pointEntries)
            .where(eq(pointEntries.seasonId, prev.id))
            .groupBy(pointEntries.userId)
        : [];
      for (const { userId, total } of totals) {
        const carry = carryoverPoints(total);
        if (carry > 0) await award(tx, locked, { userId, kind: "season_carryover", points: carry });
      }
      await tx.update(seasons).set({ openedAt: t }).where(eq(seasons.id, locked.id));
      // Tous les comptes dont le compteur n'est pas nul, ou qui avaient des points : recalcul sur la nouvelle saison.
      const toRecompute = await tx
        .selectDistinct({ userId: profiles.userId })
        .from(profiles)
        .where(sql`${profiles.pointsSeason} <> 0 or ${profiles.userId} in (select user_id from point_entries)`);
      for (const { userId } of toRecompute) await recompute(tx, userId);
      for (const { userId, total } of totals) {
        await notificationsService.notify(tx, userId, "season_ended", {
          title: `${locked.name}`,
          body: `Nouvelle saison : tu repars de ${carryoverPoints(total)} points (${gradeLabels[gradeFor(carryoverPoints(total))]}).`,
          link: pointsLink,
        });
      }
      after(() => notificationsService.kick());
      return true;
    });
  },

  /** `GET /me/points` : solde, grade, prochain seuil, lignes de la saison, contestations, « pointage en attente ». */
  async mine(v: Viewer): Promise<MyPoints> {
    const t = now();
    const season = await seasonFor(db, t);
    const rows = await db
      .select({ e: pointEntries, title: events.title })
      .from(pointEntries)
      .leftJoin(events, eq(events.id, pointEntries.eventId))
      .where(and(eq(pointEntries.userId, v.user.id), eq(pointEntries.seasonId, season.id)))
      .orderBy(desc(pointEntries.createdAt));
    const contests = await db.query.malusContests.findMany({ where: eq(malusContests.userId, v.user.id) });
    const contestOf = new Map(contests.map((c) => [c.pointEntryId, c]));
    const reversed = new Set(rows.filter((r) => r.e.kind === "malus_reversal").map((r) => r.e.applicationId));
    const pending = await db
      .selectDistinct({ id: events.id, title: events.title, endsAt: events.endsAt })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .where(
        and(
          eq(applications.userId, v.user.id),
          eq(applications.kind, "vehicle"),
          eq(applications.status, "accepted"),
          eq(events.status, "published"),
          isNull(events.settledAt),
          lte(events.endsAt, t),
          gte(events.endsAt, new Date(t.getTime() - 30 * 86_400_000)),
        ),
      );
    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, v.user.id) });
    const points = profile?.pointsSeason ?? 0;
    return {
      pointsSeason: points,
      grade: profile?.grade ?? "rodage",
      next: nextGrade(points),
      season: { name: season.name, startsOn: season.startsOn, endsOn: season.endsOn },
      entries: rows.map(({ e, title }) => {
        const c = contestOf.get(e.id);
        return {
          id: e.id,
          kind: e.kind,
          points: e.points,
          at: e.createdAt.toISOString(),
          event: e.eventId ? { id: e.eventId, title: title ?? "" } : null,
          applicationId: e.applicationId,
          note: e.note,
          contest:
            e.kind === "malus"
              ? {
                  deadline: contestDeadline(e.createdAt).toISOString(),
                  canContest: !c && !reversed.has(e.applicationId) && canContest(e.createdAt, t),
                  status: c?.status ?? null,
                }
              : null,
        };
      }),
      pending: pending.map((p) => ({ eventId: p.id, title: p.title, settlesAt: settleAt(p).toISOString() })),
    };
  },

  /** `POST /admin/users/:id/points-adjust` : ajustement tracé au journal d'administration. */
  async adjust(v: Viewer, userId: string, points: number, note: string) {
    await requirePlatformRole(v, "super_admin");
    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
    if (!profile) throw notFound("Compte introuvable");
    return withTx(async (tx, after) => {
      const season = await seasonFor(tx, now());
      await award(tx, season, { userId, kind: "admin_adjustment", points, createdBy: v.user.id, note });
      await tx.insert(adminAuditLog).values({
        actorUserId: v.user.id,
        action: "points.adjust",
        targetType: "user",
        targetId: userId,
        reason: `${points > 0 ? "+" : ""}${points} · ${note}`,
      });
      const result = await recompute(tx, userId);
      after(() => notificationsService.kick());
      return result;
    });
  },

  /**
   * Parrainage (lot 15, ARCHITECTURE-SUITE § 1.3) : le filleul vient de confirmer son e-mail. +10 au parrain, une seule
   * fois par filleul (index unique partiel), au plus `REFERRAL_SEASON_CAP` par saison et par parrain (S3 : au-delà,
   * rien, journalisé). Renvoie l'entrée écrite ou `null`.
   */
  async awardReferral(sponsorId: string, refereeId: string): Promise<EntryRow | null> {
    return withTx(async (tx, after) => {
      const season = await seasonFor(tx, now());
      // Verrou consultatif par parrain : deux filleuls confirmés en même temps ne dépassent pas le plafond.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`referral:${sponsorId}`}))`);
      const [done] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(pointEntries)
        .where(
          and(
            eq(pointEntries.userId, sponsorId),
            eq(pointEntries.seasonId, season.id),
            eq(pointEntries.kind, "referral"),
          ),
        );
      if ((done?.n ?? 0) >= REFERRAL_SEASON_CAP) {
        console.info(`Parrainage au-delà du plafond de la saison (${REFERRAL_SEASON_CAP}) : ${sponsorId}`);
        return null;
      }
      const entry = await award(tx, season, {
        userId: sponsorId,
        kind: "referral",
        points: POINTS.referral,
        subjectUserId: refereeId,
      });
      if (!entry) return null;
      const referee = await tx.query.profiles.findFirst({ where: eq(profiles.userId, refereeId) });
      await recompute(tx, sponsorId);
      await notificationsService.notify(tx, sponsorId, "referral_confirmed", {
        title: `+${POINTS.referral} points · parrainage`,
        body: `${referee?.pseudo ?? "Ton ami"} a rejoint Orasso grâce à toi.`,
        link: pointsLink,
      });
      after(() => notificationsService.kick());
      return entry;
    });
  },

  /** Absences (malus non annulés) par compte, pour la fiche de tri (`absencesCount`). */
  async absences(userIds: string[]): Promise<Map<string, number>> {
    if (!userIds.length) return new Map();
    const rows = await db
      .select({ userId: pointEntries.userId, n: sql<number>`count(*)::int` })
      .from(pointEntries)
      .where(
        and(
          inArray(pointEntries.userId, userIds),
          eq(pointEntries.kind, "malus"),
          sql`not exists (select 1 from point_entries r where r.application_id = ${pointEntries.applicationId}
            and r.kind = 'malus_reversal')`,
        ),
      )
      .groupBy(pointEntries.userId);
    return new Map(rows.map((r) => [r.userId, r.n]));
  },
};
