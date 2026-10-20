// Casquette Organisateur (lot 22) : événements, direct, staff et Boîte d'une structure. Toutes ces routes exigent la
// double authentification prouvée par la session (`403 two_factor_required`) et un rôle d'organisateur de la
// structure : l'API refuse, l'appli n'affiche que ce qu'elle reçoit. Aucune règle métier ici.
import type {
  AccreditationForOrganizer,
  AnnouncementCreate,
  AnnouncementPage,
  AudiencePrizeBoard,
  ConversationPage,
  EventCard,
  EventCounters,
  EventNeedForOrganizer,
  EventOrganizer,
  EventStaffMember,
  EventStaffUpdate,
  GroupMessageCreate,
  GroupMessageCreated,
  GroupMessagePreview,
  GroupMessageView,
  LiveCounters,
  MessageSegment,
  MessagingQuota,
  OrganizerInboxSummary,
  ProviderSpotInput,
  StaffConversationState,
  StructureCreate,
  StructureMember,
  StructureOrganizer,
  TeamMemberHistory,
  TemplateView,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

/** Alerte du staff (`GET /events/:id/alerts`). */
export type FieldAlert = {
  id: string;
  pseudo: string | null;
  lat: number | null;
  lng: number | null;
  message: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

/** Ligne de la main courante (`GET /events/:id/incidents`). */
export type FieldIncident = {
  id: string;
  reporter: string | null;
  occurredAt: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  description: string;
  createdAt: string;
};

export const orgaApi = {
  // Événements de la structure.
  structureEvents: (structureId: string) => request<EventCard[]>(`/api/structures/${structureId}/events`),
  orgEvent: (eventId: string) => request<EventOrganizer>(`/api/events/${eventId}`),
  eventCounters: (eventId: string) => request<EventCounters>(`/api/events/${eventId}/counters`),
  // Statut Maintenu / Incertain : `api.setOutlook` (weather.ts).
  cancelEvent: (eventId: string) => request<unknown>(`/api/events/${eventId}/cancel`, { method: "POST" }),
  saveInstructions: (eventId: string, instructions: string | null) =>
    request<unknown>(`/api/events/${eventId}`, { method: "PATCH", body: { instructions } }),
  sendInstructions: (eventId: string, instructions?: string) =>
    request<unknown>(`/api/events/${eventId}/instructions/send`, {
      method: "POST",
      body: instructions === undefined ? {} : { instructions },
    }),
  orgAnnouncements: (eventId: string) => request<AnnouncementPage>(`/api/events/${eventId}/announcements`),
  postAnnouncement: (eventId: string, body: Partial<AnnouncementCreate> & { body: string }) =>
    request<unknown>(`/api/events/${eventId}/announcements`, { method: "POST", body, timeout: 20_000 }),
  pinAnnouncement: (eventId: string, announcementId: string, pinned: boolean) =>
    request<unknown>(`/api/events/${eventId}/announcements/${announcementId}`, { method: "PATCH", body: { pinned } }),
  deleteAnnouncement: (eventId: string, announcementId: string) =>
    request<unknown>(`/api/events/${eventId}/announcements/${announcementId}`, { method: "DELETE" }),

  // Direct du jour J.
  liveCounters: (eventId: string, dayId?: string | null) =>
    request<LiveCounters>(`/api/events/${eventId}/live${dayId ? `?dayId=${dayId}` : ""}`),
  eventAlerts: (eventId: string) => request<FieldAlert[]>(`/api/events/${eventId}/alerts`),
  resolveAlert: (eventId: string, alertId: string) =>
    request<{ resolved: boolean }>(`/api/events/${eventId}/alerts/${alertId}/resolve`, { method: "POST" }),
  eventIncidents: (eventId: string) => request<FieldIncident[]>(`/api/events/${eventId}/incidents`),

  // Staff.
  eventStaff: (eventId: string) => request<EventStaffMember[]>(`/api/events/${eventId}/staff`),
  updateEventStaff: (eventId: string, userId: string, patch: EventStaffUpdate) =>
    request<EventStaffMember>(`/api/events/${eventId}/staff/${userId}`, { method: "PATCH", body: patch }),
  remindStaff: (eventId: string, userId: string) =>
    request<{ reminded: boolean }>(`/api/events/${eventId}/staff/${userId}/remind`, { method: "POST" }),
  structureMembers: (structureId: string) => request<StructureMember[]>(`/api/structures/${structureId}/members`),
  /** Lot 52 : historique de chaque membre (équipe en bulles). */
  teamHistory: (structureId: string) => request<TeamMemberHistory[]>(`/api/structures/${structureId}/team-history`),

  // Lot 52 : missions des prestataires, emplacement attribué, Prix du public.
  eventNeeds: (eventId: string) => request<EventNeedForOrganizer[]>(`/api/events/${eventId}/needs`),
  eventAccreditations: (eventId: string) =>
    request<AccreditationForOrganizer[]>(`/api/events/${eventId}/accreditations`),
  setProviderSpot: (eventId: string, applicationId: string, body: ProviderSpotInput) =>
    request<unknown>(`/api/events/${eventId}/applications/${applicationId}/spot`, { method: "PATCH", body }),
  audienceBoard: (eventId: string) => request<AudiencePrizeBoard>(`/api/events/${eventId}/audience-prize`),

  // Boîte de la structure.
  orgInboxSummary: (structureId: string) =>
    request<OrganizerInboxSummary>(`/api/structures/${structureId}/inbox/summary`),
  orgConversations: (structureId: string, cursor?: string) =>
    request<ConversationPage>(`/api/structures/${structureId}/conversations${qs({ limit: 30, cursor })}`),
  groupMessages: (structureId: string) =>
    request<{ items: GroupMessageView[] }>(`/api/structures/${structureId}/group-messages`),
  groupQuota: (structureId: string) => request<MessagingQuota>(`/api/structures/${structureId}/messaging/quota`),
  groupPreview: (structureId: string, segment: MessageSegment, eventId?: string | null) =>
    request<GroupMessagePreview>(
      `/api/structures/${structureId}/group-messages/preview${qs({ segment, eventId: eventId ?? undefined })}`,
    ),
  sendGroupMessage: (structureId: string, body: GroupMessageCreate) =>
    request<GroupMessageCreated>(`/api/structures/${structureId}/group-messages`, {
      method: "POST",
      body,
      timeout: 20_000,
    }),
  templates: (structureId: string) => request<{ items: TemplateView[] }>(`/api/structures/${structureId}/templates`),
  permanentStaffChat: (structureId: string) =>
    request<StaffConversationState>(`/api/structures/${structureId}/staff-conversation`),
  eventStaffChats: (structureId: string) =>
    request<{ items: StaffConversationState[] }>(`/api/structures/${structureId}/staff-conversations`),

  // Créer une structure.
  createStructure: (body: Pick<StructureCreate, "kind" | "name" | "description" | "departments">) =>
    request<StructureOrganizer>("/api/structures", { method: "POST", body }),
};
