// Le Fil (lot R7e2) : l'écran, « Publier au Fil », « Mes publications ». Aucune règle ici : l'API les tient (lot R7e1).
// Les photos d'une publication passent par une route privée (`GET /feed-posts/:id/photos/:name`, session exigée) :
// l'image envoie le jeton (`FeedPhoto`).
import type { FeedCardKind, FeedFilter, FeedPage, FeedPostView, Page } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export type FeedPostBody = {
  caption: string | null;
  vehicleId: string | null;
  eventId: string | null;
  aspect: "portrait_4_5" | "square" | "landscape";
  clientId: string;
  photos: { uploadKey: string; plateRects: unknown[] | null; noPlateConfirmed: boolean }[];
};

export const feedApi = {
  /** Le curseur est opaque : renvoyé tel quel. */
  feed: (filter: FeedFilter, cursor?: string | null) => request<FeedPage>(`/api/fil${qs({ filter, cursor })}`),
  feedLess: (kind: FeedCardKind) =>
    request<{ kinds: FeedCardKind[] }>("/api/me/feed/less", { method: "POST", body: { kind } }),
  feedLessUndo: (kind: FeedCardKind) =>
    request<{ kinds: FeedCardKind[] }>(`/api/me/feed/less/${kind}`, { method: "DELETE" }),
  fireFeedPost: (id: string, on: boolean) =>
    request<{ reactionsCount: number; reactedByMe: boolean }>(`/api/feed-posts/${id}/reaction`, {
      method: on ? "PUT" : "DELETE",
    }),
  createFeedPost: (body: FeedPostBody) =>
    request<FeedPostView>("/api/me/feed-posts", { method: "POST", body, timeout: 30_000 }),
  removeFeedPost: (id: string) => request<unknown>(`/api/me/feed-posts/${id}`, { method: "DELETE" }),
  myFeedPosts: (cursor?: string | null) => request<Page<FeedPostView>>(`/api/me/feed-posts${qs({ cursor })}`),
};
