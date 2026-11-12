// L'icône « Plus » de la page d'une structure ou d'un pro (lot R8g) : un menu (`<details>`, il marche sans JavaScript) qui porte ce
// que la page offrait déjà et qui n'est pas le bouton principal : partager, signaler, devenir staff, l'espace du propriétaire.
import { Icon } from "@orasso/design-system/web";
import { pagesLabels as L } from "@orasso/shared";
import type { ReactNode } from "react";

import "../../styles/pages.css";

export function PageMore({ children }: { children: ReactNode }) {
  return (
    <details className="pt-more pg-more" data-testid="page-more">
      <summary className="pt-side__btn" aria-label={L.more} title={L.more}>
        <Icon name="more" size={20} />
      </summary>
      <div className="pt-more__sheet pg-more__sheet" data-testid="page-more-sheet">
        {children}
      </div>
    </details>
  );
}
