// Corps du titre d'un souvenir (« Tu étais là : … ») : il suit le mot le plus large dans la largeur mesurée du bloc, police
// du système comprise, pour ne jamais se couper au milieu d'un mot (lot R7j, tour 2). Sans mesure : le corps du jeton.
import { useState } from "react";
import { type LayoutChangeEvent, useWindowDimensions } from "react-native";

import { fitWideTitleSize } from "@/features/home/fit";

const FLOOR = 14;

/** `inset` : l'espace de chaque côté du texte dans le bloc mesuré (son remplissage). */
export function useTitleFit(title: string, max: number, inset = 0) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const size = fitWideTitleSize(title, width > 0 ? width - 2 * inset : 0, fontScale, max, FLOOR);
  return {
    onLayout: (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width),
    style: { fontSize: size, lineHeight: Math.round(size * 1.04) },
  };
}
