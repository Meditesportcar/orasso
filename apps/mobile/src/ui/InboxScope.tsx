// La Boîte (lot 40) : hors de la barre d'onglets, elle se rend avec le gabarit d'onglet (`TabScreen`) posé dans ce
// cadre, qui allume la pastille Boîte de la barre du haut, met ✕ pour revenir et ouvre les notifications en tête.
// Un contexte et non le chemin : les onglets restés montés sous la Boîte voient aussi le chemin `/boite`.
import { createContext, type ReactNode, useContext } from "react";

const InboxContext = createContext(false);

export function InboxScope({ children }: { children: ReactNode }) {
  return <InboxContext.Provider value>{children}</InboxContext.Provider>;
}

/** L'écran est-il la Boîte ? */
export function useInInbox(): boolean {
  return useContext(InboxContext);
}
