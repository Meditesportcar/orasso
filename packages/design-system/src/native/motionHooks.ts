// Mouvement « tout se gare » en natif (Reanimated). Les durées, les courbes et les distances viennent des jetons
// et de ../motion.ts, les mêmes que sur le site. Réduction des animations : tout devient un fondu `fast`.

import { useCallback, useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  type EasingFunction,
  type EasingFunctionFactory,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { bezier, duration, park } from "../motion";
import { useTheme } from "./theme";

export { duration, park };

type Bezier = readonly [number, number, number, number];
const bez = (b: Bezier): EasingFunction | EasingFunctionFactory => Easing.bezier(b[0], b[1], b[2], b[3]);

/** Les quatre courbes du système (jetons `easing`). */
export const easings = {
  park: bez(bezier.park),
  inout: bez(bezier.inout),
  out: bez(bezier.out),
  linear: Easing.linear,
} as const;

/** Le geste « se garer » : park jusqu'au dépassement (60 % de `base`), puis inout jusqu'à la place. */
const PARK_SPLIT = 0.6;

/** Progression 0 → 1 (dépassement) → 2 (en place). Réduction des animations : fondu `fast`, linéaire. */
export function startPark(progress: SharedValue<number>, delay: number, reduced: boolean) {
  progress.value = 0;
  if (reduced) {
    progress.value = withDelay(0, withTiming(2, { duration: duration.fast, easing: easings.linear }));
    return;
  }
  progress.value = withDelay(
    delay,
    withSequence(
      withTiming(1, { duration: duration.base * PARK_SPLIT, easing: easings.park }),
      withTiming(2, { duration: duration.base * (1 - PARK_SPLIT), easing: easings.inout }),
    ),
  );
}

export type ParkAxis = "y" | "x";

/**
 * Style animé d'une apparition qui se gare : arrive de `from` px, dépasse de `overshoot` px, se range.
 * `from` négatif = arrive d'au-dessus / de la gauche. Rejoue quand `trigger` change.
 */
export function useParkStyle(options?: {
  axis?: ParkAxis;
  from?: number;
  overshoot?: number;
  delay?: number;
  trigger?: unknown;
  enabled?: boolean;
}) {
  const {
    axis = "y",
    from = park.from,
    overshoot = park.overshoot,
    delay = 0,
    trigger,
    enabled = true,
  } = options ?? {};
  const { reducedMotion } = useTheme();
  const progress = useSharedValue(enabled ? 0 : 2);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `trigger` rejoue l'entrée à la demande
  useEffect(() => {
    if (enabled) startPark(progress, delay, reducedMotion);
    else progress.value = 2;
  }, [enabled, delay, reducedMotion, trigger, progress]);
  return useAnimatedStyle(() => {
    const p = progress.value;
    const opacity = reducedMotion ? interpolate(p, [0, 2], [0, 1]) : interpolate(p, [0, 1, 2], [0, 1, 1]);
    const offset = reducedMotion ? 0 : interpolate(p, [0, 1, 2], [from, -overshoot, 0]);
    return {
      opacity,
      transform: axis === "y" ? [{ translateY: offset }] : [{ translateX: offset }],
    };
  });
}

/** Fondu seul (entrée neutre ; repli de tout le mouvement), `fast`. */
export function useFadeStyle(trigger?: unknown) {
  const progress = useSharedValue(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `trigger` rejoue l'entrée à la demande
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: duration.fast, easing: easings.linear });
  }, [trigger, progress]);
  return useAnimatedStyle(() => ({ opacity: progress.value }));
}

/** Appui : échelle 0,97 en `fast`. Retourne le style et les deux gestionnaires à brancher sur le Pressable. */
export function usePressScale() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onPressIn = useCallback(() => {
    scale.value = withTiming(park.pressScale, { duration: duration.fast, easing: easings.inout });
  }, [scale]);
  const onPressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: duration.fast, easing: easings.inout });
  }, [scale]);
  return { style, onPressIn, onPressOut };
}

// --- Le fond qui respire (Ground) : le seul mouvement continu ---------------------------------------------------

/** Halo : l'échelle passe de 1 à 1,07 et revient, courbe inout, `breath`. */
export const BREATH_SCALE = 1.07;
/** Faisceau : balaie de −12 % à +12 % de sa largeur, linéaire, aller-retour, `sweep`. */
export const SWEEP_TRAVEL = 0.12;
/** Phares : images clés de l'opacité (pourcentage du cycle `phares`, opacité). */
export const PHARES_KEYFRAMES: readonly (readonly [number, number])[] = [
  [0, 1],
  [8, 1],
  [14, 0.45],
  [20, 0.45],
  [26, 1],
  [32, 1],
  [38, 0.45],
  [44, 0.45],
  [50, 1],
  [100, 1],
];

/** Boucle du halo : valeur partagée de 0 à 1 (aller-retour), arrêtée quand `active` est faux. */
export function useBreath(active: boolean) {
  const value = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(value);
      value.value = 0;
      return;
    }
    value.value = withRepeat(
      withSequence(
        withTiming(1, { duration: duration.breath / 2, easing: easings.inout }),
        withTiming(0, { duration: duration.breath / 2, easing: easings.inout }),
      ),
      -1,
    );
    return () => cancelAnimation(value);
  }, [active, value]);
  return value;
}

/** Boucle des phares : opacité de 1 à 0,45 selon PHARES_KEYFRAMES. */
export function usePhares(active: boolean) {
  const value = useSharedValue(1);
  useEffect(() => {
    if (!active) {
      cancelAnimation(value);
      value.value = 1;
      return;
    }
    const steps = PHARES_KEYFRAMES.slice(1).map(([at, opacity], i) => {
      const previous = PHARES_KEYFRAMES[i]?.[0] ?? 0;
      return withTiming(opacity, { duration: ((at - previous) / 100) * duration.phares, easing: easings.inout });
    });
    value.value = withRepeat(withSequence(...steps), -1);
    return () => cancelAnimation(value);
  }, [active, value]);
  return value;
}

/** Boucle du faisceau : 0 → 1 → 0 en linéaire, `sweep` pour chaque sens. */
export function useSweep(active: boolean) {
  const value = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(value);
      value.value = 0;
      return;
    }
    value.value = withRepeat(withTiming(1, { duration: duration.sweep, easing: easings.linear }), -1, true);
    return () => cancelAnimation(value);
  }, [active, value]);
  return value;
}
