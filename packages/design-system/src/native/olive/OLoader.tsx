// OLoader : l'indicateur de chargement d'Orasso (lot 39, remplace Loader). La voiture vue de dessus drifte autour du O
// (un tour en `olive.orbit`), le nez vers l'intérieur, roues contre-braquées ; quand `done` passe à vrai, elle
// s'efface et la voiture du logo se gare dans le O (`olive.park`), puis `onParked`. Jamais une roue qui tourne.
// `progress` (0 → 1) ajoute l'anneau moutarde qui se remplit autour du O (l'envoi, décision de Damien v39).
// Petites tailles (bouton) : voiture plus grande et à l'encre du O. Réduction des animations : le O s'affiche garé en
// fondu de 120 ms.

import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Ellipse, Path } from "react-native-svg";
import { olive } from "../../motion";
import { type BrandTone, useTone } from "../Brand";
import { brandArt } from "../brandArt";
import { Labeled } from "../Labeled";
import { duration, easings } from "../motionHooks";
import { useTheme } from "../theme";
import { CAR_OUT_LEFT } from "./brandCar";
import { driftOrbit } from "./path";
import {
  CAR_UNITS,
  CAR_UNITS_COMPACT,
  COMPACT_MAX,
  centered,
  ellipsePerimeter,
  fadeIn,
  MONO_UNITS,
  OMark,
  ORBIT,
  OrbitCar,
  parkCar,
  RING,
  STAGE,
  STAGE_COMPACT,
  useOliveActive,
  useOliveClock,
} from "./shared";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const RING_LENGTH = ellipsePerimeter(RING.rx, RING.ry);
/** L'anneau en chemin : départ en haut, sens horaire (il se remplit comme une aiguille). */
const RING_D = `M0 ${-RING.ry}A${RING.rx} ${RING.ry} 0 1 1 0 ${RING.ry}A${RING.rx} ${RING.ry} 0 1 1 0 ${-RING.ry}`;

export type OLoaderProps = {
  /** 72 px plein écran, 24 px dans un bouton. */
  size?: number;
  /** Le chargement est fini : la voiture se gare dans le O. */
  done?: boolean;
  /** Appelé quand la voiture est garée (après `olive.park`, ou le fondu de 120 ms). */
  onParked?: () => void;
  /** Version du O : selon le thème ; `light` (O noir) sur un bouton moutarde, `dark` sur la nuit. */
  tone?: BrandTone;
  /** Encre du O (et de la voiture en petite taille) : celle du texte d'un bouton, par exemple. Prime sur `tone`. */
  ink?: string;
  /** Avancement (0 → 1) : l'anneau moutarde autour du O se remplit. Absent : pas d'anneau. */
  progress?: number;
  /** Écran hors focus : l'horloge s'arrête (en plus d'OliveActivityProvider et de l'arrière-plan). */
  paused?: boolean;
  /** Texte alternatif ; `null` : décoratif (le texte voisin dit déjà ce qui charge). */
  label?: string | null;
};

export function OLoader({
  size = 72,
  done = false,
  onParked,
  tone = "auto",
  progress,
  ink: inkProp,
  paused = false,
  label = "Chargement en cours",
}: OLoaderProps) {
  const { t, reducedMotion } = useTheme();
  const version = useTone(tone);
  const active = useOliveActive();
  const compact = size <= COMPACT_MAX;
  const stage = compact ? STAGE_COMPACT : STAGE;
  const k = size / stage;
  const offset = useSharedValue(reducedMotion || done ? 0 : CAR_OUT_LEFT);
  const carOpacity = useSharedValue(reducedMotion || done ? 0 : 1);
  const fade = useSharedValue(1);
  const ring = useSharedValue(progress ?? 0);
  const clock = useOliveClock(!reducedMotion && !done && active && !paused);
  const parked = useRef(onParked);
  parked.current = onParked;

  useEffect(() => {
    if (progress === undefined) return;
    const p = Math.max(0, Math.min(1, progress));
    ring.value = reducedMotion ? p : withTiming(p, { duration: duration.base, easing: easings.out });
  }, [progress, reducedMotion, ring]);

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
  const ringProps = useAnimatedProps(() => {
    "worklet";
    return { strokeDashoffset: RING_LENGTH * (1 - ring.value) };
  });

  const mono = MONO_UNITS * k;
  const ink = inkProp ?? brandArt.ink[version];
  return (
    <Labeled label={label ?? undefined} role="progressbar">
      <Animated.View style={[{ width: size, height: size }, fadeStyle]}>
        {progress !== undefined && (
          <Svg
            width={size}
            height={size}
            viewBox={`${-stage / 2} ${-stage / 2} ${stage} ${stage}`}
            style={{ position: "absolute", left: 0, top: 0 }}
            pointerEvents="none"
          >
            <Ellipse rx={RING.rx} ry={RING.ry} fill="none" stroke={t.color.line} strokeWidth={4} opacity={0.6} />
            <AnimatedPath
              d={RING_D}
              fill="none"
              stroke={t.color.accent}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={`${RING_LENGTH} ${RING_LENGTH}`}
              animatedProps={ringProps}
            />
          </Svg>
        )}
        <View style={centered(size, mono)}>
          <OMark size={mono} offset={offset} tone={tone} ink={inkProp} />
        </View>
        {!reducedMotion && (
          <OrbitCar
            stagePx={size}
            length={(compact ? CAR_UNITS_COMPACT : CAR_UNITS) * k}
            color={compact ? ink : t.color.accent}
            style={carStyle}
          />
        )}
      </Animated.View>
    </Labeled>
  );
}
