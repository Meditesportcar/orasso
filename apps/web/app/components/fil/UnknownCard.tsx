// Carte neutre pour un genre que cet écran ne dessine pas encore (`spot_meetup` : lot R7i ; `memory` : lot R7j) ou inconnu :
// la raison, rien d'autre.
import { Icon } from "@orasso/design-system/web";
import { feedCardKindLabels, feedScreenLabels as L } from "@orasso/shared";

import { type CardProps, Shell } from "./Shell";

export function UnknownCard({ card, onMenu, faded }: CardProps) {
  return (
    <Shell
      card={card}
      head={
        <span className="fil-logo fil-logo--trophy" aria-hidden="true">
          <Icon name="feed" size={20} />
        </span>
      }
      title={feedCardKindLabels[card.kind] ?? "Le Fil"}
      onMenu={onMenu}
      faded={faded}
    >
      <p className="o-t-caption">{L.unknownCard}</p>
    </Shell>
  );
}
