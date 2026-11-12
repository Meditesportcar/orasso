// Le Fil (lot R7e2) : l'écran, « Publier au Fil », « Mes publications ». Aucune règle ici : l'API les tient (lot R7e1).
// Les photos d'une publication passent par une route privée (`GET /feed-posts/:id/photos/:name`, session exigée) :
// l'image envoie le jeton (`FeedPhoto`).
import type {
  AttachableEventItem,
  FeedCardKind,
  FeedFilter,
  FeedPage,
  FeedPostView,
  ImportantReason,
  NotifyPreview,
  Page,
  SeenEntry,
  StoryPersona,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export type FeedPostBody = {
  caption: string | null;
  vehicleId?: string | null;
  eventId: string | null;
  /** Vague R8 (lot R8p) : la casquette, jamais un rôle (l'API le déduit des droits). */
  persona?: StoryPersona;
  expectedUserId?: string;
  structureId?: string;
  proId?: string;
  placeLabel?: string;
  important?: { reason: ImportantReason };
  commercialPartnerId?: string | null;
  aspect: "portrait_4_5" | "square" | "landscape";
  clientId: string;
  photos: { uploadKey: string; plateRects: unknown[] | null; noPlateConfirmed: boolean }[];
};

export const feedApi = {
  /** Le curseur est opaque : renvoyé tel quel. */
  feed: (filter: FeedFilter, cursor?: string | null) => request<FeedPage>(`/api/fil${qs({ filter, cursor })}`),
  /** Nouveautés depuis l'instant du parcours affiché (`FeedPage.ref`) : la pastille « Nouvelles publications » (R8c2). */
  feedFresh: (filter: FeedFilter, since: string) =>
    request<{ count: number }>(`/api/fil/fresh${qs({ filter, since })}`),
  /** Les cartes vues, ouvertes ou partagées (lots de 50 au plus, 204 sans corps). */
  feedSeen: (cards: SeenEntry[]) =>
    request<unknown>("/api/me/fil/seen", { method: "POST", body: { cards }, timeout: 15_000 }),
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
  /** Les événements où la casquette peut rattacher une publication (rôle déduit par l'API). */
  attachableEvents: (query: { persona: StoryPersona; structureId?: string; proId?: string }) =>
    request<{ items: AttachableEventItem[] }>(`/api/me/feed-posts/attachable-events${qs(query)}`),
  /** Combien d'inscrits une « Info importante » préviendrait (responsables de l'événement). */
  eventNotifyPreview: (eventId: string) => request<NotifyPreview>(`/api/events/${eventId}/notify-preview`),
  /** Vérifier un envoi dont la réponse s'est perdue : ma publication envoyée avec cet identifiant (404 si elle n'existe pas). */
  feedPostByClient: (clientId: string) => request<FeedPostView>(`/api/me/feed-posts/by-client/${clientId}`),
  removeFeedPost: (id: string) => request<unknown>(`/api/me/feed-posts/${id}`, { method: "DELETE" }),
  myFeedPosts: (cursor?: string | null) => request<Page<FeedPostView>>(`/api/me/feed-posts${qs({ cursor })}`),
};
