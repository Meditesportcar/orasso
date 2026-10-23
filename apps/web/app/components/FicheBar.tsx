// En-tête de fiche du site (lot M7, deux modes d'affichage, comme l'appli) : sur une fiche ou un parcours du compte, le
// titre et le ✕ qui revient, toujours au même endroit (en haut à droite), à la place du titre de la page et des liens
// « ← Retour » de chaque écran. La route le déclare par `handle = ficheHandle` : l'espace connecté retire alors la
// bande ORASSO, la barre d'onglets et l'accès flottant (mode B). `.flowbar` de l'artefact, `AppBar kind="flow"`.
import { AppBar } from "@orasso/design-system/web";
import type { ReactNode } from "react";

/** Une route du compte en mode B (fiche, parcours) : `export const handle = ficheHandle;`. */
export const ficheHandle = { fiche: true } as const;

/** La page affichée est-elle une fiche ou un parcours (mode B) ? */
export function isFiche(matches: readonly { handle?: unknown }[]): boolean {
  return matches.some((m) => (m.handle as { fiche?: boolean } | undefined)?.fiche === true);
}

export function FicheBar({
  title,
  facts,
  back,
  closeLabel,
  heading = true,
}: {
  title: string;
  facts?: ReactNode;
  /** Où mène le ✕ (sans JavaScript aussi) : l'écran d'où l'on vient d'ordinaire. */
  back: string;
  closeLabel?: string;
  /** Lot M7, tour 2 : `false` quand la page a déjà son titre (`h1`) ; l'en-tête le dit alors sans être un titre. */
  heading?: boolean;
}) {
  return (
    <AppBar
      kind="flow"
      title={title}
      titleAs={heading ? "h1" : "p"}
      facts={facts}
      closeHref={back}
      closeLabel={closeLabel}
      className="fiche-bar"
    />
  );
}
