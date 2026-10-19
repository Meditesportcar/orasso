// Quota presse (lot 45) : tenu à la demande (`mediaService.requestAccreditation`) et à la décision du tri
// (`applicationsService`, acceptation d'une accréditation). Sans dépendance vers le service des candidatures.
import { mediaLabels } from "@orasso/shared";
import { and, count, eq } from "drizzle-orm";

import { applications, eventPressSettings } from "../../db/schema";
import { conflict } from "../../lib/errors";
import type { Tx } from "../../lib/tx";

/** `409 press_quota_reached` si les accréditations données atteignent le quota de l'événement (sous son verrou). */
export async function assertPressQuota(tx: Tx, eventId: string): Promise<void> {
  const settings = await tx.query.eventPressSettings.findFirst({ where: eq(eventPressSettings.eventId, eventId) });
  if (settings?.quota == null) return;
  const [given] = await tx
    .select({ n: count() })
    .from(applications)
    .where(and(eq(applications.eventId, eventId), eq(applications.kind, "media"), eq(applications.status, "accepted")));
  if ((given?.n ?? 0) >= settings.quota) {
    throw conflict("press_quota_reached", mediaLabels.quotaReached, { quota: settings.quota });
  }
}
