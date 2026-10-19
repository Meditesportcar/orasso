// Invitations nominatives (lot 25) : invitations reçues (Accès, Boîte > Demandes), réponse, et côté organisateur
// l'écran « Inviter » (pseudo, retenus de l'édition précédente, e-mail).
import type {
  EventOrganizer,
  InvitationAcceptResult,
  InvitationCandidate,
  InvitationCreate,
  InvitationCreateResult,
  InvitationSourceEvent,
  OrganizerInvitation,
  ReceivedInvitation,
} from "@orasso/shared";

import { request } from "../http";

export const invitationsApi = {
  /** Vue organisateur de l'événement (titre, verrouillage, statut) pour l'écran « Inviter ». */
  eventForInvitations: (eventId: string) => request<EventOrganizer>(`/api/events/${eventId}`),
  myEventInvitations: () => request<ReceivedInvitation[]>("/api/me/event-invitations"),
  acceptEventInvitation: (
    id: string,
    vehicleId?: string,
    eventDayId?: string | null,
    arrival: { arrivalSeen?: boolean; arrivalNote?: string | null } = {},
  ) =>
    request<InvitationAcceptResult>(`/api/event-invitations/${id}/accept`, {
      method: "POST",
      body: { ...(vehicleId ? { vehicleId } : {}), ...(eventDayId ? { eventDayId } : {}), ...arrival },
    }),
  declineEventInvitation: (id: string) => request<unknown>(`/api/event-invitations/${id}/decline`, { method: "POST" }),
  eventInvitations: (eventId: string) => request<OrganizerInvitation[]>(`/api/events/${eventId}/invitations`),
  inviteToEvent: (eventId: string, body: Partial<InvitationCreate>) =>
    request<InvitationCreateResult>(`/api/events/${eventId}/invitations`, { method: "POST", body }),
  inviteFromEvent: (eventId: string, sourceEventId: string, message: string | null) =>
    request<InvitationCreateResult>(`/api/events/${eventId}/invitations/from-event`, {
      method: "POST",
      body: { sourceEventId, message },
    }),
  invitationSources: (eventId: string) =>
    request<InvitationSourceEvent[]>(`/api/events/${eventId}/invitations/sources`),
  invitationCandidates: (eventId: string) =>
    request<InvitationCandidate[]>(`/api/events/${eventId}/invitations/candidates`),
};
