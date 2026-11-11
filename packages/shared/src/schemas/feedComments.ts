import { z } from "zod";

import { reportReasonAllowed, reportReasons } from "../moderation";
import { FEED_COMMENT_MAX, FEED_MENTION_QUERY_MIN, type MentionWhy } from "../rules/feedComments";
import { optionalText } from "./common";
import type { FeedCommentPreview } from "./feed";

// Commentaires d'une publication du Fil (lot R8k1, ARCHITECTURE-R8 § 2.6) : entrées Zod et vues rendues (liste blanche).

/**
 * `POST /feed-posts/:id/comments`. Le texte est rogné (1 à 300 caractères). `clientId` : tiré par l'appareil, un nouvel
 * essai après une réponse perdue rend le même commentaire. **Aucune casquette en entrée** (T7 : en livraison 2 on commente
 * en son nom) : un champ inconnu (`persona`, `structureId`…) est refusé, jamais ignoré en silence.
 */
export const feedCommentCreateSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Écris un commentaire")
      .max(FEED_COMMENT_MAX, `${FEED_COMMENT_MAX} caractères au plus`),
    parentId: z.uuid().nullish(),
    clientId: z.uuid(),
  })
  .strict();
export type FeedCommentCreateInput = z.infer<typeof feedCommentCreateSchema>;

/** `GET /feed-posts/:id/comments` et `GET /feed-comments/:id/replies`. */
export const feedCommentsQuery = z.object({ cursor: z.string().max(200).optional() });

/** `PUT /me/feed-posts/:id/comments-off`. */
export const feedCommentsOffSchema = z.object({ off: z.boolean() }).strict();

/** `GET /feed-posts/:id/mention-suggestions?q=` : moins de 2 caractères = pas de recherche, seulement mes liens. */
export const mentionSuggestionsQuery = z.object({
  q: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((q) => (q && q.length >= FEED_MENTION_QUERY_MIN ? q : "")),
});

/** `POST /feed-comments/:id/report` : le motif (liste du type `feed_comment`) et, pour « Autre », quelques mots. */
export const feedCommentReportSchema = z
  .object({ reason: z.enum(reportReasons), details: optionalText(1000) })
  .refine((v) => v.reason !== "other" || Boolean(v.details), {
    message: "Précise le motif « Autre » en quelques mots",
    path: ["details"],
  })
  .refine((v) => reportReasonAllowed("feed_comment", v.reason), {
    message: "Motif inconnu pour ce type de signalement",
    path: ["reason"],
  });

/**
 * Un commentaire rendu : l'aperçu (auteur, texte, date) et ce qui sert à l'écran. Jamais d'identifiant de compte :
 * `mentions` ne porte que des pseudos (ceux qui peuvent voir la publication, à afficher en lien).
 * `repliesCount` et `reactionsCount` sont des **totaux** (les réponses d'un compte privé que je ne suis pas y sont comptées).
 */
export type FeedCommentView = FeedCommentPreview & {
  mentions: string[];
  reactionsCount: number;
  reactedByMe: boolean;
  repliesCount: number;
  mine: boolean;
  canDelete: boolean;
};

export type FeedCommentPage = { items: FeedCommentView[]; nextCursor: string | null };

export type FeedCommentReaction = { reactionsCount: number; reactedByMe: boolean };

/** Une personne proposée après « @ » : jamais un identifiant de compte. */
export type MentionSuggestion = { pseudo: string; avatarUrl: string | null; why: MentionWhy };
