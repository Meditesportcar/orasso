// Casquette Média (lot 55) : profil, agenda et événements gardés, accréditations, contenus, sur l'API du lot 45. Aucune
// règle métier ici : quota, date limite, profil complet, « accrédité pour publier » sont côté API, dont les messages
// s'affichent tels quels.
import type {
  AccreditationRequest,
  MediaAccreditationView,
  MediaAgenda,
  MediaContentCreate,
  MediaContentUpdate,
  MediaContentView,
  MediaProfileInput,
  MediaProfileView,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const mediaApi = {
  myMediaProfile: () => request<{ profile: MediaProfileView | null }>("/api/me/media-profile"),
  saveMediaProfile: (body: MediaProfileInput) =>
    request<MediaProfileView>("/api/me/media-profile", { method: "PUT", body }),
  setMediaLogo: (key: string) =>
    request<MediaProfileView>("/api/me/media-profile/logo", { method: "POST", body: { key } }),
  removeMediaLogo: () => request<MediaProfileView>("/api/me/media-profile/logo", { method: "DELETE" }),
  mediaAgenda: () => request<MediaAgenda>("/api/me/media/agenda"),
  saveMediaEvent: (eventId: string) => request<null>(`/api/me/media/saved/${eventId}`, { method: "POST" }),
  unsaveMediaEvent: (eventId: string) => request<null>(`/api/me/media/saved/${eventId}`, { method: "DELETE" }),
  requestAccreditation: (eventId: string, body: AccreditationRequest) =>
    request<MediaAccreditationView>(`/api/events/${eventId}/accreditations`, { method: "POST", body }),
  myAccreditations: (scope: "upcoming" | "past" | "all") =>
    request<MediaAccreditationView[]>(`/api/me/accreditations${qs({ scope })}`),
  myMediaContents: () => request<MediaContentView[]>("/api/me/media-contents"),
  createMediaContent: (body: MediaContentCreate) =>
    request<MediaContentView>("/api/me/media-contents", { method: "POST", body }),
  updateMediaContent: (id: string, body: MediaContentUpdate) =>
    request<MediaContentView>(`/api/me/media-contents/${id}`, { method: "PATCH", body }),
  deleteMediaContent: (id: string) => request<null>(`/api/me/media-contents/${id}`, { method: "DELETE" }),
  eventMediaContents: (slug: string) =>
    request<MediaContentView[]>(`/api/events/by-slug/${encodeURIComponent(slug)}/media-contents`),
  viewMediaContent: (id: string) => request<{ views: number }>(`/api/media-contents/${id}/view`, { method: "POST" }),
};
