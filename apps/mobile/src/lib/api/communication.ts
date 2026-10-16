// Communication de l'organisateur (lot 20) : fil de l'événement, discussion du staff. La casquette Organisateur
// (Boîte, messages groupés, modèles : lot 22) ajoutera ses appels ici.
import type { AnnouncementPage, StaffConversationState } from "@orasso/shared";

import { request } from "../http";

export const communicationApi = {
  /** Fil de l'événement : public, enrichi pour les retenus et l'organisation (consignes, annonces réservées). */
  eventAnnouncements: (slug: string) =>
    request<AnnouncementPage>(`/api/events/by-slug/${encodeURIComponent(slug)}/announcements`),
  /** Discussion du staff d'un événement (en ligne seulement, S22) ; `403 conversation_closed` après J+1. */
  eventStaffConversation: (eventId: string) =>
    request<StaffConversationState>(`/api/events/${eventId}/staff-conversation`),
};
