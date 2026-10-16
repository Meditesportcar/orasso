// Événements.
import type { EventCard, EventListQuery, EventPublic, Page } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const eventsApi = {
  events: (query: Partial<Pick<EventListQuery, "q" | "format" | "limit" | "cursor">>) =>
    request<Page<EventCard>>(`/api/events${qs(query)}`),
  eventBySlug: (slug: string) => request<EventPublic>(`/api/events/by-slug/${encodeURIComponent(slug)}`),
};
