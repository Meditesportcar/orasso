// Actualité du Journal (ARCHITECTURE-SUITE § 2.4) : « un ami va à un événement », « un ami a ajouté un véhicule ».
// Items sans push ni e-mail, livrés tout de suite (`journalOnlyNotificationTypes`), dédoublonnés.
import { socialLabels } from "@orasso/shared";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { events, notifications } from "../../db/schema";
import { formatDateTime } from "../../lib/format";
import { storage } from "../../lib/storage";
import type { Tx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { profilesRepo } from "../profiles/repo";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";
import { socialRepo } from "./repo";

async function actorOf(userId: string, tx: Tx | typeof db) {
  const p = await profilesRepo.byUserId(userId, tx);
  if (!p || p.deletedAt) return null;
  return { userId: p.userId, pseudo: p.pseudo, avatarUrl: storage.url(p.avatarKey), visibility: p.visibility };
}

export const socialJournal = {
  /**
   * Appelé par `ApplicationService.transition` quand une candidature passe à « retenue » : chaque ami de la personne
   * reçoit « <pseudo> va à <événement> », une seule fois par ami, personne et événement. Événements publiés et
   * ouverts seulement (jamais un événement sur invitation). Un ami voit tout d'un profil, public ou privé.
   */
  async friendGoingEvent(tx: Tx, app: { userId: string; eventId: string; kind: string }) {
    if (app.kind !== "vehicle") return;
    const event = await tx.query.events.findFirst({ where: eq(events.id, app.eventId) });
    if (event?.status !== "published" || event.admission === "invite_only") return;
    const actor = await actorOf(app.userId, tx);
    if (!actor) return;
    const friendIds = await socialRepo.friendIds(app.userId, tx);
    if (!friendIds.length) return;
    // Deux candidatures retenues de la même personne au même événement : une seule actualité par ami.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`journal:going:${event.id}:${app.userId}`}))`);
    const already = await tx
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          eq(notifications.type, "friend_going_event"),
          eq(notifications.eventId, event.id),
          inArray(notifications.userId, friendIds),
          sql`${notifications.data} -> 'actor' ->> 'userId' = ${app.userId}`,
        ),
      );
    const done = new Set(already.map((r) => r.userId));
    const { visibility: _v, ...person } = actor;
    for (const friendId of friendIds) {
      if (done.has(friendId)) continue;
      await notificationsService.notify(tx, friendId, "friend_going_event", {
        title: socialLabels.friendGoesTo(actor.pseudo, event.title),
        body: formatDateTime(event.startsAt),
        eventId: event.id,
        data: { actor: person, link: `/e/${event.slug}`, subjectId: event.id },
      });
    }
  },

  /**
   * Appelé à la création d'un véhicule actif : les amis d'un profil public en sont prévenus (« profil public » :
   * pour un compte privé, rien n'est annoncé). Une seule actualité par ami et par véhicule.
   */
  async friendNewVehicle(ownerId: string, vehicleId: string) {
    const actor = await actorOf(ownerId, db);
    if (actor?.visibility !== "public") return 0;
    const vehicle = await vehiclesRepo.findFullById(vehicleId);
    if (vehicle?.status !== "active") return 0;
    const friendIds = await socialRepo.friendIds(ownerId);
    if (!friendIds.length) return 0;
    const already = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          eq(notifications.type, "friend_new_vehicle"),
          inArray(notifications.userId, friendIds),
          sql`${notifications.data} ->> 'subjectId' = ${vehicleId}`,
        ),
      );
    const done = new Set(already.map((r) => r.userId));
    const { visibility: _v, ...person } = actor;
    const label = vehicleLabel(vehicle);
    let sent = 0;
    for (const friendId of friendIds) {
      if (done.has(friendId)) continue;
      await notificationsService.notify(db, friendId, "friend_new_vehicle", {
        title: socialLabels.friendNewVehicle(actor.pseudo, label),
        body: label,
        data: { actor: person, link: `/v/${vehicleId}`, subjectId: vehicleId, vehicleId },
      });
      sent++;
    }
    if (sent) notificationsService.kick();
    return sent;
  },
};
