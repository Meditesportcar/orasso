// Notification « événement près de chez toi » (lot 15, ARCHITECTURE-SUITE § 1.4, docs/01 « Centres d'intérêt »).
// Tâche `event.notify-nearby`, planifiée à la publication : profils dont un centre d'intérêt est une catégorie de
// l'événement et dont le centre du premier département est à moins de `radius_km`, hors abonnés de la structure (déjà
// prévenus par `new_event_followed`), une seule fois par événement (index unique partiel sur `notifications`).
// S4 : un événement sans catégorie ne notifie aucun passionné qui s'appuie sur ses centres d'intérêt.
// Lot M6, tour 2 : les types d'événements choisis dans « Tes préférences » (`profiles.preferred_formats`, vide = tous)
// s'appliquent aussi ici ; un compte sans centre d'intérêt mais avec des types choisis est prévenu sur ses types et sa
// distance (sans centre d'intérêt et sans type, rien : comportement d'origine). Exclus : événements sur invitation ou déjà commencés,
// structures suspendues ou supprimées, personnes bannies par la structure.
import { distanceKm, profilePosition } from "@orasso/shared";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

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

/**
 * Règle du coordinateur (23/10) : l'alerte part toujours des départements choisis. Sans département, aucune alerte.
 * « Partout » (adiusKm null) lève seulement la limite de distance, à l'intérieur de ces départements : l'événement
 * doit être dans l'un d'eux. Avec une distance : le centre du coin (départements) à moins de adiusKm de l'événement,
 * jamais le GPS.
 */
export function nearbyTarget(
  c: { departments: string[]; radiusKm: number | null },
  e: { department: string | null; position: { lat: number; lng: number } },
): boolean {
  if (c.departments.length === 0) return false;
  if (c.radiusKm === null) return e.department !== null && c.departments.includes(e.department);
  const home = profilePosition(c.departments);
  return home !== null && distanceKm(home, e.position) <= c.radiusKm;
}

export const nearbyService = {
  /** Renvoie le nombre de personnes notifiées. */
  async notifyNearby(eventId: string): Promise<number> {
    const e = await eventsRepo.byId(eventId).catch(() => null);
    if (e?.status !== "published" || e.admission === "invite_only" || e.startsAt <= now()) return 0;
    const structure = await db.query.structures.findFirst({ where: eq(structures.id, e.structureId) });
    if (!structure || structure.deletedAt || structure.verification === "suspended") return 0;
    const categoryIds = e.criteria?.categoryIds ?? [];
    if (e.lat === null || e.lng === null) return 0;
    const position = { lat: e.lat, lng: e.lng };

    const candidates = await db
      .select({ userId: profiles.userId, departments: profiles.departments, radiusKm: profiles.radiusKm })
      .from(profiles)
      .where(
        and(
          or(
            // Centre d'intérêt = une catégorie de l'événement.
            categoryIds.length
              ? sql`exists (select 1 from ${profileInterests} i where i.user_id = ${profiles.userId} and ${inArray(sql`i.category_id`, categoryIds)})`
              : undefined,
            // Sans aucun centre d'intérêt mais avec des types choisis : les types (ci-dessous) et la distance suffisent.
            sql`(not exists (select 1 from ${profileInterests} i where i.user_id = ${profiles.userId}) and cardinality(${profiles.preferredFormats}) > 0)`,
          ),
          // Types choisis : vide = tous ; sinon le format de l'événement doit en faire partie.
          sql`(cardinality(${profiles.preferredFormats}) = 0 or ${e.format} = any(${profiles.preferredFormats}))`,
          isNull(profiles.deletedAt),
          sql`not exists (select 1 from ${structureBans} b where b.user_id = ${profiles.userId} and b.structure_id = ${e.structureId})`,
          sql`not exists (select 1 from ${structureFollows} f where f.user_id = ${profiles.userId} and f.structure_id = ${e.structureId})`,
          sql`not exists (select 1 from ${notifications} n where n.user_id = ${profiles.userId} and n.type = 'event_nearby_interest' and n.event_id = ${e.id})`,
        ),
      );
    const targets = candidates.filter((c) => nearbyTarget(c, { department: e.department, position }));
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
