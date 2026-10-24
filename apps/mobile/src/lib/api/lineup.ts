// Le plateau d'un événement (lot R4b) : `GET /events/:id/lineup`.
import type { EventLineup } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const lineupApi = {
  eventLineup: (eventId: string, query: { category?: string; cursor?: number; limit?: number } = {}) =>
    request<EventLineup>(`/api/events/${eventId}/lineup${qs(query)}`),
};
