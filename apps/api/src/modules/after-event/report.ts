// Bilan automatique d'un événement (lot 27, ARCHITECTURE-SUITE § 11.1). Calculé une fois au règlement des points (J+2,
// dans la transaction de `event.settle`, donc cohérent avec les points attribués), puis rafraîchi une fois à J+8 quand
// la fenêtre d'avis est close (`event.report-refresh`, balayage de secours horaire). Des nombres seulement : aucune
// personne n'y figure, et la lecture est réservée à l'organisation (propriétaire, co-organisateurs actifs, 2FA).
import {
  afterEventLabels,
  type EventReportData,
  type EventReportView,
  REPORT_TOP_N,
  type ReportCount,
  reportRefreshAt,
  reviewAverage,
  SEGMENT_REACH_AFTER_END_MS,
} from "@orasso/shared";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { eventReports, events } from "../../db/schema";
import { deps, now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { requireEventReader } from "../communication/guards";
import { type EventRow, eventsRepo } from "../events/repo";
import { notificationsService } from "../notifications/service";
import { staffService } from "../staff/service";
import { organizerIds } from "./helpers";
import { thanksService } from "./thanks";

/** Candidatures de véhicules visibles de l'organisation : une venue en crew jamais confirmée n'en fait pas partie. */
const CONFIRMED = sql`(a.crew_application_id is null or a.member_confirmed_at is not null)`;

const rowsOf = <T>(result: { rows: unknown[] }) => result.rows as T[];

/** Calcule le bilan depuis la base (requêtes agrégées : aucun identifiant de personne ne sort de cette fonction). */
export async function computeReport(ex: Executor, event: EventRow): Promise<EventReportData> {
  const eventId = event.id;
  const [counts] = rowsOf<{ registered: number; accepted: number; present: number; absent: number }>(
    await ex.execute(sql`
      select count(*)::int as registered,
             (count(*) filter (where a.status = 'accepted'))::int as accepted,
             (count(*) filter (where c.id is not null))::int as present,
             (count(*) filter (where a.status = 'accepted' and c.id is null))::int as absent
      from applications a left join checkins c on c.application_id = a.id
      where a.event_id = ${eventId} and a.kind = 'vehicle' and ${CONFIRMED}`),
  );
  const present = counts?.present ?? 0;
  const absent = counts?.absent ?? 0;

  const byCategory = rowsOf<ReportCount>(
    await ex.execute(sql`
      select cat.label as label, count(*)::int as count
      from checkins c
      join applications a on a.id = c.application_id and a.kind = 'vehicle'
      join vehicle_categories vc on vc.vehicle_id = a.vehicle_id
      join categories cat on cat.id = vc.category_id
      where c.event_id = ${eventId}
      group by cat.label order by count desc, cat.label limit ${REPORT_TOP_N}`),
  );
  const byMake = rowsOf<ReportCount>(
    await ex.execute(sql`
      select m.name as label, count(*)::int as count
      from checkins c
      join applications a on a.id = c.application_id and a.kind = 'vehicle'
      join vehicles v on v.id = a.vehicle_id
      join vehicle_makes m on m.id = v.make_id
      where c.event_id = ${eventId}
      group by m.name order by count desc, m.name limit ${REPORT_TOP_N}`),
  );
  const byDepartment = rowsOf<ReportCount>(
    await ex.execute(sql`
      select p.departments[1] as label, count(*)::int as count
      from checkins c
      join applications a on a.id = c.application_id and a.kind = 'vehicle'
      join profiles p on p.user_id = a.user_id
      where c.event_id = ${eventId} and p.departments[1] is not null
      group by p.departments[1] order by count desc, label limit ${REPORT_TOP_N}`),
  );
  const [providers] = rowsOf<{ accepted: number; present: number }>(
    await ex.execute(sql`
      select (count(*) filter (where a.status = 'accepted'))::int as accepted,
             (count(*) filter (where c.id is not null))::int as present
      from applications a left join checkins c on c.application_id = a.id
      where a.event_id = ${eventId} and a.kind = 'provider'`),
  );
  const staff = await staffService.members(event, ex);
  // Abonnés venus d'une candidature entre la publication et la fin de la fenêtre d'avis (J+7).
  const since = event.publishedAt ?? event.createdAt;
  const until = new Date(event.endsAt.getTime() + SEGMENT_REACH_AFTER_END_MS);
  const [followers] = rowsOf<{ n: number }>(
    await ex.execute(sql`
      select count(*)::int as n from structure_follows f
      where f.structure_id = ${event.structureId} and f.source = 'application'
        and f.created_at >= ${since} and f.created_at <= ${until}`),
  );
  const [incidents] = rowsOf<{ n: number }>(
    await ex.execute(sql`select count(*)::int as n from incidents where event_id = ${eventId}`),
  );
  const ratings = rowsOf<{ rating: number }>(
    await ex.execute(sql`select rating from reviews where event_id = ${eventId} and hidden_at is null`),
  ).map((r) => r.rating);
  const [scans] = rowsOf<{ total: number; duplicates: number; overrides: number }>(
    await ex.execute(sql`
      select count(*)::int as total,
             (count(*) filter (where server_result in ('duplicate_same_device', 'duplicate_other_device')))::int as duplicates,
             (count(*) filter (where local_decision = 'override'))::int as overrides
      from scan_events where event_id = ${eventId}`),
  );
  const [points] = rowsOf<{ participations: number; malus: number; reversed: number }>(
    await ex.execute(sql`
      select (count(*) filter (where kind = 'participation'))::int as participations,
             (count(*) filter (where kind = 'malus'))::int as malus,
             (count(*) filter (where kind = 'malus_reversal'))::int as reversed
      from point_entries where event_id = ${eventId}`),
  );

  return {
    registered: counts?.registered ?? 0,
    accepted: counts?.accepted ?? 0,
    present,
    absent,
    presenceRate: present + absent > 0 ? Math.round((present / (present + absent)) * 1000) / 1000 : null,
    byCategory,
    byMake,
    byDepartment,
    providers: { accepted: providers?.accepted ?? 0, present: providers?.present ?? 0 },
    staff: { expected: staff.length, present: staff.filter((m) => m.presence === "present").length },
    newFollowers: followers?.n ?? 0,
    incidents: incidents?.n ?? 0,
    reviews: { count: ratings.length, average: reviewAverage(ratings) },
    scans: { total: scans?.total ?? 0, duplicates: scans?.duplicates ?? 0, overrides: scans?.overrides ?? 0 },
    points: {
      participations: points?.participations ?? 0,
      malus: Math.max(0, (points?.malus ?? 0) - (points?.reversed ?? 0)),
    },
  };
}

const REFRESH_SWEEP_HORIZON_MS = 30 * 86_400_000;

export const reportService = {
  /**
   * Premier calcul (une seule fois : `on conflict do nothing`). Rend `true` si la ligne vient d'être créée. Appelée
   * dans la transaction du règlement ; `lazy` (lecture, balayage) ne prévient personne.
   */
  async generate(tx: Tx, event: EventRow): Promise<boolean> {
    const data = await computeReport(tx, event);
    const [row] = await tx
      .insert(eventReports)
      .values({ eventId: event.id, generatedAt: now(), data })
      .onConflictDoNothing()
      .returning({ eventId: eventReports.eventId });
    return Boolean(row);
  },

  /**
   * Appelée par `pointsService.settleEvent` une fois les points écrits (même transaction) : bilan, notification aux
   * organisateurs, suggestion de remerciement, tâche du rafraîchissement de J+8.
   */
  async onSettled(tx: Tx, event: EventRow, after: (cb: () => unknown) => void): Promise<void> {
    const created = await this.generate(tx, event);
    const refreshAt = reportRefreshAt(event);
    after(() => deps.jobs.send("event.report-refresh", { eventId: event.id, at: refreshAt.toISOString() }, refreshAt));
    if (!created) return;
    const [report] = await tx.select().from(eventReports).where(eq(eventReports.eventId, event.id));
    const organizers = await organizerIds(event.structureId, tx);
    const link = { label: "Ouvrir le bilan", path: `/orga/${await slugOf(tx, event.structureId)}/e/${event.id}/apres` };
    await notificationsService.notifyMany(tx, organizers, "event_report_ready", {
      title: afterEventLabels.reportReadyTitle(event.title),
      body: afterEventLabels.reportReadyBody,
      eventId: event.id,
      data: { eventId: event.id, structureId: event.structureId },
      link,
    });
    const present = report?.data.present ?? 0;
    if (present > 0 && !event.thanksSentAt && now().getTime() <= event.endsAt.getTime() + SEGMENT_REACH_AFTER_END_MS) {
      await notificationsService.notifyMany(tx, organizers, "event_thanks_suggested", {
        title: afterEventLabels.thanksSuggestedTitle(event.title),
        body: afterEventLabels.thanksSuggestedBody(present),
        eventId: event.id,
        data: { eventId: event.id, structureId: event.structureId },
        link,
      });
    }
    after(() => notificationsService.kick());
  },

  /**
   * Tâche `event.report-refresh` (J+8) : le bilan est recalculé une seule fois, avec les avis définitifs. Rejouée,
   * elle ne fait rien (`refreshed_at` posé sous verrou). Sans bilan (événement réglé avant le lot 27), elle le crée.
   */
  async refresh(eventId: string): Promise<boolean> {
    return withTx(async (tx) => {
      const event = await eventsRepo.byId(eventId, tx).catch(() => null);
      if (!event || event.status !== "published" || !event.settledAt) return false;
      if (now() < reportRefreshAt(event)) return false;
      const [current] = await tx.select().from(eventReports).where(eq(eventReports.eventId, eventId)).for("update");
      if (current?.refreshedAt) return false;
      const data = await computeReport(tx, event);
      if (current) {
        await tx.update(eventReports).set({ data, refreshedAt: now() }).where(eq(eventReports.eventId, eventId));
      } else {
        await tx.insert(eventReports).values({ eventId, generatedAt: now(), refreshedAt: now(), data });
      }
      return true;
    });
  },

  /**
   * Balayage horaire de secours : événements réglés depuis plus de 8 jours dont le bilan n'a pas été rafraîchi (tâche
   * perdue), et réglés sans bilan (avant le lot 27). Les vieux événements (plus de 30 jours) ne sont pas repris.
   */
  async sweep(): Promise<number> {
    const t = now().getTime();
    const due = await db
      .select({ id: events.id })
      .from(events)
      .leftJoin(eventReports, eq(eventReports.eventId, events.id))
      .where(
        and(
          eq(events.status, "published"),
          sql`${events.settledAt} is not null`,
          lte(events.endsAt, new Date(t - 8 * 86_400_000)),
          gte(events.endsAt, new Date(t - REFRESH_SWEEP_HORIZON_MS)),
          isNull(eventReports.refreshedAt),
        ),
      )
      .limit(50);
    let n = 0;
    for (const { id } of due) if (await this.refresh(id)) n++;
    return n;
  },

  /** `GET /events/:id/report` : organisation seulement (propriétaire, co-organisateur actif, 2FA de session). */
  async get(v: Viewer, eventId: string): Promise<EventReportView> {
    const { e } = await requireEventReader(v, eventId);
    if (e.status === "draft") throw notFound("Événement introuvable");
    let [row] = await db.select().from(eventReports).where(eq(eventReports.eventId, e.id));
    // Réglé avant le lot 27 : calculé à la première lecture (une seule fois, sans prévenir personne).
    if (!row && e.settledAt) {
      await withTx((tx) => this.generate(tx, e));
      [row] = await db.select().from(eventReports).where(eq(eventReports.eventId, e.id));
    }
    return {
      eventId: e.id,
      refreshAt: reportRefreshAt(e).toISOString(),
      report: row
        ? {
            generatedAt: row.generatedAt.toISOString(),
            refreshedAt: row.refreshedAt?.toISOString() ?? null,
            data: row.data,
          }
        : null,
      thanks: await thanksService.state(v, e),
    };
  },
};

async function slugOf(ex: Executor, structureId: string): Promise<string> {
  const result = await ex.execute(sql`select slug from structures where id = ${structureId}`);
  return (result.rows[0] as { slug: string } | undefined)?.slug ?? "";
}
