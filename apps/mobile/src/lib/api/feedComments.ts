// Commentaires d'une publication du Fil (lot R8k2) : liste, réponses, envoi, suppression, flamme, couper, suggestions « @ ».
// Aucune règle ici : l'API les tient (lot R8k1).
import type {
  FeedCommentCreated,
  FeedCommentCreateInput,
  FeedCommentPage,
  FeedCommentReaction,
  FeedCommentView,
  MentionSuggestion,
  ParentCount,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const feedCommentsApi = {
  // Lot R9n (liste blanche, T19) : lire et commenter au nom de la casquette active (`actor`, T7).
  feedComments: (postId: string, cursor?: string | null, actor?: string | null) =>
    request<FeedCommentPage>(`/api/feed-posts/${postId}/comments${qs({ cursor })}`, { actor }),
  feedCommentReplies: (commentId: string, cursor?: string | null) =>
    request<FeedCommentPage>(`/api/feed-comments/${commentId}/replies${qs({ cursor })}`),
  createFeedComment: (postId: string, body: FeedCommentCreateInput, actor?: string | null) =>
    request<FeedCommentCreated>(`/api/feed-posts/${postId}/comments`, { method: "POST", body, actor }),
  // 204 ; une réponse supprimée rend 200 avec le compteur de son parent (version comprise).
  removeFeedComment: (commentId: string) =>
    request<{ parent?: ParentCount } | null | undefined>(`/api/feed-comments/${commentId}`, { method: "DELETE" }),
  fireFeedComment: (commentId: string, on: boolean) =>
    request<FeedCommentReaction>(`/api/feed-comments/${commentId}/reaction`, { method: on ? "PUT" : "DELETE" }),
  setFeedCommentsOff: (postId: string, off: boolean) =>
    request<{ commentsOff: boolean }>(`/api/me/feed-posts/${postId}/comments-off`, { method: "PUT", body: { off } }),
  feedMentionSuggestions: (postId: string, q: string) =>
    request<MentionSuggestion[]>(`/api/feed-posts/${postId}/mention-suggestions${qs({ q })}`),
};
