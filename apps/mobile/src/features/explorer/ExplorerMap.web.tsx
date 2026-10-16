// Carte de l'Explorer dans un navigateur (recette de l'appli, react-native-web) : la carte MapLibre native n'a pas de
// rendu web. On le dit, et l'écran garde la liste. Le rendu natif se vérifie sur l'APK. Aucune importation de
// `@maplibre/maplibre-react-native` ici : le module natif ne se charge pas dans un navigateur.
import { explorerLabels } from "@orasso/shared";

import { Notice } from "@/ui/Notice";
import type { MapPin } from "./mapPins";

/** Faux : pas de carte ici, l'écran affiche la liste à la place. */
export const mapSupported = false;

export function ExplorerMap(_props: { pins: MapPin[]; onOpen: (pin: MapPin) => void }) {
  return <Notice>{explorerLabels.mapUnavailableWeb}</Notice>;
}
