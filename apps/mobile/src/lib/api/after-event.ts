// Après l'événement, casquette Organisateur (lot 27) : bilan et remerciement. Aucune règle métier ici (lot 27, API).
import type { EventReportView, ThanksResult } from "@orasso/shared";

import { request } from "../http";

export const afterEventApi = {
  /** `GET /events/:id/report` : bilan (absent avant J+2) et état du remerciement. */
  eventReport: (eventId: string) => request<EventReportView>(`/api/events/${eventId}/report`),
  /** `POST /events/:id/thanks` : le modèle Orasso, une seule fois. */
  sendThanks: (eventId: string) => request<ThanksResult>(`/api/events/${eventId}/thanks`, { method: "POST", body: {} }),
};
