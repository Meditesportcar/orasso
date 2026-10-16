// Notification « événement près de chez toi » (lot 15, ARCHITECTURE-SUITE § 1.4, docs/01 « Centres d'intérêt »).
// Tâche `event.notify-nearby`, planifiée à la publication : profils dont un centre d'intérêt est une catégorie de
// l'événement et dont le centre du premier département est à moins de `radius_km`, hors abonnés de la structure (déjà
// prévenus par `new_event_followed`), une seule fois par événement (index unique partiel sur `notifications`).
// S4 : un événement sans catégorie ne notifie personne. Exclus : événements sur invitation ou déjà commencés,
// structures suspendues ou supprimées, personnes bannies par la structure.
import { distanceKm, profilePosition } from "@orasso/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  notifications,
  profileInterests,
  profiles,
  structureBans,
  structureFollows,
  structures,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { formatDateTime } from "../../lib/format";
import { withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { eventsRepo } from "./repo";

export const nearbyService = {
  /** Renvoie le nombre de personnes notifiées. */
  async notifyNearby(eventId: string): Promise<number> {
    const e = await eventsRepo.byId(eventId).catch(() => null);
    if (e?.status !== "published" || e.admission === "invite_only" || e.startsAt <= now()) return 0;
    const structure = await db.query.structures.findFirst({ where: eq(structures.id, e.structureId) });
    if (!structure || structure.deletedAt || structure.verification === "suspended") return 0;
    const categoryIds = e.criteria?.categoryIds ?? [];
    if (!categoryIds.length || e.lat === null || e.lng === null) return 0;
    const position = { lat: e.lat, lng: e.lng };

    const candidates = await db
      .selectDistinct({ userId: profiles.userId, departments: profiles.departments, radiusKm: profiles.radiusKm })
      .from(profiles)
      .innerJoin(profileInterests, eq(profileInterests.userId, profiles.userId))
      .where(
        and(
          inArray(profileInterests.categoryId, categoryIds),
          isNull(profiles.deletedAt),
          sql`not exists (select 1 from ${structureBans} b where b.user_id = ${profiles.userId} and b.structure_id = ${e.structureId})`,
          sql`not exists (select 1 from ${structureFollows} f where f.user_id = ${profiles.userId} and f.structure_id = ${e.structureId})`,
          sql`not exists (select 1 from ${notifications} n where n.user_id = ${profiles.userId} and n.type = 'event_nearby_interest' and n.event_id = ${e.id})`,
        ),
      );
    const targets = candidates.filter((c) => {
      const home = profilePosition(c.departments);
      return home !== null && distanceKm(home, position) <= c.radiusKm;
    });
    if (!targets.length) return 0;

    // Déjà notifiés exclus ci-dessus ; si deux passages se croisaient, l'index unique `(user_id, type, event_id)`
    // ferait échouer le second, que pg-boss rejoue ensuite sans doublon.
    await withTx(async (tx, after) => {
      for (const t of targets) {
        await notificationsService.notify(tx, t.userId, "event_nearby_interest", {
          title: "Un événement près de chez toi",
          body: `« ${e.title} », ${formatDateTime(e.startsAt)}${e.city ? `, ${e.city}` : ""}.`,
          eventId: e.id,
          data: { eventId: e.id },
          link: { label: "Voir l'événement", path: `/e/${e.slug}` },
        });
      }
      after(() => notificationsService.kick());
    });
    return targets.length;
  },
};
