// Les offres du pro (lot R9c) : l'étiquette « Offre » d'une publication de la fiche. Une offre est une publication comme une
// autre (Fil, listes, commentaires, signalement) ; ce module ne fait que valider ce que le client envoie et rendre la vue.
// - fiche pro seulement : 400 `offer_requires_pro` pour toute autre casquette ;
// - un titre de 2 à 80 caractères, un jour de fin (obligatoire, pas passé), un début facultatif (pas après la fin) : 400
//   `offer_invalid` avec `{ field, reason }` ; les jours sont des jours civils de Paris, le dernier est compris ;
// - la photo (T1) et la limite du mois sont contrôlées par `create` (une offre compte pour une publication).
import {
  type FeedPostCreate,
  type OfferView,
  offerIssue,
  offerState,
  type StoryPersona,
  proOffersLabels as T,
} from "@orasso/shared";

import { AppError } from "../../lib/errors";

/** Ce qui s'écrit dans `feed_posts` pour une offre (titre nettoyé, jours). */
export type OfferColumns = {
  tag: "offer";
  title: string;
  offerStartsOn: string | null;
  offerEndsOn: string;
};

/**
 * Valide l'offre reçue et rend ses colonnes (`null` sans offre). `now` : l'horloge de l'application (jour de Paris).
 * Appelée avant toute écriture.
 */
export function offerColumns(persona: StoryPersona, offer: FeedPostCreate["offer"], now: Date): OfferColumns | null {
  if (!offer) return null;
  if (persona !== "pro") throw new AppError(400, "offer_requires_pro", T.errors.offer_requires_pro);
  const draft = { title: offer.title, startsOn: offer.startsOn || null, endsOn: offer.endsOn || null };
  const issue = offerIssue(draft, now);
  if (issue) {
    throw new AppError(400, "offer_invalid", issue.message, { field: issue.field, reason: issue.code });
  }
  return {
    tag: "offer",
    title: offer.title.trim(),
    offerStartsOn: draft.startsOn,
    offerEndsOn: draft.endsOn as string,
  };
}

/** La vue d'une offre (liste blanche) à partir des colonnes de la publication ; `null` pour toute autre publication. */
export function offerView(
  row: { tag: string | null; title: string | null; offerStartsOn: string | null; offerEndsOn: string | null },
  now: Date,
): OfferView | null {
  if (row.tag !== "offer" || !row.title || !row.offerEndsOn) return null;
  const days = { startsOn: row.offerStartsOn, endsOn: row.offerEndsOn };
  return { title: row.title, ...days, state: offerState(days, now) };
}
