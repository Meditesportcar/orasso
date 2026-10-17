// Avant-première des hauts grades (lot 25, ARCHITECTURE-SUITE § 9.2) : tâche `event.high-grade-preview`, planifiée à
// `registrations_open_at − high_grade_preview_hours`. Notification `preview_open` aux personnes de grade ≥ seuil dont le
// centre du premier département est dans leur rayon, une seule fois par événement (les abonnés qui l'ont déjà reçue ne
// la reçoivent pas deux fois). Exclus : événements sur invitation, bannis, comptes supprimés.
import { distanceKm, grades, profilePosition, registrationOpensAt } from "@orasso/shared";
import { and, inArray, isNull, sql } from "drizzle-orm";

import { notifications, profiles, structureBans } from "../../db/schema";
import { now } from "../../lib/deps";
import { type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { type EventRow, eventsRepo } from "./repo";

const sameInstant = (a: Date, iso: unknown) =>
  typeof iso === "string" && Math.abs(a.getTime() - Date.parse(iso)) < 60_000;

/** Instant de l'avant-première des hauts grades, ou `null` si l'organisateur ne l'a pas activée. */
/** Verrou des notifications d'avant-première d'un événement (hauts grades et abonnés). */
export async function lockPreview(tx: Tx, eventId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`preview:${eventId}`}))`);
}

export function highGradePreviewAt(e: EventRow): Date | null {
  if (e.highGradePreviewHours <= 0) return null;
  return registrationOpensAt(e, { follower: false, grade: e.highGradeMin });
}

export const highGradePreview = {
  /** Renvoie le nombre de personnes prévenues. */
  async notify(data: { eventId: string; at: string }): Promise<number> {
    const e = await eventsRepo.byId(data.eventId).catch(() => null);
    if (e?.status !== "published" || e.admission === "invite_only") return 0;
    const at = highGradePreviewAt(e);
    if (!at || !sameInstant(at, data.at) || e.startsAt <= now() || e.lat === null || e.lng === null) return 0;
    const position = { lat: e.lat, lng: e.lng };
    const eligible = grades.slice(grades.indexOf(e.highGradeMin));
    // Sous un verrou par événement partagé avec l'avant-première des abonnés : deux passages simultanés (tâche rejouée,
    // abonnés au même instant) ne notifient jamais deux fois la même personne.
    return withTx(async (tx, after) => {
      await lockPreview(tx, e.id);
      const candidates = await tx
        .select({ userId: profiles.userId, departments: profiles.departments, radiusKm: profiles.radiusKm })
        .from(profiles)
        .where(
          and(
            inArray(profiles.grade, eligible),
            isNull(profiles.deletedAt),
            sql`not exists (select 1 from ${structureBans} b where b.user_id = ${profiles.userId} and b.structure_id = ${e.structureId})`,
            sql`not exists (select 1 from ${notifications} n where n.user_id = ${profiles.userId} and n.type = 'preview_open' and n.event_id = ${e.id})`,
          ),
        );
      const targets = candidates.filter((c) => {
        const home = profilePosition(c.departments);
        return home !== null && distanceKm(home, position) <= c.radiusKm;
      });
      if (!targets.length) return 0;
      await notificationsService.notifyMany(
        tx,
        targets.map((t) => t.userId),
        "preview_open",
        {
          title: "Inscriptions en avant-première",
          body: `Avantage de ton grade : les inscriptions à « ${e.title} » sont ouvertes pour toi avant tout le monde.`,
          eventId: e.id,
          data: { eventId: e.id },
          link: { label: "Candidater", path: `/e/${e.slug}` },
        },
      );
      after(() => notificationsService.kick());
      return targets.length;
    });
  },
};
