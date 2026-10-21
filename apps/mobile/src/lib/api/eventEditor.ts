// Créer, modifier, dupliquer et publier un événement depuis l'appli (lot 35b, D20) : les routes que l'assistant du site
// appelle déjà (`EventWizard.tsx`, `orga-evenement.tsx`), avec les corps calculés par le modèle partagé
// (`eventPayload`, `eventDaysPayload`, `zoneChanges`). Aucune règle ici : structure suspendue, double authentification,
// événement commencé (423), jour qui a des candidatures (409 `day_in_use`) sont décidés par l'API.
import type { EventDaysPut, EventOrganizer, NeedPayload, RecurrenceRule, ZonePayload } from "@orasso/shared";

import { request } from "../http";

/** Réponse de la recherche d'adresse (`GET /geocode`). */
export type GeocodeMatch = { lat: number; lng: number; label: string; postalCode: string | null; city: string | null };

export const eventEditorApi = {
  createEvent: (structureId: string, body: Record<string, unknown>) =>
    request<EventOrganizer>(`/api/structures/${structureId}/events`, { method: "POST", body, timeout: 30_000 }),
  updateEvent: (eventId: string, body: Record<string, unknown>) =>
    request<EventOrganizer>(`/api/events/${eventId}`, { method: "PATCH", body, timeout: 30_000 }),
  putEventDays: (eventId: string, body: Partial<EventDaysPut>) =>
    request<unknown>(`/api/events/${eventId}/days`, { method: "PUT", body, timeout: 30_000 }),
  addZone: (eventId: string, zone: ZonePayload) =>
    request<unknown>(`/api/events/${eventId}/zones`, { method: "POST", body: zone }),
  updateZone: (eventId: string, zoneId: string, zone: ZonePayload) =>
    request<unknown>(`/api/events/${eventId}/zones/${zoneId}`, { method: "PATCH", body: zone }),
  deleteZone: (eventId: string, zoneId: string) =>
    request<unknown>(`/api/events/${eventId}/zones/${zoneId}`, { method: "DELETE" }),
  // Lot 53 : missions (besoins `event_needs`, lot 46) saisies dans le volet « Sur place » de l'assistant.
  addNeed: (eventId: string, need: NeedPayload) =>
    request<unknown>(`/api/events/${eventId}/needs`, { method: "POST", body: need }),
  updateNeed: (eventId: string, needId: string, need: NeedPayload) =>
    request<unknown>(`/api/events/${eventId}/needs/${needId}`, { method: "PATCH", body: need }),
  deleteNeed: (eventId: string, needId: string) =>
    request<unknown>(`/api/events/${eventId}/needs/${needId}`, { method: "DELETE" }),
  uploadPoster: (eventId: string, form: FormData) =>
    request<unknown>(`/api/events/${eventId}/poster`, { method: "POST", form, timeout: 60_000 }),
  geocode: (q: string) => request<{ match: GeocodeMatch | null }>(`/api/geocode?q=${encodeURIComponent(q)}`),
  publishEvent: (eventId: string) => request<EventOrganizer>(`/api/events/${eventId}/publish`, { method: "POST" }),
  duplicateEvent: (eventId: string) =>
    request<EventOrganizer>(`/api/events/${eventId}/duplicate`, { method: "POST", timeout: 30_000 }),
  createRecurrence: (eventId: string, rule: RecurrenceRule) =>
    request<{ title: string; startsAt: string }[]>(`/api/events/${eventId}/recurrence`, {
      method: "POST",
      body: { rule },
      timeout: 30_000,
    }),
  removeInvitation: (eventId: string, invitationId: string) =>
    request<unknown>(`/api/events/${eventId}/invitations/${invitationId}`, { method: "DELETE" }),
};
