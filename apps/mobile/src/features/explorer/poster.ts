// Vignettes de l'appli (lot 44, relecture) : seulement l'affiche générée ; sans elle, le gabarit « Minimal ». L'affiche
// perso de l'organisateur ne sert jamais de vignette ni de vedette : elle vit dans le détail de la fiche.
import type { EventCard, EventPublic } from "@orasso/shared";

/** Affiche d'une carte d'événement, `null` = gabarit « Minimal ». */
export const cardPoster = (e: Pick<EventCard, "generatedPosterUrl">): string | null => e.generatedPosterUrl ?? null;

/** Affiche en vedette de la fiche, `null` = gabarit « Minimal ». */
export const heroPoster = (e: Pick<EventPublic, "poster">): string | null => e.poster?.postUrl ?? null;
