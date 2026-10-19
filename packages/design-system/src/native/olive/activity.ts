// OliveActivity (lot 39, relecture) : le O vivant et le fond « battle » s'arrêtent quand l'écran n'est pas affiché,
// sans dépendre du bon vouloir de chaque écran. L'appli pose une fois `OliveActivityProvider` autour de chaque écran
// (ou de la pile) avec `active={useIsFocused()}` (lot 40) ; sans fournisseur, tout est actif. Le natif y ajoute l'état
// de l'appli (AppState) et le site la visibilité de la page. Pur React : partagé par le natif et le site.

import { createContext, createElement, type ReactNode, useContext } from "react";

const OliveActivityContext = createContext(true);

/** L'écran qui contient ce sous-arbre est affiché (`useIsFocused()` dans l'appli). */
export function OliveActivityProvider({ active, children }: { active: boolean; children?: ReactNode }) {
  const parent = useContext(OliveActivityContext);
  return createElement(OliveActivityContext.Provider, { value: parent && active }, children);
}

/** Vrai si aucun fournisseur ancêtre ne dit que l'écran est caché. */
export function useOliveScreenActive(): boolean {
  return useContext(OliveActivityContext);
}
