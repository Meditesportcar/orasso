// Stories, côté lecture (lot R7f2) : la barre du Fil, les stories d'un auteur, vue, flamme, réponse, mise en sourdine,
// suppression. Aucune règle ici : l'API décide de ce qui est visible (R7f1). Les fichiers passent par une route protégée
// (`/api/stories/:id/media/:nom`, session exigée) lue avec le jeton (`CrewPhotoImage`).
import type {
  StoriesByAuthor,
  StoryBar,
  StoryMentions,
  StoryReplyResult,
  StoryShared,
  StoryTagKind,
} from "@orasso/shared";

import { request } from "../http";

export type StoryViewers = {
  /** Compteur relu à cet appel (le titre « Vues · N » part de lui, pas du compteur reçu à l'ouverture). */
  total: number;
  viewers: { userId: string; pseudo: string; avatarUrl: string | null; viewedAt: string }[];
};

export const storiesApi = {
  storiesBar: () => request<StoryBar>("/api/stories/bar"),
  storiesByAuthor: (key: string) => request<StoriesByAuthor>(`/api/stories/by-author/${encodeURIComponent(key)}`),
  /** Idempotent : une vue par personne et par story. */
  storyView: (id: string) => request<unknown>(`/api/stories/${id}/view`, { method: "POST" }),
  storyReact: (id: string, on: boolean) =>
    request<{ reacted: boolean }>(`/api/stories/${id}/reaction`, { method: on ? "PUT" : "DELETE" }),
  storyReply: (id: string, text: string, clientId: string) =>
    request<StoryReplyResult>(`/api/stories/${id}/reply`, { method: "POST", body: { text, clientId } }),
  storyMute: (key: string, on: boolean) =>
    request<unknown>(`/api/me/story-mutes/${encodeURIComponent(key)}`, { method: on ? "PUT" : "DELETE" }),
  storyDelete: (id: string) => request<unknown>(`/api/me/stories/${id}`, { method: "DELETE" }),
  storyViewers: (id: string) => request<StoryViewers>(`/api/me/stories/${id}/viewers`),
  /** Lot R7h : reprendre une story où je suis identifié dans la mienne (au nom d'une structure, sinon en mon nom). */
  storyShare: (id: string, asStructureId?: string) =>
    request<StoryShared>(`/api/stories/${id}/share-to-mine`, {
      method: "POST",
      body: asStructureId ? { asStructureId } : {},
    }),
  /** Lot R7h : les stories qui identifient la structure ou un de ses événements. */
  storyMentions: (structureId: string, cursor?: string | null) =>
    request<StoryMentions>(
      `/api/structures/${structureId}/story-mentions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  /** L'identifié retire son identification : la story reste (`target` : structure ou pro seulement). */
  storyTagRemove: (id: string, target?: { kind: Exclude<StoryTagKind, "user">; id: string }) =>
    request<unknown>(`/api/me/story-tags/${id}/remove`, { method: "POST", body: target }),
};
