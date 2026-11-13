// Un pied posé sous le contenu d'une page d'onglet sans toucher à l'écran (lot R9n, T21) : l'onglet « Page » montre l'écran
// d'aujourd'hui de la casquette, puis la ligne « Mes casquettes ». `TabScreen` lit ce contexte et ajoute le pied à la fin de sa
// zone qui défile ; sans fournisseur, rien ne change pour les autres écrans.
import { createContext, type ReactNode, useContext } from "react";

const PageFooterContext = createContext<ReactNode>(null);

export function PageFooterProvider({ footer, children }: { footer: ReactNode; children: ReactNode }) {
  return <PageFooterContext.Provider value={footer}>{children}</PageFooterContext.Provider>;
}

export const usePageFooter = (): ReactNode => useContext(PageFooterContext);
