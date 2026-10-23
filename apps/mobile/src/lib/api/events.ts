// Événements.
import type { ApplyContext, EventCard, EventListQuery, EventPublic, Page } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const eventsApi = {
  events: (query: Partial<Pick<EventListQuery, "q" | "format" | "limit" | "cursor">>) =>
    request<Page<EventCard>>(`/api/events${qs(query)}`),
  eventBySlug: (slug: string) => request<EventPublic>(`/api/events/by-slug/${encodeURIComponent(slug)}`),
  /**
   * Lot M4, tour 2 : le créneau privé des exposants, lu à l'ouverture de la feuille de candidature (jamais mis en cache :
   * la réponse est `private, no-store`).
   */
  applyContext: (eventId: string) => request<ApplyContext>(`/api/events/${eventId}/apply-context`),
};
