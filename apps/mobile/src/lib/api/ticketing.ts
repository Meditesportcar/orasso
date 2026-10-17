// Billetterie de l'organisateur (lot 35c) : réglages d'un événement et compte Stripe de la structure. Les règles
// (interrupteur général, capacité, propriétaire seul pour Stripe, structure suspendue) sont celles de l'API.
import type { EventTicketing, StripeAccountState, TicketingUpdate } from "@orasso/shared";

import { request } from "../http";

export const ticketingApi = {
  eventTicketing: (eventId: string) => request<EventTicketing>(`/api/events/${eventId}/ticketing`),
  configureTicketing: (eventId: string, body: TicketingUpdate) =>
    request<EventTicketing>(`/api/events/${eventId}/ticketing`, { method: "PUT", body }),
  stripeAccount: (structureId: string) => request<StripeAccountState>(`/api/structures/${structureId}/stripe`),
  /** Adresse du parcours Stripe : elle s'ouvre dans le navigateur du téléphone, jamais dans l'appli. */
  startStripeConnect: (structureId: string) =>
    request<{ url: string }>(`/api/structures/${structureId}/stripe/connect`, { method: "POST" }),
  disconnectStripe: (structureId: string) =>
    request<StripeAccountState>(`/api/structures/${structureId}/stripe`, { method: "DELETE" }),
};
