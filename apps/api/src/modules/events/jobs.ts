// Tâches liées à un événement (ARCHITECTURE.md § 2.9). Chaque tâche porte l'instant prévu (`at`) : si l'événement
// a changé entre-temps, l'instant recalculé diffère et la tâche ne fait rien (une nouvelle a été planifiée).
import { addDays, fromWallTime, isMultiDay, lockAt, registrationOpensAt, settleAt, wallTime } from "@orasso/shared";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, notifications, structureFollows } from "../../db/schema";
import { deps, now } from "../../lib/deps";
import { formatDateTime } from "../../lib/format";
import { withTx } from "../../lib/tx";
import { applicationsService } from "../applications/service";
import { notificationsService } from "../notifications/service";
import { weatherService } from "../weather/service";
import { daysRepo } from "./days";
import { highGradePreviewAt, lockPreview } from "./high-grade";
import { type EventRow, eventsRepo } from "./repo";

const DAY = 86_400_000;

function reminderWeekAt(e: EventRow) {
  return new Date(e.startsAt.getTime() - 7 * DAY);
}

/** Veille à 18:00, heure de Paris (du premier jour ; lot 26 : d'un jour donné avec `startsAt`). */
function reminderEveAt(e: Pick<EventRow, "startsAt" | "timezone">, startsAt: Date = e.startsAt) {
  return fromWallTime({ ...addDays(wallTime(startsAt, e.timezone), -1), hour: 18, minute: 0 }, e.timezone);
}

/** (Re)planifie les tâches d'un événement publié, après publication ou changement de dates. */
export async function scheduleEventJobs(e: EventRow) {
  if (e.status !== "published") return;
  const t = now();
  const plan: [Parameters<typeof deps.jobs.send>[0], Date][] = [
    ["event.lock", lockAt(e)],
    ["event.reminder-week", reminderWeekAt(e)],
    ["event.reminder-eve", reminderEveAt(e)],
    // Points et malus à J+2 (lot 06).
    ["event.settle", settleAt(e)],
  ];
  if (e.previewHours > 0) plan.push(["event.preview-open", registrationOpensAt(e, true)]);
  // Avant-première des hauts grades (lot 25, § 9.2).
  const highGrade = highGradePreviewAt(e);
  if (highGrade) plan.push(["event.high-grade-preview", highGrade]);
  for (const [name, at] of plan) {
    // Verrouillage et règlement toujours planifiés (même passés : la tâche agit aussitôt, une seule fois).
    const always = name === "event.lock" || name === "event.settle";
    if (always || at > t) await deps.jobs.send(name, { eventId: e.id, at: at.toISOString() }, at);
  }
  // Plusieurs jours (lot 26, § 10) : un rappel la veille de chaque jour suivant, pour les candidatures de ce jour (celles
  // de tout l'événement et du premier jour ont le rappel de la veille du premier jour, ci-dessus). Verrouillage unique au
  // premier jour (S28) et règlement à la fin du dernier jour + 48 h : les bornes de l'événement suffisent.
  const days = await daysRepo.list(e.id);
  if (isMultiDay(days)) {
    for (const day of days.slice(1)) {
      const at = reminderEveAt(e, day.startsAt);
      if (at > t)
        await deps.jobs.send("event.reminder-eve", { eventId: e.id, at: at.toISOString(), dayId: day.id }, at);
    }
  }
}

const sameInstant = (a: Date, iso: unknown) =>
  typeof iso === "string" && Math.abs(a.getTime() - Date.parse(iso)) < 60_000;

/**
 * Retenus d'un événement. Plusieurs jours (lot 26) : `dayId` = ceux de ce jour seulement ; `firstDayId` = ceux de tout
 * l'événement et du premier jour (rappel de la veille du premier jour).
 */
async function acceptedUserIds(eventId: string, scope: { dayId?: string; firstDayId?: string } = {}) {
  const rows = await db
    .selectDistinct({ userId: applications.userId })
    .from(applications)
    .where(
      and(
        eq(applications.eventId, eventId),
        eq(applications.status, "accepted"),
        scope.dayId ? eq(applications.eventDayId, scope.dayId) : undefined,
        scope.firstDayId
          ? or(isNull(applications.eventDayId), eq(applications.eventDayId, scope.firstDayId))
          : undefined,
      ),
    );
  return rows.map((r) => r.userId);
}

export const eventJobs = {
  async lock(data: { eventId: string }) {
    return applicationsService.lockEvent(data.eventId);
  },

  /** Avant-première : les abonnés de la structure peuvent candidater. */
  async previewOpen(data: { eventId: string; at: string }) {
    const e = await eventsRepo.byId(data.eventId).catch(() => null);
    if (e?.status !== "published" || !sameInstant(registrationOpensAt(e, true), data.at)) return false;
    if (e.admission === "invite_only") return false;
    await withTx(async (tx, after) => {
      // Abonnés déjà prévenus par l'avant-première des hauts grades (lot 25) : pas deux fois (même verrou).
      await lockPreview(tx, e.id);
      const followers = await tx
        .select({ userId: structureFollows.userId })
        .from(structureFollows)
        .where(
          and(
            eq(structureFollows.structureId, e.structureId),
            sql`not exists (select 1 from ${notifications} n where n.user_id = ${structureFollows.userId} and n.type = 'preview_open' and n.event_id = ${e.id})`,
          ),
        );
      for (const f of followers) {
        await notificationsService.notify(tx, f.userId, "preview_open", {
          title: "Inscriptions en avant-première",
          body: `Tu suis cette organisation : les inscriptions à « ${e.title} » sont ouvertes pour toi avant tout le monde.`,
          eventId: e.id,
          data: { eventId: e.id },
          link: { label: "Candidater", path: `/e/${e.slug}` },
        });
      }
      after(() => notificationsService.kick());
    });
    return true;
  },

  /** Rappel par e-mail une semaine avant, toujours (docs/01). */
  async reminderWeek(data: { eventId: string; at: string }) {
    const e = await eventsRepo.byId(data.eventId).catch(() => null);
    if (e?.status !== "published" || !sameInstant(reminderWeekAt(e), data.at)) return false;
    await notifyAccepted(
      e,
      "event_reminder_week",
      "Dans une semaine",
      `« ${e.title} », ${formatDateTime(e.startsAt)}.`,
    );
    return true;
  },

  /**
   * Rappel la veille à 18:00, avec la météo annoncée quand on la connaît (lot 28). Plusieurs jours (lot 26) : sans
   * `dayId`, veille du premier jour, pour les candidatures de tout l'événement et du premier jour ; avec `dayId`, veille
   * de ce jour, pour ses candidatures. Rejouée, la tâche ne prévient personne deux fois.
   */
  async reminderEve(data: { eventId: string; at: string; dayId?: string }) {
    const e = await eventsRepo.byId(data.eventId).catch(() => null);
    if (e?.status !== "published") return false;
    const days = await daysRepo.list(e.id);
    const multi = isMultiDay(days);
    if (data.dayId) {
      const day = multi ? days.find((d) => d.id === data.dayId) : undefined;
      // Jour retiré, déplacé, ou premier jour devenu le seul rappel : une autre tâche a été planifiée.
      if (!day || day.id === days[0]?.id || !sameInstant(reminderEveAt(e, day.startsAt), data.at)) return false;
      const body = [`« ${e.title} », ${formatDateTime(day.startsAt)}.`, e.instructions ?? ""]
        .filter(Boolean)
        .join("\n");
      await notifyAccepted(e, "event_reminder_eve", "C'est demain", body, { dayId: day.id });
      return true;
    }
    if (!sameInstant(reminderEveAt(e), data.at)) return false;
    const weather = await weatherService.reminderLine(e);
    const body = [`« ${e.title} », ${formatDateTime(e.startsAt)}.`, weather ?? "", e.instructions ?? ""]
      .filter(Boolean)
      .join("\n");
    await notifyAccepted(e, "event_reminder_eve", "C'est demain", body, multi ? { firstDayId: days[0]?.id } : {});
    return true;
  },
};

async function notifyAccepted(
  e: EventRow,
  type: "event_reminder_week" | "event_reminder_eve",
  title: string,
  body: string,
  scope: { dayId?: string; firstDayId?: string } = {},
) {
  const users = await acceptedUserIds(e.id, scope);
  await withTx(async (tx, after) => {
    for (const userId of users) {
      if (scope.dayId) {
        // Rappel d'un jour (lot 26) rejoué ou replanifié : une seule fois par personne et par jour.
        const [sent] = await tx
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.type, type),
              eq(notifications.eventId, e.id),
              sql`${notifications.data} ->> 'dayId' = ${scope.dayId}`,
            ),
          )
          .limit(1);
        if (sent) continue;
      }
      await notificationsService.notify(tx, userId, type, {
        title,
        body,
        eventId: e.id,
        eventStartsAt: e.startsAt,
        data: scope.dayId ? { eventId: e.id, dayId: scope.dayId } : { eventId: e.id },
        link: { label: "Ouvrir mes accès", path: "/app/acces" },
      });
    }
    after(() => notificationsService.kick());
  });
}
