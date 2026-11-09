// Média d'un contenu signalé (lot R7e1, ARCHITECTURE-R7 § 3 « Modération ») : la file de modération montre la photo
// (ou la vidéo) d'une publication du Fil ou d'une story signalée, par une route réservée aux modérateurs, jamais par
// une adresse publique. Un contenu = un lecteur inscrit ici par le module qui le possède (`feed_post` : le Fil ;
// `story` : le lot R7f1 s'inscrit avec `registerReportMedia("story", …)`). Consultation tracée, jamais mise en cache.
import type { ReportTarget } from "@orasso/shared";
import { eq } from "drizzle-orm";

import { db } from "../../db/client";
import { reports } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { audit } from "../admin/audit";

/** Une image (en mémoire) ou une vidéo (fichier du disque, servi par morceaux : jamais chargé). */
export type ReportMedia = { data: Buffer; contentType: string } | { key: string; size: number; contentType: string };
/** Rend le média `name` du contenu visé par ce signalement, ou `null` (absent, ou pas un média de ce contenu). */
export type ReportMediaReader = (report: { id: string; targetId: string }, name: string) => Promise<ReportMedia | null>;

const readers = new Map<ReportTarget, ReportMediaReader>();

export function registerReportMedia(target: ReportTarget, reader: ReportMediaReader) {
  readers.set(target, reader);
}

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
  await audit(db, v, { action: "moderation.media_view", targetType: "report", targetId: reportId });
  return media;
}
