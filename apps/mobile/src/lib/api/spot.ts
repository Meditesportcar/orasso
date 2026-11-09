// Rendez-vous au spot (lot R7i) : lancer, recevoir, répondre, annuler. Aucune règle ici : durée, invités et effacement sont
// décidés par l'API. Rien de ce qui touche au lieu n'est mis en cache sur l'appareil (jamais de `cacheKey`).
import type {
  SpotAnswer,
  SpotAudiences,
  SpotCrewList,
  SpotIncoming,
  SpotMeetupView,
  SpotReplies,
} from "@orasso/shared";

import { request } from "../http";

export type SpotCreateBody = {
  placeLabel: string;
  lat: number;
  lng: number;
  startsAt: string;
  endsAt: string;
  note: string | null;
  audience: "followers" | "crew";
  crewId: string | null;
};

const cursorQuery = (cursor?: string | null) => (cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");

export const spotApi = {
  createSpot: (body: SpotCreateBody) => request<SpotMeetupView>("/api/me/spot-meetups", { method: "POST", body }),
  cancelSpot: (id: string) => request<{ ok: true }>(`/api/me/spot-meetups/${id}`, { method: "DELETE" }),
  spot: (id: string) => request<SpotMeetupView>(`/api/spot-meetups/${id}`),
  replySpot: (id: string, answer: SpotAnswer) =>
    request<SpotMeetupView>(`/api/spot-meetups/${id}/reply`, { method: "PUT", body: { answer } }),
  unreplySpot: (id: string) => request<SpotMeetupView>(`/api/spot-meetups/${id}/reply`, { method: "DELETE" }),
  spotReplies: (id: string, cursor?: string | null) =>
    request<SpotReplies>(`/api/spot-meetups/${id}/replies${cursorQuery(cursor)}`),
  spotIncoming: (cursor?: string | null) =>
    request<SpotIncoming>(`/api/me/spot-meetups/incoming${cursorQuery(cursor)}`),
  mySpot: () => request<{ meetup: SpotMeetupView | null }>("/api/me/spot-meetups/active"),
  spotAudiences: () => request<SpotAudiences>("/api/me/spot-meetups/audiences"),
  crewSpots: (crewId: string, cursor?: string | null) =>
    request<SpotCrewList>(`/api/crews/${crewId}/spot-meetups${cursorQuery(cursor)}`),
};
