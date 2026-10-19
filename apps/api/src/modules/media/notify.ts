// Notifications de décision d'une accréditation presse (lot 45) : appelées par le service des candidatures à la place
// de `application_accepted` / `application_refused` quand `kind = media`. Sans dépendance vers ce service (pas de cycle).
import { mediaLabels } from "@orasso/shared";

import type { applications, events } from "../../db/schema";
import { formatDateTime } from "../../lib/format";
import type { Tx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";

type App = typeof applications.$inferSelect;
type Event = typeof events.$inferSelect;

export async function notifyMediaDecision(tx: Tx, event: Event, app: App): Promise<void> {
  const base = {
    eventId: event.id,
    eventStartsAt: event.startsAt,
    data: { eventId: event.id, applicationId: app.id, screen: "media_accreditations" },
    link: mediaLabels.linkPress,
  };
  if (app.status === "accepted") {
    await notificationsService.notify(tx, app.userId, "accreditation_accepted", {
      ...base,
      title: mediaLabels.acceptedTitle,
      body: mediaLabels.acceptedBody(event.title, formatDateTime(event.startsAt)),
    });
  } else if (app.status === "refused") {
    const lines: string[] = [mediaLabels.refusedBody(event.title)];
    if (app.refusalSent && app.refusalNote) lines.push(app.refusalNote);
    await notificationsService.notify(tx, app.userId, "accreditation_refused", {
      ...base,
      title: mediaLabels.refusedTitle,
      body: lines.join("\n"),
    });
  }
}
