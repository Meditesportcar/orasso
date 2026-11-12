// Le journal d'un événement, ses mentions, l'épingle et « Masquer de la fiche » (vague R8, lot R8d). Aucune règle ici : l'API les
// tient (qui voit quoi, qui épingle, qui masque), chaque écriture revérifie les droits.
import type { EventMentionsSection, FeedPostView, MentionsPage, PinState, PublicPostView } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

/** La page du journal : des `FeedPostView` avec une session, des `PublicPostView` sans (liste blanche, jamais la personne). */
export type JournalPage = { items: (FeedPostView | PublicPostView)[]; nextCursor: string | null };

export const eventJournalApi = {
  eventJournal: (eventId: string, cursor?: string | null) =>
    request<JournalPage>(`/api/events/${encodeURIComponent(eventId)}/feed-posts${qs({ cursor })}`),
  eventMentions: (eventId: string, section: EventMentionsSection, cursor?: string | null, hidden = false) =>
    request<MentionsPage>(
      `/api/events/${encodeURIComponent(eventId)}/mentions${qs({ section, cursor, hidden: hidden ? "1" : undefined })}`,
    ),
  pinJournalPost: (eventId: string, postId: string, pin: boolean) =>
    request<PinState>(`/api/events/${encodeURIComponent(eventId)}/feed-posts/${encodeURIComponent(postId)}/pin`, {
      method: pin ? "PUT" : "DELETE",
    }),
  hideEventMention: (eventId: string, postId: string, hidden: boolean) =>
    request<{ hidden: boolean }>(
      `/api/mentions/${encodeURIComponent(`e:${eventId}`)}/${encodeURIComponent(postId)}/hidden`,
      { method: hidden ? "PUT" : "DELETE" },
    ),
};
