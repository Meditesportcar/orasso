// Fil d'un crew (lot R5c1) : publications, photos, flamme, commentaires, sondages. Réservé aux membres actifs.
import type {
  CrewCommentView,
  CrewFeedPage,
  CrewFireState,
  CrewPostCreate,
  CrewPostOptions,
  CrewPostView,
  Page,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const crewFeedApi = {
  crewFeed: (crewId: string, cursor?: string) => request<CrewFeedPage>(`/api/crews/${crewId}/feed${qs({ cursor })}`),
  crewPostOptions: (crewId: string) => request<CrewPostOptions>(`/api/crews/${crewId}/post-options`),
  createCrewPost: (crewId: string, body: CrewPostCreate) =>
    request<CrewPostView>(`/api/crews/${crewId}/posts`, { method: "POST", body, timeout: 30_000 }),
  removeCrewPost: (crewId: string, postId: string) =>
    request<unknown>(`/api/crews/${crewId}/posts/${postId}`, { method: "DELETE" }),
  fireCrewPost: (crewId: string, postId: string, on: boolean) =>
    request<CrewFireState>(`/api/crews/${crewId}/posts/${postId}/reaction`, { method: on ? "PUT" : "DELETE" }),
  crewPostComments: (crewId: string, postId: string, cursor?: string) =>
    request<Page<CrewCommentView>>(`/api/crews/${crewId}/posts/${postId}/comments${qs({ cursor })}`),
  commentCrewPost: (crewId: string, postId: string, text: string) =>
    request<CrewCommentView>(`/api/crews/${crewId}/posts/${postId}/comments`, { method: "POST", body: { text } }),
  removeCrewComment: (crewId: string, commentId: string) =>
    request<unknown>(`/api/crews/${crewId}/comments/${commentId}`, { method: "DELETE" }),
  voteCrewPoll: (crewId: string, postId: string, optionId: string) =>
    request<CrewPostView>(`/api/crews/${crewId}/posts/${postId}/vote`, { method: "PUT", body: { optionId } }),
  closeCrewPoll: (crewId: string, postId: string) =>
    request<CrewPostView>(`/api/crews/${crewId}/posts/${postId}/close`, { method: "POST" }),
};
