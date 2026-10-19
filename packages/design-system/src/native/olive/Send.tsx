// L'envoi (lot 39) : SendProgress, la voiture vue de dessus avance sur la route au rythme de l'envoi et se gare dans le
// O à 100 % (remplace UploadProgress de l'appli) ; SendBurst, une candidature envoyée : un tour de drift, la voiture se
// gare, le O s'allume (pic de néon, un seul à la fois). Réduction des animations : pas de trajet, fondu de 120 ms.

import { useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { olive } from "../../motion";
import { duration, easings } from "../motionHooks";
import { useNeonPulse } from "../neon";
import { useTheme } from "../theme";
import { CAR_OUT_LEFT } from "./brandCar";
import { OLoader } from "./OLoader";
import { CarTop, carBox, fadeIn, OMark, parkCar } from "./shared";

/** Hauteur de la piste, en px ; le O au bout fait la même taille. */
const TRACK = 56;
const CAR = 30;

export type SendProgressProps = {
  /** Avancement de l'envoi, 0 → 1. À 1, la voiture se gare dans le O. */
  progress: number;
  /** Appelé quand la voiture est garée. */
  onParked?: () => void;
};

export function SendProgress({ progress, onParked }: SendProgressProps) {
  const { t, reducedMotion } = useTheme();
  const [road, setRoad] = useState(0);
  const p = Math.max(0, Math.min(1, progress));
  const complete = p >= 1;
  const value = useSharedValue(reducedMotion ? p : 0);
  const offset = useSharedValue(complete ? 0 : CAR_OUT_LEFT);
  const carOpacity = useSharedValue(complete ? 0 : 1);
  const fade = useSharedValue(1);
  const parked = useRef(onParked);
  parked.current = onParked;

  useEffect(() => {
    if (reducedMotion) {
      value.value = p;
      return;
    }
    value.value = withTiming(p, { duration: duration.base, easing: easings.out });
  }, [p, reducedMotion, value]);

  useEffect(() => {
    if (!complete) {
      offset.value = CAR_OUT_LEFT;
      carOpacity.value = 1;
      return;
    }
    if (reducedMotion) {
      offset.value = 0;
      carOpacity.value = 0;
      fadeIn(fade);
      const timer = setTimeout(() => parked.current?.(), duration.fast);
      return () => clearTimeout(timer);
    }
    const timers = [
      setTimeout(() => {
        carOpacity.value = withTiming(0, { duration: duration.fast, easing: easings.linear });
        parkCar(offset, CAR_OUT_LEFT);
      }, duration.base),
      setTimeout(() => parked.current?.(), duration.base + olive.park),
    ];
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [complete, reducedMotion, offset, carOpacity, fade]);

  const box = carBox(CAR);
  const doneStyle = useAnimatedStyle(() => {
    "worklet";
    return { width: value.value * road };
  });
  const carStyle = useAnimatedStyle(() => {
    "worklet";
    return { opacity: carOpacity.value, transform: [{ translateX: value.value * road - box.width / 2 }] };
  });
  const fadeStyle = useAnimatedStyle(() => {
    "worklet";
    return { opacity: fade.value };
  });

  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
      style={[styles.row, fadeStyle]}
    >
      <View style={styles.track} onLayout={(e: LayoutChangeEvent) => setRoad(e.nativeEvent.layout.width)}>
        <View style={[styles.road, styles.full, { backgroundColor: t.color.line }]} />
        <Animated.View style={[styles.road, { backgroundColor: t.color.accent }, doneStyle]} />
        {!reducedMotion && (
          <Animated.View
            pointerEvents="none"
            style={[styles.car, { width: box.width, height: box.height, top: (TRACK - box.height) / 2 }, carStyle]}
          >
            <CarTop length={CAR} color={t.color.accent} smoke={0.6} />
          </Animated.View>
        )}
      </View>
      <OMark size={TRACK} offset={offset} />
    </Animated.View>
  );
}

export type SendBurstProps = {
  /** Appelé quand le O s'est allumé : l'écran affiche « Candidature envoyée ». */
  onDone?: () => void;
  size?: number;
  /** Rejouer (recette). */
  playKey?: unknown;
};

/** Une candidature envoyée : un tour de drift, la voiture se gare, le O s'allume. */
export function SendBurst({ onDone, size = 120, playKey }: SendBurstProps) {
  const { t, reducedMotion } = useTheme();
  const [done, setDone] = useState(reducedMotion);
  const { style: glow, fire } = useNeonPulse();
  const finish = useRef(onDone);
  finish.current = onDone;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `playKey` rejoue l'envoi (recette)
  useEffect(() => {
    setDone(reducedMotion);
    if (reducedMotion) return;
    const timer = setTimeout(() => setDone(true), olive.orbit);
    return () => clearTimeout(timer);
  }, [reducedMotion, playKey]);

  return (
    <View style={[styles.burst, { width: size, height: size }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          { width: size * 0.5, height: size * 0.4, borderRadius: size, boxShadow: t.shadow.neonAccent },
          glow,
        ]}
      />
      <OLoader
        key={String(playKey ?? "")}
        size={size}
        done={done}
        label="Candidature envoyée"
        onParked={() => {
          fire();
          setTimeout(() => finish.current?.(), duration.poster);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, height: TRACK },
  track: { flex: 1, height: TRACK, justifyContent: "center" },
  road: { position: "absolute", left: 0, height: 4, borderRadius: 2 },
  full: { right: 0 },
  car: { position: "absolute", left: 0 },
  burst: { alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute" },
});
