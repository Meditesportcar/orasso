import { REVIEW_MAX_RATING } from "@orasso/shared";

/**
 * Note d'un avis en étoiles (caractère ★ du prototype « Ton avis » : l'icône étoile du jeu est réservée aux points et
 * grades). Pleines en moutarde lisible (`--accent-text`), vides en encre atténuée ; lue « 2 étoiles sur 3 ».
 */
export function Stars({ rating }: { rating: number }) {
  const label = `${rating} étoile${rating > 1 ? "s" : ""} sur ${REVIEW_MAX_RATING}`;
  return (
    <span className="s-stars" role="img" aria-label={label}>
      <span className="s-stars__on" aria-hidden="true">
        {"★".repeat(rating)}
      </span>
      <span className="s-stars__off" aria-hidden="true">
        {"★".repeat(Math.max(REVIEW_MAX_RATING - rating, 0))}
      </span>
    </span>
  );
}
