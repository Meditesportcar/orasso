// Tâches liées à un événement (ARCHITECTURE.md § 2.9). Chaque tâche porte l'instant prévu (`at`) : si l'événement
// a changé entre-temps, l'instant recalculé diffère et la tâche ne fait rien (une nouvelle a été planifiée).
import { addDays, fromWallTime, lockAt, registrationOpensAt, settleAt, wallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, structureFollows } from "../../db/schema";
import { deps, now } from "../../lib/deps";
import { formatDateTime } from "../../lib/format";
import { withTx } from "../../lib/tx";
import { applicationsService } from "../applications/service";
import { notificationsService } from "../notifications/service";
import { type EventRow, eventsRepo } from "./repo";

const DAY = 86_400_000;

function reminderWeekAt(e: EventRow) {
  return new Date(e.startsAt.getTime() - 7 * DAY);
}

/** Veille à 18:00, heure de Paris. */
function reminderEveAt(e: EventRow) {
  return fromWallTime({ ...addDays(wallTime(e.startsAt, e.timezone), -1), hour: 18, minute: 0 }, e.timezone);
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
  for (const [name, at] of plan) {
    // Verrouillage et règlement toujours planifiés (même passés : la tâche agit aussitôt, une seule fois).
    const always = name === "event.lock" || name === "event.settle";
    if (always || at > t) await deps.jobs.send(name, { eventId: e.id, at: at.toISOString() }, at);
  }
}

const sameInstant = (a: Date, iso: unknown) =>
  typeof iso === "string" && Math.abs(a.getTime() - Date.parse(iso)) < 60_000;

async function acceptedUserIds(eventId: string) {
  const rows = await db
    .selectDistinct({ userId: applications.userId })
    .from(applications)
    .where(and(eq(applications.eventId, eventId), eq(applications.status, "accepted")));
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
    const followers = await db
      .select({ userId: structureFollows.userId })
      .from(structureFollows)
      .where(eq(structureFollows.structureId, e.structureId));
    await withTx(async (tx, after) => {
      for (const f of followers) {
        await notificationsService.notify(tx, f.userId, "preview_open", {
          title: "Inscriptions en avant-première",
          body: `Tu suis l'organisateur : les inscriptions à « ${e.title} » sont ouvertes pour toi avant tout le monde.`,
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

  /** Rappel la veille à 18:00 (météo : plus tard). */
  async reminderEve(data: { eventId: string; at: string }) {
    const e = await eventsRepo.byId(data.eventId).catch(() => null);
    if (e?.status !== "published" || !sameInstant(reminderEveAt(e), data.at)) return false;
    const body = [`« ${e.title} », ${formatDateTime(e.startsAt)}.`, e.instructions ?? ""].filter(Boolean).join("\n");
    await notifyAccepted(e, "event_reminder_eve", "C'est demain", body);
    return true;
  },
};

async function notifyAccepted(
  e: EventRow,
  type: "event_reminder_week" | "event_reminder_eve",
  title: string,
  body: string,
) {
  const users = await acceptedUserIds(e.id);
  await withTx(async (tx, after) => {
    for (const userId of users) {
      await notificationsService.notify(tx, userId, type, {
        title,
        body,
        eventId: e.id,
        eventStartsAt: e.startsAt,
        data: { eventId: e.id },
        link: { label: "Ouvrir mes accès", path: "/app/acces" },
      });
    }
    after(() => notificationsService.kick());
  });
}
