// Glissement entre onglets (lot 40, ARCHITECTURE-DA-V2 § 3.1, V4 : sans `pager-view`) : posé par `PersonaTabs` sur le
// conteneur des onglets. Un geste horizontal franc (12 px, moins de 8 px à la verticale) lâché au-delà d'un quart de
// l'écran ou à 600 px/s ouvre l'onglet voisin ; l'écran qui arrive se gare depuis le côté (`SwipeEntry`), ou apparaît
// en fondu avec « Réduire les animations ».
// Le geste passe par le `PanResponder` de React Native (aucune dépendance) : `react-native-gesture-handler` n'est pas
// installé dans l'appli et l'ajouter imposerait une dépendance native (voir le journal des choix, lot 40). Les listes
// horizontales et la carte prennent le geste avant lui (le répondeur le plus profond est servi d'abord) ; un écran peut
// aussi le couper tant qu'il est affiché (`useTabSwipeDisabled`).
import { useFocusEffect } from "expo-router";
import { createContext, type MutableRefObject, useCallback, useContext, useMemo, useRef } from "react";
import { PanResponder, type PanResponderInstance, useWindowDimensions } from "react-native";

import { shouldCaptureSwipe, swipeDirection } from "./swipe";

/** Le dernier glissement : sens et instant, lu par l'écran qui arrive pour se garer du bon côté. */
export type LastSwipe = { direction: 1 | -1; at: number };

export type TabSwipeControl = {
  /** Coupe le glissement jusqu'à l'appel de la fonction rendue (carte, carrousel). */
  disable: () => () => void;
  lastSwipe: MutableRefObject<LastSwipe | null>;
};

export const TabSwipeContext = createContext<TabSwipeControl | null>(null);

/** Le geste et sa commande : `panHandlers` à poser sur le conteneur, `control` à fournir par `TabSwipeContext`. */
export function useTabSwipe(onSwipe: (direction: 1 | -1) => void): {
  panHandlers: PanResponderInstance["panHandlers"];
  control: TabSwipeControl;
} {
  const { width } = useWindowDimensions();
  const widthRef = useRef(width);
  widthRef.current = width;
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  const disabled = useRef(0);
  const lastSwipe = useRef<LastSwipe | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => disabled.current === 0 && shouldCaptureSwipe(g.dx, g.dy),
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, g) => {
          // `vx` est en px/ms.
          const direction = swipeDirection(g.dx, g.vx * 1000, widthRef.current);
          if (direction === 0) return;
          lastSwipe.current = { direction, at: Date.now() };
          onSwipeRef.current(direction);
        },
      }),
    [],
  );

  const control = useMemo<TabSwipeControl>(
    () => ({
      disable: () => {
        disabled.current += 1;
        let released = false;
        return () => {
          if (released) return;
          released = true;
          disabled.current -= 1;
        };
      },
      lastSwipe,
    }),
    [],
  );

  return { panHandlers: responder.panHandlers, control };
}

/** Coupe le glissement entre onglets tant que l'écran est affiché (carte, carrousel horizontal). */
export function useTabSwipeDisabled(disabled = true) {
  const control = useContext(TabSwipeContext);
  useFocusEffect(
    useCallback(() => {
      if (!control || !disabled) return undefined;
      return control.disable();
    }, [control, disabled]),
  );
}
