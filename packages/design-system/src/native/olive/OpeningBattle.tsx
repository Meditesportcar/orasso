// OpeningBattle : l'ouverture de l'appli (lot 39, remplace OpeningScreen ; V12 : 3 s à chaque lancement). Le O, agrandi
// au centre de l'écran ; deux voitures vues de dessus driftent autour en tandem, l'une chasse l'autre ; la voiture de
// tête quitte le drift et se gare dans le O (elle devient la voiture du logo), la chasse s'efface, puis le logotype se
// compose (le O reprend sa place, les lettres se découvrent). Pas de traces de pneus. Un toucher n'importe où passe
// l'ouverture (état final, puis `onDone`) : le staff qui relance l'appli sur le parking n'attend pas 3 s.
// Réduction des animations : logo composé, fondu de 120 ms.

import { useEffect, useId, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { olive } from "../../motion";
import { type BrandTone, LogoLetters, oTransform, useTone } from "../Brand";
import { brandArt } from "../brandArt";
import { Ground } from "../Ground";
import { duration, easings } from "../motionHooks";
import { useTheme } from "../theme";
import { AnimatedCar, CAR_OUT_LEFT } from "./brandCar";
import { driftOrbit } from "./path";
import { CAR_UNITS, fadeIn, O_CENTER, ORBIT, OrbitCar, useOliveActive, useOliveClock } from "./shared";

const { logoViewBox, carTop } = brandArt;
const [, , viewW, viewH] = logoViewBox;
/** Le O agrandi pendant la battle (prototype : 1,9). */
const ZOOM = 1.9;
/** Bord droit du O dans le logotype : les lettres se découvrent à partir de là. */
const O_RIGHT = 140;
/** La voiture de tête se gare à ce moment ; le logotype se compose ensuite pendant `poster`. */
const PARK_AT = olive.open - olive.park - duration.poster;
const COMPOSE_AT = PARK_AT + olive.park;
/** Garée, la caisse de la voiture vue de dessus (60 unités sur 64) prend la longueur de la voiture du logo (66). */
const PARKED_SCALE = (66 / 60) * (carTop.box[2] / CAR_UNITS);

export type OpeningBattleProps = {
  /** Appelé à la fin (3 s, ou 120 ms avec la réduction des animations, ou au toucher) : l'appli passe à la suite. */
  onDone?: () => void;
  /** Largeur du logotype composé, en px. */
  logoWidth?: number;
  /** Rejouer (recette) : change la clé pour relancer. */
  playKey?: unknown;
  /** Rendu sans le fond ni le toucher qui passe (aperçu dans une carte de la recette). */
  bare?: boolean;
  /** Version du logo : selon le thème par défaut ; `light` (O noir) sur une affiche crème, `dark` sur la nuit. */
  tone?: BrandTone;
};

/** La battle et le logo, sans le fond. `skipped` saute à l'état final puis appelle `onDone`. */
export function OpeningBattleLogo({
  onDone,
  logoWidth = 260,
  playKey,
  tone = "auto",
  skipped = false,
}: Omit<OpeningBattleProps, "bare"> & { skipped?: boolean }) {
  const { t, reducedMotion } = useTheme();
  const version = useTone(tone);
  const active = useOliveActive();
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
  const chase = useSharedValue(reducedMotion ? 0 : 1);
  const lead = useSharedValue(reducedMotion ? 0 : 1);
  const park = useSharedValue(0);
  const parkT = useSharedValue(0);
  const fade = useSharedValue(1);
  const [running, setRunning] = useState(false);
  const clock = useOliveClock(!reducedMotion && active && running);
  const done = useRef(onDone);
  done.current = onDone;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  };

  /** L'état final : logo composé, voiture du logo garée. */
  const finalState = () => {
    for (const value of [compose, offset, chase, lead, park]) cancelAnimation(value);
    compose.value = 1;
    offset.value = 0;
    chase.value = 0;
    lead.value = 0;
    park.value = 0;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `playKey` rejoue l'ouverture (recette)
  useEffect(() => {
    clear();
    if (reducedMotion) {
      finalState();
      fadeIn(fade);
      timers.current = [setTimeout(() => done.current?.(), duration.fast)];
      return clear;
    }
    compose.value = 0;
    offset.value = CAR_OUT_LEFT;
    chase.value = 1;
    lead.value = 1;
    park.value = 0;
    clock.value = 0;
    setRunning(true);
    timers.current = [
      setTimeout(() => {
        // La voiture de tête quitte le drift d'où elle est et se gare dans le O ; la chasse s'efface.
        parkT.value = clock.value / olive.orbit;
        park.value = withTiming(1, { duration: olive.park, easing: easings.park });
        chase.value = withTiming(0, { duration: duration.fast, easing: easings.linear });
      }, PARK_AT),
      setTimeout(() => {
        // Garée : elle devient la voiture du logo, le logotype se compose.
        offset.value = 0;
        lead.value = withTiming(0, { duration: duration.fast, easing: easings.linear });
        compose.value = withTiming(1, { duration: duration.poster, easing: easings.park });
      }, COMPOSE_AT),
      setTimeout(() => {
        setRunning(false);
        done.current?.();
      }, olive.open),
    ];
    return clear;
  }, [reducedMotion, playKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le toucher déclenche le saut
  useEffect(() => {
    if (!skipped) return;
    clear();
    finalState();
    setRunning(false);
    timers.current = [setTimeout(() => done.current?.(), duration.fast)];
    return clear;
  }, [skipped]);

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
    const e = park.value;
    const p = driftOrbit(e > 0 ? parkT.value : clock.value / olive.orbit, ORBIT.radius, ORBIT.squash);
    const heading = Math.atan2(Math.sin(p.heading), Math.cos(p.heading));
    return {
      opacity: lead.value,
      transform: [
        { translateX: p.x * kz * (1 - e) },
        { translateY: p.y * kz * (1 - e) },
        { rotate: `${heading * (1 - e)}rad` },
        { scale: 1 + (PARKED_SCALE - 1) * e },
      ],
    };
  });
  const chaseStyle = useAnimatedStyle(() => {
    "worklet";
    const p = driftOrbit(clock.value / olive.orbit - olive.tandemGap, ORBIT.radius + 8, ORBIT.squash);
    return {
      opacity: chase.value,
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
        <View
          pointerEvents="none"
          style={[
            styles.stage,
            { width: stagePx, height: stagePx, left: (width - stagePx) / 2, top: (boxH - stagePx) / 2 },
          ]}
        >
          <OrbitCar stagePx={stagePx} length={CAR_UNITS * kz} color={brandArt.ink[version]} style={chaseStyle} />
          <OrbitCar stagePx={stagePx} length={CAR_UNITS * kz} color={t.color.accent} style={leadStyle} />
        </View>
      )}
    </View>
  );
}

/**
 * L'écran d'ouverture : la battle en tandem sur le fond immobile, puis le logo composé. Une fois par lancement ; un
 * toucher n'importe où la passe.
 */
export function OpeningBattle({ onDone, logoWidth, playKey, bare = false, tone }: OpeningBattleProps) {
  const [skipped, setSkipped] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: rejouer réarme le toucher
  useEffect(() => setSkipped(false), [playKey]);
  const logo = (
    <OpeningBattleLogo onDone={onDone} logoWidth={logoWidth} playKey={playKey} tone={tone} skipped={skipped} />
  );
  if (bare) return <View style={styles.center}>{logo}</View>;
  return (
    <Ground variant="battle" still testID="opening-battle">
      <Pressable
        style={styles.center}
        onPress={() => setSkipped(true)}
        accessibilityRole="button"
        accessibilityLabel="Orasso"
        accessibilityHint="Passer"
        testID="opening-skip"
      >
        {logo}
      </Pressable>
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
