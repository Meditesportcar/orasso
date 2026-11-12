import { z } from "zod";

import type { AuthorKind } from "../rules/authors";
import type { FeedAttachPhase, ImportantReason } from "../rules/feedAttach";
import type { FeedAttachView, FeedPostPhoto, FeedPostView } from "./feed";

// Listes de publications par auteur, journal d'un événement, mentions, épingle, compteurs (vague R8, lot R8a2).

const cursor = z.string().max(300).optional();

/** `GET /authors/:key/feed-posts?cursor=&filter=` : toutes, rattachées à un événement, ou sans événement. */
export const authorPostsFilters = ["all", "event", "no_event"] as const;
export type AuthorPostsFilter = (typeof authorPostsFilters)[number];
export const authorPostsQuery = z.object({ cursor, filter: z.enum(authorPostsFilters).default("all") });

/** `GET /events/:id/feed-posts?cursor=` : le journal de l'événement. */
export const eventJournalQuery = z.object({ cursor });

/** `GET /events/:id/mentions?section=&cursor=&hidden=` : « Sur place » ou « Passionnés ». `hidden=1` : les responsables. */
export const eventMentionsSections = ["on_site", "fans"] as const;
export type EventMentionsSection = (typeof eventMentionsSections)[number];
export const eventMentionsQuery = z.object({
  section: z.enum(eventMentionsSections),
  cursor,
  hidden: z.enum(["0", "1"]).optional(),
});

/** `GET /authors/:key/mentions?cursor=&hidden=`. */
export const authorMentionsQuery = z.object({ cursor, hidden: z.enum(["0", "1"]).optional() });

/** Une page de la liste d'un auteur. `restricted` : compte privé non suivi (même réponse qu'il ait publié ou non). */
export type AuthorPostsPage = { items: FeedPostView[]; nextCursor: string | null; restricted: boolean };

/** Une mention sur une fiche : la carte, d'où elle vient, et si les responsables l'ont masquée (eux seuls la voient). */
export type MentionItem = { post: FeedPostView; source: "attach" | "caption" | "commercial"; hidden: boolean };
export type MentionsPage = { items: MentionItem[]; nextCursor: string | null };

/** L'état de l'épingle d'un journal. */
export type PinState = { pinnedPostId: string | null };

/** Ce que le lecteur peut faire d'une publication, pour l'affichage (chaque écriture revérifie ses droits). */
export type PostManage = { canDelete: boolean; canPin: boolean; canCommentsOff: boolean; hideFrom: string[] };
export type FeedPostWithManage = FeedPostView & { manage?: PostManage };

/** L'auteur d'une publication servie sans session : la page seulement, jamais une personne. */
export type PublicPostAuthor = {
  key: string;
  kind: AuthorKind;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
};

/**
 * Une publication de l'organisateur vue sans session (T4) : liste blanche. Ni `reactedByMe`, ni commentaires, ni
 * co-auteur, ni `mine`, ni identifiant ou pseudo de la personne qui a publié.
 */
export type PublicPostView = {
  id: string;
  author: PublicPostAuthor;
  caption: string | null;
  photos: FeedPostPhoto[];
  visual: "photos" | "event_poster";
  attach: FeedAttachView | null;
  placeLabel: string | null;
  important: { reason: ImportantReason; sentAt: string | null } | null;
  pinned: boolean;
  reactionsCount: number;
  createdAt: string;
};
export type PublicPostsPage = { items: PublicPostView[]; nextCursor: string | null };

/** Compteurs d'une fiche (décoration des pages). `mentions` absent sans session ; `publications` nul : liste restreinte. */
export type PageCounts = {
  publications?: { count: number };
  mentions?: { count: number };
  /** Lot R8d : mentions masquées de la fiche, **pour un responsable seulement** (la ligne « Mentions » reste tant qu'il y en a). */
  hiddenMentions?: { count: number };
};
export type ProfileCounts = { publications: { count: number } | null };

export type { FeedAttachPhase };
