// Candidatures, pass, contestation, avis.
import type {
  AccessPass,
  ApplicationCreate,
  EventReview,
  EventReviews,
  MyApplication,
  ReviewCreate,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const applicationsApi = {
  // `companions` facultatif : l'API prend 0 par défaut (la feuille de candidature ne le demande plus, lot C2b).
  apply: (
    eventId: string,
    body: Omit<ApplicationCreate, "rulesAccepted" | "companions"> & { rulesAccepted: true; companions?: number },
  ) => request<MyApplication[]>(`/api/events/${eventId}/applications`, { method: "POST", body }),
  applications: (scope: "upcoming" | "past") => request<MyApplication[]>(`/api/me/applications${qs({ scope })}`),
  withdraw: (id: string) => request<MyApplication>(`/api/applications/${id}/withdraw`, { method: "POST", body: {} }),
  acceptOffer: (id: string) =>
    request<MyApplication>(`/api/applications/${id}/offer/accept`, { method: "POST", body: {} }),
  declineOffer: (id: string) =>
    request<MyApplication>(`/api/applications/${id}/offer/decline`, { method: "POST", body: {} }),
  pass: (applicationId: string) => request<AccessPass>(`/api/applications/${applicationId}/pass`),
  contestMalus: (applicationId: string, message: string) =>
    request<unknown>(`/api/applications/${applicationId}/malus-contest`, { method: "POST", body: { message } }),
  /** Avis après l'événement (participant pointé, une semaine) et avis publics d'un événement (lot 12). */
  review: (applicationId: string, body: ReviewCreate) =>
    request<EventReview>(`/api/applications/${applicationId}/review`, { method: "POST", body }),
  eventReviews: (slug: string) => request<EventReviews>(`/api/events/by-slug/${encodeURIComponent(slug)}/reviews`),
};
