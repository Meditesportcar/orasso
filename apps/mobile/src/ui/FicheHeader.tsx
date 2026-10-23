// L'en-tête de fiche du mode B (lot M7, deux modes d'affichage) : fiche, plein écran, parcours. L'artefact DA v2 le
// dessine en `.flowbar` (titre italique, ligne de faits, compteur, ✕ carré en dernier, posés sur le fond) : le ✕ est
// toujours au même endroit, en haut à droite, avec la même cible (38 px et 3 px de marge d'appui) ; le titre n'est
// jamais coupé (il passe à la ligne, le ✕ reste en haut). Une bande peut prendre la place du titre (`band` :
// l'organisateur d'une fiche événement, dessiné par son écran). Jamais de barre d'onglets avec lui : `FlowScreen` et
// `PosterFlow` la retirent (`useFlowChrome`). Seul moyen de poser cet en-tête : par `FlowScreen`, ou directement par un
// écran qui gère lui-même sa liste (mode staff, conversation).
import { AppBar } from "@orasso/design-system/native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type FicheHeaderProps = {
  title?: string;
  facts?: string;
  counter?: string;
  /** Une bande à la place du titre (l'organisateur d'une fiche événement). */
  band?: ReactNode;
  onClose: () => void;
  /** Nom accessible du ✕ (« Quitter le scan ») ; « Fermer » par défaut. */
  closeLabel?: string;
};

export function FicheHeader({ title, facts, counter, band, onClose, closeLabel }: FicheHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <AppBar
      kind="flow"
      title={title}
      facts={facts}
      counter={counter}
      lead={band}
      onClose={onClose}
      closeLabel={closeLabel}
      safeTop={insets.top}
    />
  );
}
