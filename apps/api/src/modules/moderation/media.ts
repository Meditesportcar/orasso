// Média d'un contenu signalé (lot R7e1, ARCHITECTURE-R7 § 3 « Modération ») : la file de modération montre la photo
// (ou la vidéo) d'une publication du Fil ou d'une story signalée, par une route réservée aux modérateurs, jamais par
// une adresse publique. Un contenu = un lecteur inscrit ici par le module qui le possède (`feed_post` : le Fil ;
// `story` : le lot R7f1 s'inscrit avec `registerReportMedia("story", …)`). Consultation tracée, jamais mise en cache.
import type { ReportTarget } from "@orasso/shared";
import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { adminAuditLog, reports } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";
import { audit } from "../admin/audit";

/** Une image (en mémoire) ou une vidéo (fichier du disque, servi par morceaux : jamais chargé). */
export type ReportMedia = { data: Buffer; contentType: string } | { key: string; size: number; contentType: string };
/** Rend le média `name` du contenu visé par ce signalement, ou `null` (absent, ou pas un média de ce contenu). */
export type ReportMediaReader = (report: { id: string; targetId: string }, name: string) => Promise<ReportMedia | null>;

const readers = new Map<ReportTarget, ReportMediaReader>();

export function registerReportMedia(target: ReportTarget, reader: ReportMediaReader) {
  readers.set(target, reader);
}

/** Motif de la ligne d'audit d'une consultation de vidéo (distingue la vidéo de la vignette du même dossier). */
const VIDEO_REASON = "vidéo";

/** Nom de fichier accepté : identifiant hexadécimal (avec tirets), extension d'image ou de vidéo. */
const NAME_RE = /^[0-9a-f-]{8,64}\.(webp|jpg|png|mp4)$/;

/** Adresse d'un média dans le dossier d'un signalement (modération seulement). */
export const reportMediaUrl = (reportId: string, name: string) => `/api/admin/reports/${reportId}/media/${name}`;

/**
 * `GET /admin/reports/:id/media/:name` : un média du contenu visé par ce signalement, pour un modérateur (ou un super
 * administrateur). Rien d'autre : ni un autre signalement, ni un contenu sans lecteur.
 */
export async function reportMedia(v: Viewer, reportId: string, name: string): Promise<ReportMedia> {
  await requirePlatformRole(v, "moderator");
  if (!NAME_RE.test(name)) throw notFound("Média introuvable");
  const [report] = await db
    .select({ id: reports.id, type: reports.targetType, targetId: reports.targetId })
    .from(reports)
    .where(eq(reports.id, reportId));
  const reader = report ? readers.get(report.type) : undefined;
  if (!report || !reader) throw notFound("Média introuvable");
  const media = await reader({ id: report.id, targetId: report.targetId }, name);
  if (!media) throw notFound("Média introuvable");
  // Une consultation = une ligne, pas une par morceau (lot R7g, tours 3 et 4). Une image : une ligne par requête, comme avant.
  // Une vidéo se lit par dizaines de requêtes `Range` : le premier accès de ce modérateur à ce dossier est tracé **quel que soit
  // l'en-tête** (absent, `bytes=1-`, suffixe, invalide : l'audit ne dépend jamais de la façon dont le fichier est servi), et
  // les morceaux suivants depuis moins d'une minute n'ajoutent rien. Le contrôle et l'écriture sont atomiques (verrou de
  // transaction sur modérateur + dossier). Relancer la lecture plus tard, ou ouvrir un autre dossier, est une autre consultation.
  if (!("key" in media)) {
    await audit(db, v, { action: "moderation.media_view", targetType: "report", targetId: reportId, reason: null });
  } else {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`media_view:${v.user.id}:${reportId}`}, 0))`,
      );
      if (!(await tracedRecently(tx, v, reportId))) {
        await audit(tx, v, {
          action: "moderation.media_view",
          targetType: "report",
          targetId: reportId,
          reason: VIDEO_REASON,
        });
      }
    });
  }
  return media;
}

/** Ce modérateur a-t-il déjà une consultation tracée pour ce signalement depuis moins d'une minute ? (horloge de la base, comme `created_at`) */
async function tracedRecently(ex: Executor, v: Viewer, reportId: string): Promise<boolean> {
  const rows = await ex
    .select({ id: adminAuditLog.id })
    .from(adminAuditLog)
    .where(
      and(
        eq(adminAuditLog.actorUserId, v.user.id),
        eq(adminAuditLog.action, "moderation.media_view"),
        eq(adminAuditLog.targetId, reportId),
        eq(adminAuditLog.reason, VIDEO_REASON),
        gt(adminAuditLog.createdAt, sql`now() - interval '60 seconds'`),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
