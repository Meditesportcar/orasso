// Votes à thème côté organisateur et staff (lot R7l2) : les routes de R7l1 (`/events/:id/votes/*`). Aucune règle métier
// ici : l'API tranche (droits, ouverture, candidats), l'appli affiche ce qu'elle répond. Le côté passionné (liste,
// grille, voix) viendra au lot R7l3 dans ce même fichier, dans un bloc à part.
import type {
  ApplicationForTriage,
  Page,
  VoteCandidateAdd,
  VoteCandidateAdded,
  VoteManage,
  VoteManageItem,
  VoteTemplates,
  voteDraftBody,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

type VoteBody = ReturnType<typeof voteDraftBody>;

export const votesApi = {
  // --- Organisateur et staff (le staff lit seulement) ---
  voteManage: (eventId: string) => request<VoteManage>(`/api/events/${eventId}/votes/manage`),
  voteTemplates: (eventId: string) => request<VoteTemplates>(`/api/events/${eventId}/votes/templates`),
  voteCreate: (eventId: string, body: VoteBody) =>
    request<VoteManageItem>(`/api/events/${eventId}/votes`, { method: "POST", body }),
  voteUpdate: (eventId: string, voteId: string, body: Partial<VoteBody>) =>
    request<VoteManageItem>(`/api/events/${eventId}/votes/${voteId}`, { method: "PATCH", body }),
  voteRemove: (eventId: string, voteId: string) =>
    request<{ ok: true }>(`/api/events/${eventId}/votes/${voteId}`, { method: "DELETE" }),
  voteOrder: (eventId: string, ids: string[]) =>
    request<VoteManage>(`/api/events/${eventId}/votes/order`, { method: "PUT", body: { ids } }),
  voteRestoreAllCategories: (eventId: string) =>
    request<VoteManageItem>(`/api/events/${eventId}/votes/all-categories`, { method: "POST" }),
  voteOpen: (eventId: string, voteId: string) =>
    request<VoteManageItem>(`/api/events/${eventId}/votes/${voteId}/open`, { method: "POST" }),
  voteClose: (eventId: string, voteId: string) =>
    request<VoteManageItem>(`/api/events/${eventId}/votes/${voteId}/close`, { method: "POST" }),
  voteAddCandidate: (eventId: string, voteId: string, body: VoteCandidateAdd) =>
    request<VoteCandidateAdded>(`/api/events/${eventId}/votes/${voteId}/candidates`, { method: "POST", body }),
  voteRemoveCandidate: (eventId: string, voteId: string, applicationId: string) =>
    request<VoteManageItem>(`/api/events/${eventId}/votes/${voteId}/candidates/${applicationId}`, {
      method: "DELETE",
    }),
  /** Recherche d'une voiture retenue (pseudo, marque ou modèle) pour un vote « à la main » : la file de tri, filtrée. */
  voteSearchRetained: (eventId: string, q: string, cursor?: string | null) =>
    request<Page<ApplicationForTriage>>(
      `/api/events/${eventId}/applications${qs({ kind: "vehicle", status: "accepted", sort: "pseudo", q, limit: 12, cursor })}`,
    ),
};
