// L'étiquette « Offre » d'une publication, sur le site (lot R9c) : l'étiquette, le titre en gras et la ligne des dates (icône
// calendrier), sur la carte du Fil, la vue « Une par une » et la page d'une publication seule. Rien sur les vignettes de la grille.
// Une offre terminée garde la même ligne, l'étiquette au contour (neutre). Mêmes mots que l'appli.
import { Icon } from "@orasso/design-system/web";
import { type OfferView, offerDatesLabel, proOffersLabels as T } from "@orasso/shared";

import "../../styles/pro-offers.css";

/** L'étiquette dans l'en-tête de la carte, à droite du nom ; neutre quand l'offre est terminée. */
export function OfferTag({ offer }: { offer: OfferView }) {
  const ended = offer.state === "ended";
  return (
    <span className={ended ? "po-tag po-tag--ended" : "po-tag"} data-testid="feed-post-offer-tag">
      <Icon name="ticket" size={13} /> {ended ? T.tagEnded : T.tag}
    </span>
  );
}

/** Les dates et le titre en gras, avant la légende. */
export function OfferLine({ offer }: { offer: OfferView }) {
  return (
    <div className="po-line" data-testid="feed-post-offer">
      <div className="po-line__row">
        <span className="po-dates">
          <Icon name="calendar" size={14} />
          <span data-testid="feed-post-offer-dates">{offerDatesLabel(offer)}</span>
        </span>
      </div>
      <p className="po-line__title" data-testid="feed-post-offer-title">
        {offer.title}
      </p>
    </div>
  );
}
