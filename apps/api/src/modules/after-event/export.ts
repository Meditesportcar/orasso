// Export des participants d'un événement, tracé (lot 27, ARCHITECTURE-SUITE § 11.3, S30). Réservé à l'organisation
// (propriétaire ou co-organisateur actif, 2FA de la session, structure et compte non suspendus) ; toujours un motif
// d'au moins 10 caractères, avant comme après J+7. Chaque export écrit une ligne `participant_exports` (qui, quand,
// combien de lignes, pourquoi, depuis quelle adresse) et une ligne `participants.export` du journal d'administration,
// AVANT que le fichier soit rendu. Contenu : ce que l'organisateur voit déjà au tri (nom, prénom, e-mail, téléphone,
// plaque), pour les retenus et les entrés ; jamais un compte supprimé ou banni, jamais les notes internes. Le fichier
// est marqué (nom et dernière ligne) et neutralisé contre l'injection de formule.
import {
  applicationStatusLabels,
  CSV_BOM,
  checkinMethodLabels,
  csvLine,
  type ExportQuery,
  exportFileName,
  wallTime,
} from "@orasso/shared";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  adminAuditLog,
  applications,
  categories,
  checkins,
  crews,
  eventZones,
  participantExports,
  pointEntries,
  profiles,
  user,
  vehicleCategories,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { requireEventSpeaker } from "../communication/guards";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";

export const EXPORT_COLUMNS = [
  "Pseudo",
  "Nom",
  "Prénom",
  "E-mail",
  "Téléphone",
  "Véhicule",
  "Plaque",
  "Catégorie",
  "Statut",
  "Zone",
  "Entrée (heure)",
  "Entrée (méthode)",
  "Désistement",
  "Points",
  "Crew",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");
/** « 2026-10-17 19:05 » (heure de Paris). */
function localStamp(d: Date): string {
  const w = wallTime(d);
  return `${w.year}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}`;
}
const localDay = (d: Date) => localStamp(d).slice(0, 10);

export type ParticipantsExport = { fileName: string; csv: string; rowCount: number };

export const exportService = {
  /** `POST /events/:id/participants/export {reason}` */
  async participants(
    v: Viewer,
    eventId: string,
    input: ExportQuery,
    ctx: { ip: string | null; userAgent: string | null },
  ): Promise<ParticipantsExport> {
    const { e, s } = await requireEventSpeaker(v, eventId);
    if (e.status === "draft") throw new AppError(404, "not_found", "Événement introuvable");
    rateLimit("participantsExport", v.user.id);
    const at = now();

    const rows = await db
      .select({
        app: applications,
        pseudo: profiles.pseudo,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        phone: profiles.phone,
        email: user.email,
        enteredAt: checkins.checkedInAt,
        method: checkins.method,
        zone: eventZones.name,
        crew: crews.name,
      })
      .from(applications)
      .innerJoin(profiles, eq(profiles.userId, applications.userId))
      .innerJoin(user, eq(user.id, applications.userId))
      .leftJoin(checkins, eq(checkins.applicationId, applications.id))
      .leftJoin(eventZones, eq(eventZones.id, applications.zoneId))
      .leftJoin(crews, eq(crews.id, applications.crewId))
      .where(
        and(
          eq(applications.eventId, e.id),
          eq(applications.kind, "vehicle"),
          // Jamais un compte supprimé (anonymisé) ni banni de la plateforme.
          isNull(profiles.deletedAt),
          isNull(profiles.bannedAt),
          // Une venue en crew jamais confirmée n'est pas visible de l'organisation.
          sql`(${applications.crewApplicationId} is null or ${applications.memberConfirmedAt} is not null)`,
          // Les retenus, les entrés, et ceux qui se sont désistés après le verrouillage.
          sql`(${applications.status} = 'accepted' or ${checkins.id} is not null or ${applications.withdrawnAfterLock})`,
        ),
      )
      .orderBy(asc(profiles.pseudo), asc(applications.id));

    const vehicleIds = rows.flatMap((r) => (r.app.vehicleId ? [r.app.vehicleId] : []));
    const vehicleRows = await vehiclesRepo.findFullByIds([...new Set(vehicleIds)]);
    const vehicleById = new Map(vehicleRows.map((x) => [x.id, x]));
    const cats = vehicleIds.length
      ? await db
          .select({ vehicleId: vehicleCategories.vehicleId, label: categories.label })
          .from(vehicleCategories)
          .innerJoin(categories, eq(categories.id, vehicleCategories.categoryId))
          .where(inArray(vehicleCategories.vehicleId, [...new Set(vehicleIds)]))
          .orderBy(asc(categories.position), asc(categories.label))
      : [];
    const appIds = rows.map((r) => r.app.id);
    const points = appIds.length
      ? await db
          .select({ applicationId: pointEntries.applicationId, total: sql<number>`sum(${pointEntries.points})::int` })
          .from(pointEntries)
          .where(and(eq(pointEntries.eventId, e.id), inArray(pointEntries.applicationId, appIds)))
          .groupBy(pointEntries.applicationId)
      : [];
    const pointsByApp = new Map(points.map((p) => [p.applicationId, p.total]));

    const lines = rows.map((r) => {
      const veh = r.app.vehicleId ? vehicleById.get(r.app.vehicleId) : undefined;
      return csvLine([
        r.pseudo,
        r.lastName,
        r.firstName,
        r.email,
        r.phone,
        veh ? vehicleLabel(veh) : null,
        veh?.plate ?? null,
        cats
          .filter((c) => c.vehicleId === r.app.vehicleId)
          .map((c) => c.label)
          .join(", "),
        applicationStatusLabels[r.app.status],
        r.zone,
        r.enteredAt ? localStamp(r.enteredAt) : null,
        r.method ? checkinMethodLabels[r.method] : null,
        r.app.withdrawnAt
          ? `${localStamp(r.app.withdrawnAt)}${r.app.withdrawnAfterLock ? " (après le verrouillage)" : ""}`
          : null,
        pointsByApp.get(r.app.id) ?? null,
        r.crew,
      ]);
    });

    // Trace d'abord : si elle ne s'écrit pas, rien n'est rendu.
    await db.transaction(async (tx) => {
      await tx.insert(participantExports).values({
        eventId: e.id,
        structureId: s.id,
        userId: v.user.id,
        reason: input.reason,
        rowCount: rows.length,
        ip: ctx.ip,
        createdAt: at,
      });
      await tx.insert(adminAuditLog).values({
        actorUserId: v.user.id,
        action: "participants.export",
        targetType: "event",
        targetId: e.id,
        structureId: s.id,
        reason: input.reason,
        ip: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 300) ?? null,
        createdAt: at,
      });
    });

    const mark = csvLine([
      `Export Orasso · ${s.name} · ${localStamp(at)} · ${v.profile.pseudo} · motif : ${input.reason}`,
    ]);
    const csv = `${CSV_BOM}${[csvLine(EXPORT_COLUMNS), ...lines, mark].join("\r\n")}\r\n`;
    return { fileName: exportFileName(e.slug, localDay(at)), csv, rowCount: rows.length };
  },
};
