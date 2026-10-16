// Avis après l'événement : entrées et vues (docs/01 « Découvrir et participer », lot 12).
import { z } from "zod";

import { REVIEW_MAX_RATING, REVIEW_MIN_RATING } from "../rules/reviews";

export const reviewCreateSchema = z.object({
  rating: z.number().int().min(REVIEW_MIN_RATING).max(REVIEW_MAX_RATING),
  comment: z.string().trim().min(1, "Commentaire obligatoire").max(1000),
});
export type ReviewCreate = z.infer<typeof reviewCreateSchema>;

export const reviewReplySchema = z.object({
  reply: z.string().trim().min(1, "Réponse vide").max(1000),
});

/** Un avis publié : pseudo de l'auteur, jamais d'autre donnée personnelle. */
export type EventReview = {
  id: string;
  pseudo: string;
  rating: number;
  comment: string;
  createdAt: string;
  reply: { text: string; at: string } | null;
};

/** Avis d'un événement : moyenne seulement à partir de `minForAverage` avis. */
export type EventReviews = {
  count: number;
  average: number | null;
  minForAverage: number;
  items: EventReview[];
};

/** Carnet de route : avis de ma candidature pointée (`null` si je n'ai pas été pointé). */
export type MyReview = {
  /** Fin de la fenêtre (J+7). */
  deadline: string;
  canReview: boolean;
  given: { rating: number; comment: string; reply: string | null } | null;
};
