// Commentaires d'une publication du Fil (lot R8k2) : liste, réponses, envoi, suppression, flamme, couper, suggestions « @ ».
// Aucune règle ici : l'API les tient (lot R8k1).
import type {
  FeedCommentCreated,
  FeedCommentCreateInput,
  FeedCommentPage,
  FeedCommentReaction,
  FeedCommentView,
  MentionSuggestion,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const feedCommentsApi = {
  feedComments: (postId: string, cursor?: string | null) =>
    request<FeedCommentPage>(`/api/feed-posts/${postId}/comments${qs({ cursor })}`),
  feedCommentReplies: (commentId: string, cursor?: string | null) =>
    request<FeedCommentPage>(`/api/feed-comments/${commentId}/replies${qs({ cursor })}`),
  createFeedComment: (postId: string, body: FeedCommentCreateInput) =>
    request<FeedCommentCreated>(`/api/feed-posts/${postId}/comments`, { method: "POST", body }),
  removeFeedComment: (commentId: string) => request<unknown>(`/api/feed-comments/${commentId}`, { method: "DELETE" }),
  fireFeedComment: (commentId: string, on: boolean) =>
    request<FeedCommentReaction>(`/api/feed-comments/${commentId}/reaction`, { method: on ? "PUT" : "DELETE" }),
  setFeedCommentsOff: (postId: string, off: boolean) =>
    request<{ commentsOff: boolean }>(`/api/me/feed-posts/${postId}/comments-off`, { method: "PUT", body: { off } }),
  feedMentionSuggestions: (postId: string, q: string) =>
    request<MentionSuggestion[]>(`/api/feed-posts/${postId}/mention-suggestions${qs({ q })}`),
};
