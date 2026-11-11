// Préférence de notification par événement et aperçu des destinataires (vague R8, lot R8n1, ARCHITECTURE-R8 § 2.7).
// L'Essentiel n'a pas de réglage ; seules les Nouveautés de l'événement se coupent, et seulement avec une place.
import { type EventNotificationPrefsView, eventNotifyLabels, type NotifyPreview } from "@orasso/shared";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { eventNotificationPrefs, events } from "../../db/schema";
import { requireOrganizer } from "../../lib/access";
import { AppError, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { eventPlaceHolderIds, hasPlace } from "../events/place";
import { eventsRepo } from "../events/repo";

/** Événement publié ou annulé (là où une personne a pu avoir une place) ; sinon 404, sans rien dire d'un brouillon. */
async function visibleEvent(eventId: string) {
  const [row] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), inArray(events.status, ["published", "cancelled"])));
  if (!row) throw notFound("Événement introuvable");
}

export const eventNotificationsService = {
  /** Les Nouveautés d'un événement pour moi : activées sans ligne. */
  async get(userId: string, eventId: string): Promise<EventNotificationPrefsView> {
    await visibleEvent(eventId);
    const row = await db.query.eventNotificationPrefs.findFirst({
      where: and(eq(eventNotificationPrefs.userId, userId), eq(eventNotificationPrefs.eventId, eventId)),
      columns: { news: true },
    });
    return { news: row?.news ?? true, hasPlace: await hasPlace(db, eventId, userId) };
  },

  /** Règle les Nouveautés de l'événement : seulement avec une place (403 `no_place`). */
  async set(userId: string, eventId: string, news: boolean): Promise<EventNotificationPrefsView> {
    await visibleEvent(eventId);
    if (!(await hasPlace(db, eventId, userId))) {
      throw new AppError(403, "no_place", eventNotifyLabels.noPlace);
    }
    await db
      .insert(eventNotificationPrefs)
      .values({ userId, eventId, news })
      .onConflictDoUpdate({
        target: [eventNotificationPrefs.userId, eventNotificationPrefs.eventId],
        set: { news, updatedAt: new Date() },
      });
    return { news, hasPlace: true };
  },

  /**
   * « 148 inscrits seront prévenus » : le nombre de personnes qui ont une place à l'événement, c'est-à-dire exactement la
   * liste à qui part un changement de date ou de lieu (`event_updated`). Responsables de la structure seulement.
   */
  async preview(v: Viewer, eventId: string): Promise<NotifyPreview> {
    const e = await eventsRepo.byId(eventId);
    await requireOrganizer(v, e.structureId);
    return { recipients: (await eventPlaceHolderIds(db, eventId)).length };
  },
};
