// Le direct sur place (lot R7d2) : `POST /events/:id/presence` et le résumé des présents de l'organisateur. La position
// n'existe que dans l'argument de `validatePresence` : elle part dans le corps de la demande et n'est ni gardée ici, ni
// renvoyée par l'API, ni écrite sur l'appareil.
import type { PresenceInput, PresenceResult, PresenceSummary } from "@orasso/shared";

import { request } from "../http";

export const presenceApi = {
  validatePresence: (eventId: string, input: PresenceInput) =>
    request<PresenceResult>(`/api/events/${eventId}/presence`, { method: "POST", body: input }),
  presenceSummary: (eventId: string) => request<PresenceSummary>(`/api/events/${eventId}/presences/summary`),
};
