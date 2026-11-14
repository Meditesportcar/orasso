// Les chips de gestion de la Page du propriétaire (lot R9h partie 2, T50 ; maquette R9.3 `r9gest`), sur le site : sous l'en-tête, visibles
// de lui seul, les portes vers les écrans de réglage de sa casquette (« Équipe », « Réglages de la structure », « Modifier ma fiche »…).
// Des puces compactes (contour fin, l'icône puis le libellé en casse normale), jamais le bouton principal de l'écran ; la rangée passe à la
// ligne quand la police est agrandie, rien ne se coupe. Des liens : ils marchent sans JavaScript.
import { Icon, type IconName } from "@orasso/design-system/web";
import { pagesLabels as L } from "@orasso/shared";

import "../../styles/pages.css";

export type GestItem = { id: string; icon: IconName; label: string; href: string };

export function PageGest({ items }: { items: readonly GestItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav className="pg-gest" aria-label={L.gestGroup} data-testid="page-gest">
      {items.map((i) => (
        <a key={i.id} className="pg-gest__chip" href={i.href} data-testid={`page-gest-${i.id}`}>
          <Icon name={i.icon} size={16} />
          <span>{i.label}</span>
        </a>
      ))}
    </nav>
  );
}
