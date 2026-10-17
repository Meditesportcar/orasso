// Relance à la demande d'un membre du staff qui n'a pas dit s'il serait là (lot 22, bouton « Relancer » de la casquette
// Organisateur de l'appli). Même notification que la tâche quotidienne `staff.remind` ; au plus une relance par heure
// et par personne, jamais le jour J (le staff est alors sur place) ni après l'événement.
import { isEventDay } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";

import { eventStaff } from "../../db/schema";
import { requireOrganizer } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, notFound } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { eventsRepo } from "../events/repo";
import { notificationsService } from "../notifications/service";
import { staffService } from "./service";

const MIN_GAP_MS = 60 * 60 * 1000;

export const staffRemindService = {
  /** Organisateur : relance un membre du staff de l'événement dont la présence est inconnue. */
  async remind(v: Viewer, eventId: string, userId: string) {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    const t = now();
    if (event.status !== "published" || t >= event.endsAt) {
      throw new AppError(409, "conflict", "On ne relance que pour un événement publié et pas encore fini.");
    }
    if (isEventDay(event.startsAt, t)) {
      throw new AppError(409, "conflict", "Le jour J, le staff est sur place : plus de relance.");
    }
    const member = (await staffService.members(event)).find((m) => m.userId === userId);
    if (!member) throw notFound("Ce membre n'est pas dans le staff de l'événement");
    if (member.presence !== "unknown") {
      throw new AppError(409, "conflict", "Cette personne a déjà répondu.");
    }
    if (member.lastRemindedAt && t.getTime() - member.lastRemindedAt.getTime() < MIN_GAP_MS) {
      throw new AppError(429, "rate_limited", "Déjà relancé il y a moins d'une heure.", {
        retryAfter: Math.ceil((MIN_GAP_MS - (t.getTime() - member.lastRemindedAt.getTime())) / 1000),
      });
    }
    await withTx(async (tx, after) => {
      await notificationsService.notify(tx, userId, "staff_presence_reminder", {
        title: "Seras-tu là ?",
        body: `« ${event.title} », ${formatDateTime(event.startsAt)} : dis à l'équipe si tu seras là.`,
        eventId: event.id,
        eventStartsAt: event.startsAt,
        data: { eventId: event.id, screen: "staff" },
        link: { label: "Répondre", path: "/app/acces" },
      });
      await tx
        .update(eventStaff)
        .set({ reminderCount: sql`${eventStaff.reminderCount} + 1`, lastRemindedAt: t })
        .where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.userId, userId)));
      after(() => notificationsService.kick());
    });
    return { reminded: true };
  },
};
