// Partager un contenu d'Orasso (lot R7f4) : la feuille d'infos, la story de carte, la carte au Fil. Aucune règle ici : l'API
// décide de ce qui se partage, par qui et vers où (`/me/share/info` dit aussi pourquoi une destination est fermée).
import type { FeedPostView, ShareInfo, StoryAudience, StoryCreated, StoryLinkType } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export type LinkedStoryBody = {
  linked: { type: StoryLinkType; id: string };
  clientId: string;
  audience: StoryAudience;
  crewId?: string;
  persona: "fan";
  caption: string | null;
  frame: { scale: number; offsetX: number; offsetY: number };
};

export const shareApi = {
  shareInfo: (type: StoryLinkType, id: string) => request<ShareInfo>(`/api/me/share/info${qs({ type, id })}`),
  shareStory: (body: LinkedStoryBody) =>
    request<StoryCreated>("/api/me/stories", { method: "POST", body, timeout: 60_000 }),
  shareToFeed: (body: { linked: { type: "event" | "vehicle"; id: string }; clientId: string; caption: string | null }) =>
    request<FeedPostView>("/api/me/feed-posts", { method: "POST", body, timeout: 60_000 }),
};
