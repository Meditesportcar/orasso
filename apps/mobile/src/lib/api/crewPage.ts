// Page du crew (lot R5c2) : réglages du crew (Instagram, droit de proposer une sortie), bannière, sorties du crew et
// réponses. La fiche du crew elle-même (`crewBySlug`) reste dans `crews.ts`.
import type { CrewOutingRsvp, CrewOutingView, CrewView } from "@orasso/shared";

import { request } from "../http";

/** Ce que l'appli envoie pour une sortie (les dates en ISO, le point facultatif). */
export type CrewOutingInput = {
  title: string;
  startsAt: string;
  place: string;
  lat: number | null;
  lng: number | null;
  program: string | null;
};

export type CrewSettingsInput = {
  name?: string;
  description?: string | null;
  department?: string;
  instagram?: string | null;
  membersCanProposeOutings?: boolean;
};

export const crewPageApi = {
  updateCrewSettings: (id: string, body: CrewSettingsInput) =>
    request<CrewView>(`/api/crews/${id}`, { method: "PATCH", body }),
  /** Bannière : champ `banner`, et `plateRects` (JSON) ou `noPlate=true` (chaîne de plaque des photos de véhicule). */
  setCrewBanner: (id: string, form: FormData) =>
    request<CrewView>(`/api/crews/${id}/banner`, { method: "POST", form, timeout: 60_000 }),
  removeCrewBanner: (id: string) => request<CrewView>(`/api/crews/${id}/banner`, { method: "DELETE" }),
  /** Lot R6a, tour 2 : une sortie relue à un signal (sa carte du fil) ; 404 une fois annulée. */
  crewOuting: (crewId: string, outingId: string) => request<CrewOutingView>(`/api/crews/${crewId}/outings/${outingId}`),
  createCrewOuting: (crewId: string, body: CrewOutingInput) =>
    request<CrewOutingView>(`/api/crews/${crewId}/outings`, { method: "POST", body }),
  updateCrewOuting: (crewId: string, outingId: string, body: Partial<CrewOutingInput>) =>
    request<CrewOutingView>(`/api/crews/${crewId}/outings/${outingId}`, { method: "PATCH", body }),
  cancelCrewOuting: (crewId: string, outingId: string) =>
    request<unknown>(`/api/crews/${crewId}/outings/${outingId}`, { method: "DELETE" }),
  answerCrewOuting: (crewId: string, outingId: string, answer: CrewOutingRsvp) =>
    request<CrewOutingView>(`/api/crews/${crewId}/outings/${outingId}/rsvp`, { method: "PUT", body: { answer } }),
};
