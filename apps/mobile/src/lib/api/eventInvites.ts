// Lot R6c (maquettes R6.3 à R6.7) : « Qui y va », inviter du monde à un événement, le bandeau de l'invité, couper les
// invitations d'une personne, et la liste « Inviter dans <crew> ». Les règles sont dans l'API.
import type {
  CrewInviteCandidatesPage,
  EventInviteResult,
  FollowingGoing,
  InvitationMute,
  InviteCandidatesPage,
  ReceivedEventInvitation,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const eventInvitesApi = {
  followingGoing: (eventId: string) => request<FollowingGoing>(`/api/events/${eventId}/following-going`),
  inviteCandidates: (eventId: string, q?: string, cursor?: string) =>
    request<InviteCandidatesPage>(`/api/events/${eventId}/peer-invitations/candidates${qs({ q, cursor })}`),
  sendInvites: (eventId: string, userIds: string[], note: string | null) =>
    request<EventInviteResult>(`/api/events/${eventId}/peer-invitations`, { method: "POST", body: { userIds, note } }),
  invitationsReceived: (eventId: string) =>
    request<ReceivedEventInvitation | null>(`/api/events/${eventId}/peer-invitations/received`),
  invitationMutes: () => request<InvitationMute[]>("/api/me/invitation-mutes"),
  muteInvitations: (userId: string) =>
    request<{ muted: true }>("/api/me/invitation-mutes", { method: "POST", body: { userId } }),
  unmuteInvitations: (userId: string) =>
    request<{ muted: false }>(`/api/me/invitation-mutes/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  crewInviteCandidates: (crewId: string, q?: string, cursor?: string) =>
    request<CrewInviteCandidatesPage>(`/api/crews/${crewId}/invite-candidates${qs({ q, cursor })}`),
};
