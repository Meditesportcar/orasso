// OpeningBattle : l'ouverture de l'appli (lot 39, remplace OpeningScreen ; V12 : 3 s à chaque lancement). Le O, agrandi
// au centre de l'écran ; deux voitures vues de dessus driftent autour en tandem, l'une chasse l'autre ; la première se
// gare dans le O (la voiture du logo), la chasse s'efface, puis le logotype se compose (le O reprend sa place, les
// lettres se découvrent). Pas de traces de pneus. Réduction des animations : logo composé, fondu de 120 ms.

import { useEffect, useId, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { olive } from "../../motion";
import { LogoLetters, oTransform, useTone } from "../Brand";
import { brandArt } from "../brandArt";
import { Ground } from "../Ground";
import { duration, easings } from "../motionHooks";
import { useTheme } from "../theme";
import { AnimatedCar, CAR_OUT_LEFT } from "./brandCar";
import { driftOrbit } from "./path";
import { CAR_UNITS, fadeIn, O_CENTER, ORBIT, OrbitCar, parkCar, useAppActive, useOliveClock } from "./shared";

const { logoViewBox } = brandArt;
const [, , viewW, viewH] = logoViewBox;
/** Le O agrandi pendant la battle (prototype : 1,9). */
const ZOOM = 1.9;
/** Bord droit du O dans le logotype : les lettres se découvrent à partir de là. */
const O_RIGHT = 140;
/** La voiture de tête se gare à ce moment ; le logotype se compose ensuite pendant `poster`. */
const PARK_AT = olive.open - olive.park - duration.poster;
const COMPOSE_AT = PARK_AT + olive.park;

export type OpeningBattleProps = {
  /** Appelé à la fin (3 s, ou 120 ms avec la réduction des animations) : l'appli passe à son premier écran. */
  onDone?: () => void;
  /** Largeur du logotype composé, en px. */
  logoWidth?: number;
  /** Rejouer (recette) : change la clé pour relancer. */
  playKey?: unknown;
  /** Rendu sans le fond (aperçu dans une carte de la recette). */
  bare?: boolean;
};

/** La battle et le logo, sans le fond. */
export function OpeningBattleLogo({ onDone, logoWidth = 260, playKey }: Omit<OpeningBattleProps, "bare">) {
  const { t, reducedMotion } = useTheme();
  const version = useTone("auto");
  const active = useAppActive();
  const id = `ob${useId().replaceAll(":", "")}`;
  const width = logoWidth;
  const height = (width * viewH) / viewW;
  // Décalage du centre du O par rapport au centre du logotype, en px à l'échelle 1.
  const dx = width * (0.5 - O_CENTER.x / viewW);
  const kz = (width * ZOOM) / viewW;
  const stagePx = (ORBIT.radius + CAR_UNITS) * 2 * kz;
  const boxH = Math.max(height, stagePx);

  const compose = useSharedValue(reducedMotion ? 1 : 0);
  const offset = useSharedValue(reducedMotion ? 0 : CAR_OUT_LEFT);
  const cars = useSharedValue(reducedMotion ? 0 : 1);
  const fade = useSharedValue(1);
  const [running, setRunning] = useState(false);
  const clock = useOliveClock(!reducedMotion && active && running);
  const done = useRef(onDone);
  done.current = onDone;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `playKey` rejoue l'ouverture (recette)
  useEffect(() => {
    if (reducedMotion) {
      compose.value = 1;
      offset.value = 0;
      cars.value = 0;
      fadeIn(fade);
      const timer = setTimeout(() => done.current?.(), duration.fast);
      return () => clearTimeout(timer);
    }
    compose.value = 0;
    offset.value = CAR_OUT_LEFT;
    cars.value = 1;
    clock.value = 0;
    setRunning(true);
    const timers = [
      setTimeout(() => {
        cars.value = withTiming(0, { duration: duration.fast, easing: easings.linear });
        parkCar(offset, CAR_OUT_LEFT);
      }, PARK_AT),
      setTimeout(() => {
        compose.value = withTiming(1, { duration: duration.poster, easing: easings.park });
      }, COMPOSE_AT),
      setTimeout(() => {
        setRunning(false);
        done.current?.();
      }, olive.open),
    ];
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [reducedMotion, playKey, compose, offset, cars, fade, clock]);

  const logoStyle = useAnimatedStyle(() => {
    "worklet";
    const s = 1 + (ZOOM - 1) * (1 - compose.value);
    return { opacity: fade.value, transform: [{ translateX: s * dx * (1 - compose.value) }, { scale: s }] };
  });
  const lettersStyle = useAnimatedStyle(() => {
    "worklet";
    const from = O_RIGHT / viewW;
    return { width: width * (from + (1 - from) * compose.value), opacity: compose.value };
  });
  const leadStyle = useAnimatedStyle(() => {
    "worklet";
    const p = driftOrbit(clock.value / olive.orbit, ORBIT.radius, ORBIT.squash);
    return {
      opacity: cars.value,
      transform: [{ translateX: p.x * kz }, { translateY: p.y * kz }, { rotate: `${p.heading}rad` }],
    };
  });
  const chaseStyle = useAnimatedStyle(() => {
    "worklet";
    const p = driftOrbit(clock.value / olive.orbit - olive.tandemGap, ORBIT.radius + 8, ORBIT.squash);
    return {
      opacity: cars.value,
      transform: [{ translateX: p.x * kz }, { translateY: p.y * kz }, { rotate: `${p.heading}rad` }],
    };
  });

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Orasso"
      style={[styles.box, { width, height: boxH }]}
    >
      <Animated.View style={[{ width, height }, logoStyle]}>
        <Animated.View style={[styles.layer, styles.clip, { height }, lettersStyle]}>
          <Svg width={width} height={height} viewBox={logoViewBox.join(" ")}>
            <LogoLetters id={`${id}l`} ink={brandArt.logoInk[version]} withO={false} />
          </Svg>
        </Animated.View>
        <View style={[styles.layer, { width, height }]}>
          <Svg width={width} height={height} viewBox={logoViewBox.join(" ")}>
            <Path transform={oTransform} d={brandArt.oPath} fill={brandArt.ink[version]} fillRule="evenodd" />
            <AnimatedCar id={`${id}c`} offset={offset} clipHole />
          </Svg>
        </View>
      </Animated.View>
      {!reducedMotion && (
        <View pointerEvents="none" style={[
            styles.stage,
            { width: stagePx, height: stagePx, left: (width - stagePx) / 2, top: (boxH - stagePx) / 2 },
          ]}>
          <OrbitCar stagePx={stagePx} length={CAR_UNITS * kz} color={t.color.poster} style={chaseStyle} />
          <OrbitCar stagePx={stagePx} length={CAR_UNITS * kz} color={t.color.accent} style={leadStyle} />
        </View>
      )}
    </View>
  );
}

/** L'écran d'ouverture : la battle en tandem sur le fond immobile, puis le logo composé. Une fois par lancement. */
export function OpeningBattle({ onDone, logoWidth, playKey, bare = false }: OpeningBattleProps) {
  const logo = <OpeningBattleLogo onDone={onDone} logoWidth={logoWidth} playKey={playKey} />;
  if (bare) return <View style={styles.center}>{logo}</View>;
  return (
    <Ground variant="battle" still>
      <View style={styles.center}>{logo}</View>
    </Ground>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
  layer: { position: "absolute", top: 0, left: 0 },
  clip: { overflow: "hidden" },
  stage: { position: "absolute" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
