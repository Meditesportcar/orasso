// Aide de la zone qui défile (lot 59c, retour de Damien sur l'APK d'essai : « galère de zoom et de se déplacer » sur la
// carte). Une carte native posée dans la page qui défile se fait voler ses gestes : sur Android, le défilement (et le
// « tirer pour recharger ») prend la main dès que le doigt bouge à la verticale, et le pincement casse. Tant qu'un doigt
// est sur la carte, elle « tient » la page (`hold`) : défilement et rechargement coupés. `reveal` fait défiler juste ce
// qu'il faut pour montrer une vue sous la carte (la fiche de l'étiquette touchée).
import { createContext, useContext } from "react";
import type { View } from "react-native";

export type ScrollAssist = {
  /** Coupe (`true`) ou rend (`false`) le défilement et le rechargement de la page. */
  hold: (on: boolean) => void;
  /** Fait défiler la page pour que la vue soit entièrement visible (rien si elle l'est déjà). */
  reveal: (view: View | null) => void;
};

export const ScrollAssistContext = createContext<ScrollAssist | null>(null);

/**
 * Où défiler pour montrer une vue (positions à l'écran) : `null` si elle est déjà entière ; son bas si elle dépasse en
 * bas ; son haut si elle est plus haute que la page (lot 59c, tour 2 : un groupe de fiches garde ses premières visibles).
 */
export function revealOffset(m: {
  offset: number;
  pageY: number;
  pageH: number;
  viewY: number;
  viewH: number;
  margin: number;
}): number | null {
  const bottomOverflow = m.viewY + m.viewH - (m.pageY + m.pageH);
  if (bottomOverflow <= 0) return null;
  if (m.viewH + 2 * m.margin > m.pageH) return m.offset + (m.viewY - m.pageY) - m.margin;
  return m.offset + bottomOverflow + m.margin;
}

/** L'aide de la page qui défile autour de l'écran ; `null` hors d'un gabarit d'écran. */
export function useScrollAssist(): ScrollAssist | null {
  return useContext(ScrollAssistContext);
}
