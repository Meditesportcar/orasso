// Crews et inscription en crew (lot 19) : fiche, mes crews, recherche, demandes, invitations, logo, inscription à un
// événement, confirmation de venue.
import type {
  CrewCard,
  CrewConfirmationRequest,
  CrewCreate,
  CrewInboxRequest,
  CrewMemberView,
  CrewPendingList,
  CrewRegistration,
  CrewRegistrationOptions,
  CrewRegistrationView,
  CrewView,
  MyApplication,
  MyCrew,
  Page,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const crewsApi = {
  myCrews: () => request<MyCrew[]>("/api/me/crews"),
  crewBySlug: (slug: string) => request<CrewView>(`/api/crews/by-slug/${encodeURIComponent(slug)}`),
  createCrew: (body: CrewCreate) => request<CrewView>("/api/crews", { method: "POST", body }),
  updateCrew: (id: string, body: Partial<CrewCreate>) =>
    request<CrewView>(`/api/crews/${id}`, { method: "PATCH", body }),
  archiveCrew: (id: string) => request<unknown>(`/api/crews/${id}`, { method: "DELETE" }),
  setCrewLogo: (id: string, key: string | null) =>
    request<CrewView>(`/api/crews/${id}/logo`, { method: "POST", body: { key } }),
  searchCrews: (q: string, department?: string) =>
    request<Page<CrewCard>>(`/api/crews/search${qs({ limit: 20, q: q || undefined, department })}`),
  crewMembers: (id: string) => request<CrewMemberView[]>(`/api/crews/${id}/members`),
  crewPending: (id: string) => request<CrewPendingList>(`/api/crews/${id}/requests`),
  requestCrew: (id: string, message: string | null) =>
    request<CrewView>(`/api/crews/${id}/requests`, { method: "POST", body: { message } }),
  acceptCrewRequest: (id: string, userId: string) =>
    request<unknown>(`/api/crews/${id}/requests/${encodeURIComponent(userId)}/accept`, { method: "POST" }),
  declineCrewRequest: (id: string, userId: string) =>
    request<unknown>(`/api/crews/${id}/requests/${encodeURIComponent(userId)}/decline`, { method: "POST" }),
  inviteToCrew: (id: string, pseudo: string) =>
    request<{ pseudo: string; status: string }>(`/api/crews/${id}/invitations`, { method: "POST", body: { pseudo } }),
  acceptCrewInvitation: (id: string) => request<CrewView>(`/api/me/crew-invitations/${id}/accept`, { method: "POST" }),
  declineCrewInvitation: (id: string) => request<unknown>(`/api/me/crew-invitations/${id}/decline`, { method: "POST" }),
  removeCrewMember: (id: string, userId: string) =>
    request<unknown>(`/api/crews/${id}/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  crewRequests: () => request<CrewInboxRequest[]>("/api/me/crew-requests"),
  crewConfirmations: () => request<CrewConfirmationRequest[]>("/api/me/crew-confirmations"),
  crewRegistrationOptions: (eventId: string, crewId: string) =>
    request<CrewRegistrationOptions>(`/api/events/${eventId}/crew-applications/options${qs({ crewId })}`),
  myCrewRegistrations: (eventId: string) =>
    request<CrewRegistrationView[]>(`/api/events/${eventId}/crew-applications/mine`),
  registerCrew: (eventId: string, body: CrewRegistration) =>
    request<CrewRegistrationView>(`/api/events/${eventId}/crew-applications`, { method: "POST", body }),
  confirmCrewVenue: (
    applicationId: string,
    followStructure: boolean,
    arrival: { arrivalSeen?: boolean; arrivalNote?: string | null } = {},
  ) =>
    request<MyApplication>(`/api/applications/${applicationId}/confirm-crew`, {
      method: "POST",
      body: { rulesAccepted: true, followStructure, ...arrival },
    }),
  declineCrewVenue: (applicationId: string) =>
    request<MyApplication>(`/api/applications/${applicationId}/decline-crew`, { method: "POST" }),
  removeFromCrewRegistration: (applicationId: string) =>
    request<unknown>(`/api/applications/${applicationId}/crew-remove`, { method: "POST" }),
};
