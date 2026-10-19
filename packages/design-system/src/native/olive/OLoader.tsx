// OLoader : l'indicateur de chargement d'Orasso (lot 39, remplace Loader). La voiture vue de dessus drifte autour du O
// (un tour en `olive.orbit`), le nez vers l'intérieur, roues contre-braquées ; quand `done` passe à vrai, elle
// s'efface et la voiture du logo se gare dans le O (`olive.park`), puis `onParked`. Jamais une roue qui tourne.
// Réduction des animations : le O s'affiche garé en fondu de 120 ms.

import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { olive } from "../../motion";
import type { BrandTone } from "../Brand";
import { Labeled } from "../Labeled";
import { duration, easings } from "../motionHooks";
import { useTheme } from "../theme";
import { CAR_OUT_LEFT } from "./brandCar";
import { driftOrbit } from "./path";
import {
  CAR_UNITS,
  centered,
  fadeIn,
  MONO_UNITS,
  OMark,
  ORBIT,
  OrbitCar,
  parkCar,
  STAGE,
  STAGE_COMPACT,
  useAppActive,
  useOliveClock,
} from "./shared";

export type OLoaderProps = {
  /** 72 px plein écran, 24 px dans un bouton. */
  size?: number;
  /** Le chargement est fini : la voiture se gare dans le O. */
  done?: boolean;
  /** Appelé quand la voiture est garée (après `olive.park`, ou le fondu de 120 ms). */
  onParked?: () => void;
  tone?: BrandTone;
  /** Écran hors focus (useIsFocused) : l'horloge s'arrête. L'arrière-plan l'arrête de lui-même. */
  paused?: boolean;
  /** Texte alternatif ; `null` : décoratif (le texte voisin dit déjà ce qui charge). */
  label?: string | null;
};

export function OLoader({
  size = 72,
  done = false,
  onParked,
  tone = "auto",
  paused = false,
  label = "Chargement en cours",
}: OLoaderProps) {
  const { t, reducedMotion } = useTheme();
  const active = useAppActive();
  const stage = size <= 32 ? STAGE_COMPACT : STAGE;
  const k = size / stage;
  const offset = useSharedValue(reducedMotion || done ? 0 : CAR_OUT_LEFT);
  const carOpacity = useSharedValue(reducedMotion || done ? 0 : 1);
  const fade = useSharedValue(1);
  const clock = useOliveClock(!reducedMotion && !done && active && !paused);
  const parked = useRef(onParked);
  parked.current = onParked;

  useEffect(() => {
    if (reducedMotion) {
      offset.value = 0;
      carOpacity.value = 0;
      fadeIn(fade);
      if (!done) return;
      const timer = setTimeout(() => parked.current?.(), duration.fast);
      return () => clearTimeout(timer);
    }
    if (!done) {
      cancelAnimation(offset);
      offset.value = CAR_OUT_LEFT;
      carOpacity.value = 1;
      return;
    }
    carOpacity.value = withTiming(0, { duration: duration.fast, easing: easings.linear });
    parkCar(offset, CAR_OUT_LEFT);
    const timer = setTimeout(() => parked.current?.(), olive.park);
    return () => clearTimeout(timer);
  }, [done, reducedMotion, offset, carOpacity, fade]);

  const carStyle = useAnimatedStyle(() => {
    "worklet";
    const p = driftOrbit(clock.value / olive.orbit, ORBIT.radius, ORBIT.squash);
    return {
      opacity: carOpacity.value,
      transform: [{ translateX: p.x * k }, { translateY: p.y * k }, { rotate: `${p.heading}rad` }],
    };
  });
  const fadeStyle = useAnimatedStyle(() => {
    "worklet";
    return { opacity: fade.value };
  });

  const mono = MONO_UNITS * k;
  return (
    <Labeled label={label ?? undefined} role="progressbar">
      <Animated.View style={[{ width: size, height: size }, fadeStyle]}>
        <View style={centered(size, mono)}>
          <OMark size={mono} offset={offset} tone={tone} />
        </View>
        {!reducedMotion && <OrbitCar stagePx={size} length={CAR_UNITS * k} color={t.color.accent} style={carStyle} />}
      </Animated.View>
    </Labeled>
  );
}
