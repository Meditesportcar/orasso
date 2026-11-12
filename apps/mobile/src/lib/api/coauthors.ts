// Collaboration (vague R8, lot R8o) : chercher un co-auteur, répondre à une invitation, se retirer. Inviter se fait à la création
// d'une publication (`createFeedPost` + `coAuthor`). Aucune règle ici : l'API les tient.
import type { CoAuthorSearchPage, CoauthorKind, CoauthorStatus } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const coauthorsApi = {
  /** Deux lettres au moins (sinon la liste est vide) ; `kind` limite la recherche à un genre. */
  coAuthorSearch: (q: string, kind?: CoauthorKind) =>
    request<CoAuthorSearchPage>(`/api/me/feed-posts/coauthor-search${qs({ q, kind })}`),
  acceptCoAuthor: (postId: string) =>
    request<{ status: CoauthorStatus }>(`/api/me/feed-coauthor-requests/${postId}/accept`, { method: "POST" }),
  declineCoAuthor: (postId: string) =>
    request<{ status: CoauthorStatus }>(`/api/me/feed-coauthor-requests/${postId}/decline`, { method: "POST" }),
  /** « Me retirer » (le co-auteur) ou « Annuler l'invitation » / « Retirer le co-auteur » (l'auteur d'origine). */
  withdrawCoAuthor: (postId: string) =>
    request<{ status: CoauthorStatus | "removed" }>(`/api/feed-posts/${postId}/coauthor`, { method: "DELETE" }),
};
