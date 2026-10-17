// Billets du public (lot 34, parité D20 : jusqu'ici sur le site seulement) : l'offre d'un événement, la réservation des
// billets gratuits, mes billets et leur QR, rendre un billet gratuit. Aucun paiement dans l'appli : un billet payant
// s'achète sur le site (paiement de démonstration, Stripe en mode test).
import type { MyTicket, TicketOffer } from "@orasso/shared";

import { request } from "../http";

export const ticketsApi = {
  ticketOffer: (slug: string) =>
    request<{ offer: TicketOffer | null; mine: MyTicket[] }>(`/api/events/by-slug/${encodeURIComponent(slug)}/tickets`),
  myTickets: () => request<MyTicket[]>("/api/me/tickets"),
  reserveTickets: (eventId: string, quantity: number) =>
    request<MyTicket[]>(`/api/events/${eventId}/tickets/reserve`, { method: "POST", body: { quantity } }),
  /** Rendre un billet gratuit : la place est libérée. */
  returnTicket: (ticketId: string) => request<unknown>(`/api/tickets/${ticketId}`, { method: "DELETE" }),
};
