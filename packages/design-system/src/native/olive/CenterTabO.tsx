// CenterTabO (lot 39) : le O de l'onglet central de la barre. Sur l'onglet central (Accueil, Direct), la voiture du logo
// est garée dans le O ; ailleurs, elle en sort par la droite. Quand on revient, elle arrive de la gauche et se gare.
// Réduction des animations : changement immédiat, fondu de 120 ms.

import { useEffect, useRef } from "react";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { BrandTone } from "../Brand";
import { duration, easings } from "../motionHooks";
import { useTheme } from "../theme";
import { CAR_OUT_LEFT, CAR_OUT_RIGHT } from "./brandCar";
import { fadeIn, OMark, parkCar } from "./shared";

export type CenterTabOProps = {
  /** L'onglet central est l'onglet actif : la voiture est garée. */
  active: boolean;
  size?: number;
  tone?: BrandTone;
};

export function CenterTabO({ active, size = 30, tone = "dark" }: CenterTabOProps) {
  const { reducedMotion } = useTheme();
  const offset = useSharedValue(active ? 0 : CAR_OUT_RIGHT);
  const fade = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    cancelAnimation(offset);
    if (reducedMotion) {
      offset.value = active ? 0 : CAR_OUT_RIGHT;
      fadeIn(fade);
      return;
    }
    if (active) parkCar(offset, CAR_OUT_LEFT);
    else offset.value = withTiming(CAR_OUT_RIGHT, { duration: duration.base * 2, easing: easings.inout });
  }, [active, reducedMotion, offset, fade]);

  const fadeStyle = useAnimatedStyle(() => {
    "worklet";
    return { opacity: fade.value };
  });
  return (
    <Animated.View style={fadeStyle}>
      <OMark size={size} offset={offset} tone={tone} />
    </Animated.View>
  );
}
