// « Un néon ne pulse que pour un événement » (README Motion) et un seul à la fois : le pic de néon du résultat de
// scan, le bandeau tamponné d'une affiche… demandent le droit de pulser ; si un autre néon pulse déjà, ils
// s'allument sans pic. Le droit se rend à la fin du pic (`poster`).

import { useCallback, useEffect, useRef } from "react";
import { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { duration, easings } from "./motionHooks";
import { useTheme } from "./theme";

let holder: symbol | null = null;

/** Demande le droit de pulser ; renvoie la fonction qui le rend, ou `null` si un autre néon pulse. */
export function claimNeon(): (() => void) | null {
  if (holder) return null;
  const mine = Symbol("neon");
  holder = mine;
  return () => {
    if (holder === mine) holder = null;
  };
}

/**
 * Un pic de néon : renvoie le style d'une couche (à poser avec le néon du pic) dont l'opacité retombe de 1 à 0 en
 * `poster`, et `fire()` qui le lance. Sans le droit (autre pic en cours) ou avec « réduction des animations »,
 * rien ne pulse.
 */
export function useNeonPulse() {
  const { reducedMotion } = useTheme();
  const level = useSharedValue(0);
  const release = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    release.current?.();
    release.current = null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  const fire = useCallback(() => {
    if (reducedMotion) return;
    stop();
    const granted = claimNeon();
    if (!granted) return;
    release.current = granted;
    cancelAnimation(level);
    level.value = 1;
    level.value = withTiming(0, { duration: duration.poster, easing: easings.out });
    timer.current = setTimeout(stop, duration.poster);
  }, [level, reducedMotion, stop]);

  const style = useAnimatedStyle(() => ({ opacity: level.value }));
  return { style, fire };
}
