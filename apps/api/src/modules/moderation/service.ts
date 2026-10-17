// Modération (lot 32, ARCHITECTURE-SUITE § 15.2) : signalements, suspension automatique (S39, S40), file du modérateur,
// sanctions et retrait de contenu, contestation, information du signaleur et du sanctionné, conservation d'un an.
// Le signaleur reste anonyme pour le signalé : rien de ce que lit la personne sanctionnée ne cite un signalement.
import {
  type AdminReportDetail,
  type AdminReportItem,
  type AdminSanction,
  type AdminSanctionInput,
  canContestSanction,
  countsForAutoSuspension,
  isSanctionActive,
  MODERATION,
  type MySanction,
  moderatorSanctionKinds,
  type ReportCreate,
  type ReportReason,
  type ReportStatus,
  reportReasonLabels,
  retainUntil,
  type SanctionKind,
  sanctionEnds,
  sanctionKindLabels,
  shouldAutoSuspend,
  terminalReportStatuses,
  moderationNotificationTexts as texts,
} from "@orasso/shared";
import { and, count, desc, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { adminAuditLog, devices, profiles, reports, sanctions, session, uploads, user } from "../../db/schema";
import { isSuperAdmin, requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, notFound, validation } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { decodeCursor, toPage } from "../../lib/pagination";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { uploadsService } from "../uploads/service";
import { activeSanctions, lockAccount, recomputeSuspension, type SanctionRow } from "./suspension";
import { type ReportRow, targetOf } from "./targets";

const DAY = 86_400_000;
const OPEN: ReportStatus[] = ["pending", "reviewing"];
const SANCTIONS_LINK = { label: texts.linkSanctions, path: "/app/sanctions" };

type After = (cb: () => unknown) => void;

async function audit(
  ex: Executor,
  v: Viewer,
  action: string,
  targetType: string,
  targetId: string,
  reason: string | null,
  ip: string | null,
) {
  await ex.insert(adminAuditLog).values({ actorUserId: v.user.id, action, targetType, targetId, reason, ip });
}

/** Modérateurs et super administrateurs (alerte prioritaire). */
async function moderationTeam(ex: Executor): Promise<string[]> {
  const rows = await ex
    .select({ id: profiles.userId })
    .from(profiles)
    .where(and(inArray(profiles.platformRole, ["moderator", "super_admin"]), isNull(profiles.deletedAt)));
  return rows.map((r) => r.id);
}

async function lockReport(tx: Tx, id: string): Promise<ReportRow> {
  const [row] = await tx.select().from(reports).where(eq(reports.id, id)).for("update");
  if (!row) throw notFound("Signalement introuvable");
  return row;
}

const isTerminal = (s: ReportStatus) => terminalReportStatuses.includes(s);

/** « Ton signalement a été traité » (sans détail), une fois par signalement clos. */
async function notifyReporters(tx: Tx, reporterIds: string[]) {
  if (!reporterIds.length) return;
  await notificationsService.notifyMany(tx, reporterIds, "report_handled", { ...texts.reportHandled });
}

async function notifySanction(tx: Tx, s: SanctionRow) {
  const t = texts.sanctionReceived(s.kind, reportReasonLabels[s.reason], s.endsAt ? formatDateTime(s.endsAt) : null);
  await notificationsService.notify(tx, s.userId, "sanction_received", {
    ...t,
    body: s.note && s.kind !== "ban" ? `${t.body} ${s.note}` : t.body,
    data: { sanctionId: s.id },
    link: SANCTIONS_LINK,
  });
}

/**
 * Clôt un signalement (et, sauf rejet pour abus, les autres signalements ouverts sur le même contenu : ils portent sur
 * la même chose et ont la même issue). Rend les signaleurs à prévenir.
 */
async function closeReports(
  tx: Tx,
  v: Viewer,
  report: ReportRow,
  status: ReportStatus,
  sanctionId: string | null,
): Promise<string[]> {
  const at = now();
  const set = {
    status,
    handledBy: v.user.id,
    handledAt: at,
    retainUntil: retainUntil(at),
    updatedAt: at,
  };
  const ids =
    status === "dismissed_abusive"
      ? [report.id]
      : (
          await tx
            .select({ id: reports.id })
            .from(reports)
            .where(
              and(
                eq(reports.targetType, report.targetType),
                eq(reports.targetId, report.targetId),
                inArray(reports.status, OPEN),
              ),
            )
            .for("update")
        ).map((r) => r.id);
  if (!ids.includes(report.id)) ids.push(report.id);
  const closed = await tx
    .update(reports)
    .set(set)
    .where(and(inArray(reports.id, ids), inArray(reports.status, OPEN)))
    .returning({ id: reports.id, reporterId: reports.reporterId });
  if (sanctionId) {
    await tx
      .update(reports)
      .set({ sanctionId })
      .where(and(inArray(reports.id, ids), isNull(reports.sanctionId)));
  }
  return closed.map((r) => r.reporterId);
}

/** Révoque toutes les sessions (bannissement) : site et appli (le jeton porteur est une session). */
async function revokeSessions(tx: Tx, userId: string) {
  await tx.delete(session).where(eq(session.userId, userId));
  // Relecture : plus aucun push vers ses appareils (aperçus de messages compris).
  await tx
    .update(devices)
    .set({ revokedAt: now() })
    .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));
}

function permissions(v: Viewer, report: ReportRow): AdminReportDetail["can"] {
  const admin = isSuperAdmin(v);
  const open = OPEN.includes(report.status);
  const hasRemoval = Boolean(targetOf(report.targetType).remove || targetOf(report.targetType).removeOutside);
  return {
    review: open && report.status !== "reviewing",
    // Relecture (M1) : un signalement déjà suivi d'une sanction se clôt par le super administrateur seulement.
    closeNoAction: open && (admin || !report.sanctionId),
    resolveAction: admin && open,
    dismissAbusive: admin && open,
    sanctionKinds:
      !open || !report.targetOwnerId
        ? []
        : admin
          ? ["warning", "suspension_7d", "suspension_30d", "ban"]
          : [...moderatorSanctionKinds],
    hideContent: admin && open && hasRemoval,
    sanctionReporter: admin && report.status === "dismissed_abusive",
  };
}

/** Relecture (M2) : suspension automatique, pas encore maintenue ni levée par le super administrateur. */
const moderatorMayLift = (s: SanctionRow) =>
  s.auto && s.kind === "suspension_7d" && (s.contestStatus === "none" || s.contestStatus === "pending");

function toMySanction(s: SanctionRow, at: Date): MySanction {
  return {
    id: s.id,
    kind: s.kind,
    reason: s.reason,
    note: s.note,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt?.toISOString() ?? null,
    active: isSanctionActive(s, at),
    liftedAt: s.liftedAt?.toISOString() ?? null,
    contestStatus: s.contestStatus,
    contestMessage: s.contestMessage,
    contestedAt: s.contestedAt?.toISOString() ?? null,
    canContest: canContestSanction(s, at),
  };
}

export const moderationService = {
  // --- Signaler -------------------------------------------------------------------------------------------------------

  /**
   * `POST /reports` : contenu existant et visible du signaleur ; jamais le sien ; un signalement par personne et par
   * contenu (409 `already_reported`) ; 10 par 24 heures (comptés en base sous verrou) ; capture privée rattachée une
   * fois. Puis suspension automatique du propriétaire si 3 signaleurs distincts comptés (S39) en 24 heures (S40).
   */
  async create(v: Viewer, input: ReportCreate): Promise<{ id: string; autoSuspended: boolean }> {
    const rules = targetOf(input.targetType);
    const target = await rules.resolve(v, input.targetId);
    if (target.ownerId === v.user.id) throw validation("Tu ne peux pas signaler ton propre contenu.");
    return withTx(async (tx, after) => {
      const at = now();
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`report:${v.user.id}`}, 0))`);
      const [existing] = await tx
        .select({ id: reports.id })
        .from(reports)
        .where(
          and(
            eq(reports.reporterId, v.user.id),
            eq(reports.targetType, input.targetType),
            eq(reports.targetId, input.targetId),
          ),
        );
      if (existing) throw conflict("already_reported", "Tu as déjà signalé ce contenu.");
      const [today] = await tx
        .select({ n: count() })
        .from(reports)
        .where(and(eq(reports.reporterId, v.user.id), gt(reports.createdAt, new Date(at.getTime() - DAY))));
      if ((today?.n ?? 0) >= MODERATION.dailyReportLimit) {
        throw new AppError(429, "rate_limited", "Tu as fait beaucoup de signalements aujourd'hui : réessaie demain.");
      }
      if (input.screenshotKey && !(await uploadsService.consume(tx, v.user.id, input.screenshotKey, "report"))) {
        throw validation("Capture inconnue ou déjà utilisée : ajoute-la à nouveau.");
      }
      const [row] = await tx
        .insert(reports)
        .values({
          reporterId: v.user.id,
          targetType: input.targetType,
          targetId: input.targetId,
          targetOwnerId: target.ownerId,
          reason: input.reason,
          details: input.details,
          screenshotKey: input.screenshotKey,
          context: target.context ?? null,
          createdAt: at,
          updatedAt: at,
        })
        .returning();
      if (!row) throw new Error("Signalement non enregistré");
      const autoSuspended = target.ownerId ? await this.autoSuspend(tx, after, target.ownerId) : false;
      after(() => notificationsService.kick());
      return { id: row.id, autoSuspended };
    });
  },

  /**
   * Suspension automatique (§ 15.2), dans la transaction du signalement, sous le verrou du compte visé : signaleurs
   * distincts de signalements encore ouverts sur ce compte depuis 24 heures, sans les comptes de moins de 7 jours ni ceux
   * qui ont 2 signalements rejetés comme abusifs (S39) ; à 3 (S40), et sans sanction déjà active, suspension de 7 jours
   * (`auto`), alerte prioritaire immédiate aux modérateurs et au super administrateur. Jamais pour un compte de
   * l'équipe (l'alerte suffit : un modérateur ne se retrouve pas exclu par une meute). Rien d'irréversible : sessions
   * gardées (lecture seule), levée possible par un modérateur.
   */
  async autoSuspend(tx: Tx, after: After, ownerId: string): Promise<boolean> {
    const at = now();
    await lockAccount(tx, ownerId);
    const [owner] = await tx.select().from(profiles).where(eq(profiles.userId, ownerId));
    if (!owner || owner.deletedAt) return false;
    const recent = await tx
      .select({
        id: reports.id,
        reporterId: reports.reporterId,
        accountCreatedAt: user.createdAt,
        dismissed: sql<number>`(select count(*)::int from reports d where d.reporter_id = ${reports.reporterId} and d.status = 'dismissed_abusive')`,
      })
      .from(reports)
      .innerJoin(user, eq(user.id, reports.reporterId))
      .innerJoin(profiles, eq(profiles.userId, reports.reporterId))
      .where(
        and(
          eq(reports.targetOwnerId, ownerId),
          inArray(reports.status, OPEN),
          gt(reports.createdAt, new Date(at.getTime() - MODERATION.autoSuspendWindowMs)),
          // Relecture : un signalement qui a déjà servi à une sanction (levée ou non) ne recompte jamais ; sinon une
          // suspension levée reviendrait au premier nouveau signalement d'un membre de la meute.
          isNull(reports.sanctionId),
          // S39 (relecture, M3) : un signaleur banni, supprimé ou suspendu ne compte pas.
          isNull(profiles.deletedAt),
          isNull(profiles.bannedAt),
          or(isNull(profiles.suspendedUntil), lte(profiles.suspendedUntil, at)),
        ),
      );
    const counted = recent.filter((r) =>
      countsForAutoSuspension({ accountCreatedAt: r.accountCreatedAt, dismissedAbusive: Number(r.dismissed) }, at),
    );
    const reporters = new Set(counted.map((r) => r.reporterId));
    if (!shouldAutoSuspend(reporters.size)) return false;
    if ((await activeSanctions(tx, ownerId, at)).length > 0) return false;
    const team = (await moderationTeam(tx)).filter((id) => id !== ownerId);
    if (owner.platformRole !== "user") {
      await notificationsService.notifyMany(tx, team, "moderation_priority_alert", {
        ...texts.priorityAlert(owner.pseudo, reporters.size),
        body: `${owner.pseudo} (équipe Orasso) a reçu ${reporters.size} signalements en 24 heures : pas de suspension automatique pour un compte de l'équipe, à examiner.`,
        link: { label: texts.linkQueue, path: "/admin/signalements" },
      });
      return false;
    }
    const reportIds = counted.map((r) => r.id);
    const [s] = await tx
      .insert(sanctions)
      .values({
        userId: ownerId,
        kind: "suspension_7d",
        reason: await dominantReason(tx, reportIds),
        reportIds,
        startsAt: at,
        endsAt: sanctionEnds("suspension_7d", at),
        auto: true,
        createdAt: at,
        updatedAt: at,
      })
      .returning();
    if (!s) throw new Error("Sanction non enregistrée");
    await tx
      .update(reports)
      .set({ sanctionId: s.id })
      .where(and(inArray(reports.id, reportIds), isNull(reports.sanctionId)));
    await recomputeSuspension(tx, ownerId);
    await notifySanction(tx, s);
    await notificationsService.notifyMany(tx, team, "moderation_priority_alert", {
      ...texts.priorityAlert(owner.pseudo, reporters.size),
      data: { sanctionId: s.id },
      link: { label: texts.linkQueue, path: "/admin/signalements" },
    });
    after(() => notificationsService.kick());
    return true;
  },

  // --- La personne sanctionnée ---------------------------------------------------------------------------------------

  /** `GET /me/sanctions` : ses sanctions, jamais les signalements ni leurs auteurs. */
  async mySanctions(v: Viewer): Promise<MySanction[]> {
    const at = now();
    const rows = await db
      .select()
      .from(sanctions)
      .where(eq(sanctions.userId, v.user.id))
      .orderBy(desc(sanctions.startsAt));
    return rows.map((s) => toMySanction(s, at));
  },

  /** `POST /sanctions/:id/contest` : une seule fois, par la personne sanctionnée (404 pour toute autre). */
  async contest(v: Viewer, id: string, message: string): Promise<MySanction> {
    return withTx(async (tx) => {
      const at = now();
      const [s] = await tx
        .select()
        .from(sanctions)
        .where(and(eq(sanctions.id, id), eq(sanctions.userId, v.user.id)))
        .for("update");
      if (!s) throw notFound("Sanction introuvable");
      if (!canContestSanction(s, at)) {
        throw conflict(
          "already_handled",
          s.contestStatus !== "none"
            ? "Tu as déjà contesté cette sanction."
            : "Cette sanction ne peut plus être contestée.",
        );
      }
      const [updated] = await tx
        .update(sanctions)
        .set({ contestStatus: "pending", contestMessage: message, contestedAt: at, updatedAt: at })
        .where(eq(sanctions.id, s.id))
        .returning();
      if (!updated) throw notFound("Sanction introuvable");
      return toMySanction(updated, at);
    });
  },

  // --- File du modérateur --------------------------------------------------------------------------------------------

  /** `GET /admin/reports?status=` (modérateur et super administrateur, double authentification). */
  async adminList(v: Viewer, q: { status: ReportStatus; limit: number; cursor?: string }) {
    await requirePlatformRole(v, "moderator");
    const at = now();
    const cur = decodeCursor(q.cursor);
    const rows = await db
      .select({ r: reports, ownerPseudo: profiles.pseudo, ownerUntil: profiles.suspendedUntil })
      .from(reports)
      .leftJoin(profiles, eq(profiles.userId, reports.targetOwnerId))
      .where(
        and(
          eq(reports.status, q.status),
          cur
            ? or(
                lt(reports.createdAt, cur.createdAt),
                and(eq(reports.createdAt, cur.createdAt), lt(reports.id, cur.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(reports.createdAt), desc(reports.id))
      .limit(q.limit + 1);
    const owners = [...new Set(rows.map((x) => x.r.targetOwnerId).filter((id): id is string => Boolean(id)))];
    const open = owners.length
      ? await db
          .select({ owner: reports.targetOwnerId, n: sql<number>`count(distinct ${reports.reporterId})::int` })
          .from(reports)
          .where(
            and(
              inArray(reports.targetOwnerId, owners),
              inArray(reports.status, OPEN),
              gt(reports.createdAt, new Date(at.getTime() - MODERATION.autoSuspendWindowMs)),
            ),
          )
          .groupBy(reports.targetOwnerId)
      : [];
    const openBy = new Map(open.map((o) => [o.owner, Number(o.n)]));
    return toPage(
      rows.map((x) => ({ ...x.r, ownerPseudo: x.ownerPseudo, ownerUntil: x.ownerUntil })),
      q.limit,
      (r): AdminReportItem => ({
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        ownerPseudo: r.ownerPseudo ?? null,
        ownerSuspended: Boolean(r.ownerUntil && r.ownerUntil > at),
        openOnOwner: r.targetOwnerId ? (openBy.get(r.targetOwnerId) ?? 0) : 0,
        hasScreenshot: Boolean(r.screenshotKey),
      }),
    );
  },

  /**
   * `GET /admin/reports/:id` : cible rendue selon son type, capture (route contrôlée), copie de la conversation pour un
   * message. Chaque consultation est tracée (`moderation.report_view`) : c'est le seul accès de l'équipe à un message
   * privé (docs/01).
   */
  async adminDetail(v: Viewer, id: string, ip: string | null): Promise<AdminReportDetail> {
    await requirePlatformRole(v, "moderator");
    const at = now();
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    if (!report) throw notFound("Signalement introuvable");
    const [owner] = report.targetOwnerId
      ? await db.select().from(profiles).where(eq(profiles.userId, report.targetOwnerId))
      : [];
    const [reporter] = await db
      .select({ pseudo: profiles.pseudo, createdAt: user.createdAt })
      .from(profiles)
      .innerJoin(user, eq(user.id, profiles.userId))
      .where(eq(profiles.userId, report.reporterId));
    const [abusive] = await db
      .select({ n: count() })
      .from(reports)
      .where(and(eq(reports.reporterId, report.reporterId), eq(reports.status, "dismissed_abusive")));
    const [handler] = report.handledBy
      ? await db.select({ pseudo: profiles.pseudo }).from(profiles).where(eq(profiles.userId, report.handledBy))
      : [];
    const [sanction] = report.sanctionId
      ? await db.select().from(sanctions).where(eq(sanctions.id, report.sanctionId))
      : [];
    const [openOnOwner] = report.targetOwnerId
      ? await db
          .select({ n: sql<number>`count(distinct ${reports.reporterId})::int` })
          .from(reports)
          .where(
            and(
              eq(reports.targetOwnerId, report.targetOwnerId),
              inArray(reports.status, OPEN),
              gt(reports.createdAt, new Date(at.getTime() - MODERATION.autoSuspendWindowMs)),
            ),
          )
      : [];
    const target = await targetOf(report.targetType).view(report);
    await audit(
      db,
      v,
      "moderation.report_view",
      "report",
      report.id,
      report.targetType === "message" ? "Lecture de la conversation jointe au signalement" : null,
      ip,
    );
    return {
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      ownerPseudo: owner?.pseudo ?? null,
      ownerSuspended: Boolean(owner?.suspendedUntil && owner.suspendedUntil > at),
      openOnOwner: Number(openOnOwner?.n ?? 0),
      hasScreenshot: Boolean(report.screenshotKey),
      details: report.details,
      context: report.context ?? null,
      screenshotUrl: report.screenshotKey ? `/api/admin/reports/${report.id}/screenshot` : null,
      target: { type: report.targetType, id: report.targetId, ...target },
      ownerUserId: report.targetOwnerId,
      reporter: {
        pseudo: reporter?.pseudo ?? "Compte supprimé",
        dismissedAbusive: abusive?.n ?? 0,
        accountAgeDays: reporter ? Math.floor((at.getTime() - reporter.createdAt.getTime()) / DAY) : 0,
      },
      handledByPseudo: handler?.pseudo ?? null,
      handledAt: report.handledAt?.toISOString() ?? null,
      sanction: sanction
        ? {
            id: sanction.id,
            kind: sanction.kind,
            auto: sanction.auto,
            liftedAt: sanction.liftedAt?.toISOString() ?? null,
            liftable:
              !sanction.liftedAt && isSanctionActive(sanction, at) && (isSuperAdmin(v) || moderatorMayLift(sanction)),
          }
        : null,
      can: permissions(v, report),
    };
  },

  /** `GET /admin/reports/:id/screenshot` : capture privée, à l'équipe seulement. */
  async screenshot(v: Viewer, id: string, ip: string | null = null): Promise<Buffer> {
    await requirePlatformRole(v, "moderator");
    const [report] = await db.select({ key: reports.screenshotKey }).from(reports).where(eq(reports.id, id));
    const data = report?.key ? await storage.get(report.key) : null;
    if (!data) throw notFound("Capture introuvable");
    // Relecture (M6) : la consultation de la capture est tracée comme celle du signalement.
    await audit(db, v, "moderation.screenshot_view", "report", id, null, ip);
    return data;
  },

  /**
   * `POST /admin/reports/:id/status`. Modérateur : prise en charge, clôture sans suite. Super administrateur : en plus,
   * « mesure prise » et rejet pour abus (compté contre le signaleur, S39). Une décision ne se prend qu'une fois.
   */
  async setStatus(v: Viewer, id: string, input: { status: ReportStatus; note: string | null }, ip: string | null) {
    await requirePlatformRole(v, "moderator");
    if ((input.status === "resolved_action" || input.status === "dismissed_abusive") && !isSuperAdmin(v)) {
      throw forbidden("Décision réservée au super administrateur");
    }
    await withTx(async (tx, after) => {
      const report = await lockReport(tx, id);
      if (isTerminal(report.status)) throw conflict("already_handled", "Ce signalement a déjà été traité.");
      if (input.status === "resolved_no_action" && report.sanctionId && !isSuperAdmin(v)) {
        throw forbidden("Une sanction a été prononcée : la décision revient au super administrateur.");
      }
      if (input.status === "reviewing") {
        if (report.status === "reviewing") return;
        await tx
          .update(reports)
          .set({ status: "reviewing", handledBy: v.user.id, updatedAt: now() })
          .where(eq(reports.id, id));
      } else {
        await notifyReporters(tx, await closeReports(tx, v, report, input.status, null));
      }
      await audit(tx, v, `moderation.report_${input.status}`, "report", id, input.note, ip);
      after(() => notificationsService.kick());
    });
    return this.adminDetail(v, id, ip);
  },

  /**
   * `POST /admin/reports/:id/sanction {kind, note, hideContent, subject}`. Modérateur : suspension de 7 jours du
   * propriétaire seulement (le signalement passe « en cours d'examen », le super administrateur décide ensuite).
   * Super administrateur : toute l'échelle, le retrait du contenu, et la sanction d'un signaleur abusif.
   */
  async sanction(v: Viewer, id: string, input: AdminSanctionInput, ip: string | null) {
    await requirePlatformRole(v, "moderator");
    const admin = isSuperAdmin(v);
    if (
      !admin &&
      (input.hideContent || input.subject !== "owner" || !input.kind || !moderatorSanctionKinds.includes(input.kind))
    ) {
      throw forbidden(
        "Le modérateur peut seulement suspendre 7 jours ; le reste est décidé par le super administrateur.",
      );
    }
    const [current] = await db.select().from(reports).where(eq(reports.id, id));
    if (!current) throw notFound("Signalement introuvable");
    const rules = targetOf(current.targetType);
    if (input.hideContent && !rules.remove && !rules.removeOutside) {
      throw validation("Ce contenu ne se retire pas : sanctionne son propriétaire.");
    }
    const subjectId = input.subject === "reporter" ? current.reporterId : current.targetOwnerId;
    if (input.kind && !subjectId) throw conflict("conflict", "Aucun compte à sanctionner pour ce contenu.");
    if (subjectId === v.user.id) throw validation("Tu ne peux pas te sanctionner toi-même.");
    if (input.subject === "reporter" && current.status !== "dismissed_abusive") {
      throw conflict("conflict", "Rejette d'abord le signalement comme abusif.");
    }
    if (input.subject === "owner" && isTerminal(current.status)) {
      throw conflict("already_handled", "Ce signalement a déjà été traité.");
    }
    // Annulation d'un événement : service complet (candidatures, billets, notifications), avant la décision.
    if (input.hideContent && rules.removeOutside) await rules.removeOutside(v, current);
    const removedKeys: string[] = [];
    await withTx(async (tx, after) => {
      const report = await lockReport(tx, id);
      if (input.subject === "owner" && isTerminal(report.status)) {
        throw conflict("already_handled", "Ce signalement a déjà été traité.");
      }
      let sanction: SanctionRow | null = null;
      if (input.kind && subjectId) {
        await lockAccount(tx, subjectId);
        const at = now();
        const [target] = await tx.select().from(profiles).where(eq(profiles.userId, subjectId));
        if (!target || target.deletedAt) throw conflict("conflict", "Ce compte a été supprimé.");
        // Relecture : jamais de sanction d'un super administrateur (il serait bloqué hors de ses décisions) ; le
        // modérateur ne sanctionne qu'un compte ordinaire.
        if (target.platformRole === "super_admin") {
          throw conflict("conflict", "Un super administrateur ne peut pas être sanctionné.");
        }
        if (!admin && target.platformRole !== "user") {
          throw forbidden("Le modérateur ne sanctionne pas un compte de l'équipe Orasso.");
        }
        const active = await activeSanctions(tx, subjectId, at);
        if (!admin && active.length) throw conflict("already_handled", "Ce compte est déjà suspendu.");
        if (input.subject === "reporter") {
          const [dup] = await tx
            .select({ id: sanctions.id })
            .from(sanctions)
            .where(and(eq(sanctions.userId, subjectId), sql`${report.id} = any(${sanctions.reportIds})`));
          if (dup) throw conflict("already_handled", "Ce signaleur a déjà été sanctionné pour ce signalement.");
        }
        [sanction] = (await tx
          .insert(sanctions)
          .values({
            userId: subjectId,
            kind: input.kind,
            reason: input.subject === "reporter" ? "other" : report.reason,
            note: input.note ?? (input.subject === "reporter" ? "Signalements abusifs" : null),
            reportIds: [report.id],
            startsAt: at,
            endsAt: sanctionEnds(input.kind, at),
            issuedBy: v.user.id,
            auto: false,
            createdAt: at,
            updatedAt: at,
          })
          .returning()) as [SanctionRow];
        const state = await recomputeSuspension(tx, subjectId);
        if (state.banned) await revokeSessions(tx, subjectId);
        await notifySanction(tx, sanction);
        await audit(
          tx,
          v,
          "moderation.sanction",
          "user",
          subjectId,
          `${sanctionKindLabels[input.kind]} · signalement ${report.id}${input.note ? ` · ${input.note}` : ""}`,
          ip,
        );
      }
      if (input.hideContent && rules.remove) {
        removedKeys.push(...(await rules.remove(tx, v, report, after)));
      }
      if (input.hideContent) {
        await audit(tx, v, "moderation.content_removed", report.targetType, report.targetId, input.note, ip);
      }
      if (input.subject === "owner") {
        if (admin) {
          await notifyReporters(tx, await closeReports(tx, v, report, "resolved_action", sanction?.id ?? null));
        } else {
          await tx
            .update(reports)
            .set({
              status: "reviewing",
              handledBy: v.user.id,
              sanctionId: sanction?.id ?? report.sanctionId,
              updatedAt: now(),
            })
            .where(eq(reports.id, report.id));
        }
      }
      after(() => notificationsService.kick());
    });
    for (const key of removedKeys) await storage.remove(key).catch(() => undefined);
    return this.adminDetail(v, id, ip);
  },

  /**
   * Lot 33 : sanction directe depuis le registre des utilisateurs (`POST /admin/users/:id/sanction`, super
   * administrateur), sans signalement. Mêmes effets que `sanction` : suspension recalculée, sessions révoquées pour un
   * bannissement, notification avec le motif et le lien de contestation, journal. Jamais un super administrateur.
   */
  async sanctionUser(
    v: Viewer,
    userId: string,
    input: { kind: SanctionKind; reason: ReportReason; note: string },
    ip: string | null,
  ): Promise<MySanction> {
    await requirePlatformRole(v, "super_admin");
    if (userId === v.user.id) throw validation("Tu ne peux pas te sanctionner toi-même.");
    return withTx(async (tx, after) => {
      await lockAccount(tx, userId);
      const at = now();
      const [target] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
      if (!target) throw notFound("Compte introuvable");
      if (target.deletedAt) throw conflict("conflict", "Ce compte a été supprimé.");
      if (target.platformRole === "super_admin") {
        throw conflict("conflict", "Un super administrateur ne peut pas être sanctionné.");
      }
      const [sanction] = (await tx
        .insert(sanctions)
        .values({
          userId,
          kind: input.kind,
          reason: input.reason,
          note: input.note,
          reportIds: [],
          startsAt: at,
          endsAt: sanctionEnds(input.kind, at),
          issuedBy: v.user.id,
          auto: false,
          createdAt: at,
          updatedAt: at,
        })
        .returning()) as [SanctionRow];
      const state = await recomputeSuspension(tx, userId);
      if (state.banned) await revokeSessions(tx, userId);
      await notifySanction(tx, sanction);
      await audit(
        tx,
        v,
        "moderation.sanction",
        "user",
        userId,
        `${sanctionKindLabels[input.kind]} · ${input.note}`,
        ip,
      );
      after(() => notificationsService.kick());
      return toMySanction(sanction, at);
    });
  },

  // --- Sanctions et contestations -----------------------------------------------------------------------------------

  /** `GET /admin/sanctions?filter=` (super administrateur) : contestations à décider, sanctions en cours, toutes. */
  async adminSanctions(v: Viewer, filter: "contested" | "active" | "all"): Promise<AdminSanction[]> {
    await requirePlatformRole(v, "super_admin");
    const at = now();
    const where =
      filter === "contested"
        ? eq(sanctions.contestStatus, "pending")
        : filter === "active"
          ? and(
              isNull(sanctions.liftedAt),
              ne(sanctions.kind, "warning"),
              or(isNull(sanctions.endsAt), gt(sanctions.endsAt, at)),
            )
          : undefined;
    const issuer = sql<string | null>`(select p2.pseudo from profiles p2 where p2.user_id = ${sanctions.issuedBy})`;
    const rows = await db
      .select({ s: sanctions, pseudo: profiles.pseudo, issuer })
      .from(sanctions)
      .innerJoin(profiles, eq(profiles.userId, sanctions.userId))
      .where(where)
      .orderBy(desc(sanctions.contestedAt), desc(sanctions.startsAt))
      .limit(200);
    return rows.map(({ s, pseudo, issuer: by }) => ({
      id: s.id,
      userId: s.userId,
      pseudo,
      kind: s.kind,
      reason: s.reason,
      note: s.note,
      auto: s.auto,
      issuedByPseudo: by,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt?.toISOString() ?? null,
      active: isSanctionActive(s, at),
      liftedAt: s.liftedAt?.toISOString() ?? null,
      contestStatus: s.contestStatus,
      contestMessage: s.contestMessage,
      contestedAt: s.contestedAt?.toISOString() ?? null,
      reportIds: s.reportIds,
      can: { decide: s.contestStatus === "pending", lift: !s.liftedAt && isSanctionActive(s, at) },
    }));
  },

  /** `POST /admin/sanctions/:id/decide {decision, note}` (super administrateur) : contestation maintenue ou levée. */
  async decide(v: Viewer, id: string, input: { decision: "uphold" | "lift"; note: string | null }, ip: string | null) {
    await requirePlatformRole(v, "super_admin");
    await withTx(async (tx, after) => {
      const [s] = await tx.select().from(sanctions).where(eq(sanctions.id, id)).for("update");
      if (!s) throw notFound("Sanction introuvable");
      if (s.contestStatus !== "pending") throw conflict("already_handled", "Pas de contestation à décider.");
      await lockAccount(tx, s.userId);
      const at = now();
      const lifted = input.decision === "lift";
      await tx
        .update(sanctions)
        .set({
          contestStatus: lifted ? "lifted" : "upheld",
          contestDecidedBy: v.user.id,
          contestDecidedAt: at,
          ...(lifted && !s.liftedAt ? { liftedAt: at, liftedBy: v.user.id } : {}),
          updatedAt: at,
        })
        .where(eq(sanctions.id, id));
      if (lifted) await recomputeSuspension(tx, s.userId);
      await notificationsService.notify(tx, s.userId, "sanction_contest_decided", {
        ...texts.contestDecided(lifted, input.note),
        data: { sanctionId: s.id },
        link: SANCTIONS_LINK,
      });
      await audit(tx, v, `moderation.contest_${input.decision}`, "sanction", id, input.note, ip);
      after(() => notificationsService.kick());
    });
  },

  /**
   * `POST /admin/sanctions/:id/lift {note}` : levée sans attendre une contestation. Super administrateur : toute
   * sanction ; modérateur : une suspension automatique seulement (AS8 : meute contre un organisateur).
   */
  async lift(v: Viewer, id: string, note: string | null, ip: string | null) {
    await requirePlatformRole(v, "moderator");
    await withTx(async (tx, after) => {
      const [s] = await tx.select().from(sanctions).where(eq(sanctions.id, id)).for("update");
      if (!s) throw notFound("Sanction introuvable");
      if (!isSuperAdmin(v) && !moderatorMayLift(s)) {
        throw forbidden(
          "Le modérateur ne lève qu'une suspension automatique (pas une sanction maintenue par le super administrateur).",
        );
      }
      if (s.liftedAt) throw conflict("already_handled", "Cette sanction est déjà levée.");
      await lockAccount(tx, s.userId);
      const at = now();
      await tx
        .update(sanctions)
        .set({
          liftedAt: at,
          liftedBy: v.user.id,
          ...(s.contestStatus === "pending"
            ? { contestStatus: "lifted" as const, contestDecidedBy: v.user.id, contestDecidedAt: at }
            : {}),
          updatedAt: at,
        })
        .where(eq(sanctions.id, id));
      await recomputeSuspension(tx, s.userId);
      await notificationsService.notify(tx, s.userId, "sanction_lifted", {
        ...texts.sanctionLifted(note),
        data: { sanctionId: s.id },
        link: SANCTIONS_LINK,
      });
      await audit(tx, v, "moderation.sanction_lift", "sanction", id, note, ip);
      after(() => notificationsService.kick());
    });
  },

  // --- Conservation ---------------------------------------------------------------------------------------------------

  /**
   * Tâche quotidienne `moderation.purge` (idempotente) : signalements échus (un an après la décision) supprimés avec leur
   * capture, sauf ceux d'un bannissement en vigueur ou d'une contestation en cours (docs/01 : « sauf bannissement ou
   * procédure en cours ») ; sanctions hors bannissement en vigueur supprimées un an après leur fin.
   */
  async purge(): Promise<{ reports: number; sanctions: number }> {
    const at = now();
    const yearAgo = new Date(at);
    yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    const protectedBy = sql`exists (
      select 1 from sanctions s join profiles p on p.user_id = s.user_id
      where (s.id = ${reports.sanctionId} or ${reports.id} = any(s.report_ids))
        and ((s.kind = 'ban' and s.lifted_at is null) or (s.contest_status = 'pending' and p.deleted_at is null)))`;
    const removed = await withTx(async (tx) => {
      const rows = await tx
        .delete(reports)
        .where(and(lt(reports.retainUntil, at), sql`not ${protectedBy}`))
        .returning({ key: reports.screenshotKey });
      const keys = rows.map((r) => r.key).filter((k): k is string => Boolean(k));
      if (keys.length) await tx.delete(uploads).where(inArray(uploads.key, keys));
      const gone = await tx
        .delete(sanctions)
        .where(
          and(
            or(ne(sanctions.kind, "ban"), sql`${sanctions.liftedAt} is not null`),
            ne(sanctions.contestStatus, "pending"),
            sql`coalesce(${sanctions.liftedAt}, ${sanctions.endsAt}, ${sanctions.startsAt}) < ${yearAgo}`,
          ),
        )
        .returning({ id: sanctions.id });
      return { keys, sanctions: gone.length, reports: rows.length };
    });
    for (const key of removed.keys) await storage.remove(key).catch(() => undefined);
    return { reports: removed.reports, sanctions: removed.sanctions };
  },
};

/** Motif le plus fréquent des signalements qui déclenchent la suspension automatique. */
async function dominantReason(tx: Tx, reportIds: string[]) {
  const rows = await tx
    .select({ reason: reports.reason, n: count() })
    .from(reports)
    .where(inArray(reports.id, reportIds))
    .groupBy(reports.reason)
    .orderBy(desc(count()));
  return rows[0]?.reason ?? "other";
}
