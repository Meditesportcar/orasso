// Média d'un signalement (lot R7e1 crée ce registre ; R7f1 le crée à l'identique tant que R7e1 n'est pas fusionné :
// le coordinateur garde celui de R7e1). Une sorte de contenu s'y inscrit pour que la modération voie le média signalé
// par `GET /admin/reports/:id/media/:name`, même après l'expiration du contenu.
import type { ReportTarget } from "@orasso/shared";

export type ReportMedia = { data: Buffer; contentType: string };
/** `targetId` : le contenu signalé ; `name` : le nom du fichier demandé. `null` : introuvable. */
export type ReportMediaFn = (targetId: string, name: string) => Promise<ReportMedia | null>;

const registry = new Map<ReportTarget, ReportMediaFn>();

export function registerReportMedia(target: ReportTarget, fn: ReportMediaFn): void {
  registry.set(target, fn);
}

export const reportMediaOf = (target: ReportTarget): ReportMediaFn | undefined => registry.get(target);
