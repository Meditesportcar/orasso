// Le parking vu de dessus (exposant, diapo 4) : l'entrée en bas, deux zones, le chemin moutarde jusqu'à la place, et la
// Supra (la voiture du O, vue de dessus) qui suit le chemin en glissant dans les virages. Réduction des animations :
// la voiture est garée sur sa place.
import { CarTop, duration, Text, tokens, useTheme } from "@orasso/design-system/native";
import { tutoArt } from "@orasso/shared";
import { useEffect, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";

import { Enter, Tag, useEnterProgress } from "../kit";

const radius = tokens.radius;

/** Le plan se dessine dans un repère fixe de 300 × 210, mis à l'échelle de la largeur disponible. */
const W = 300;
const H = 210;
/** Le chemin : de l'entrée jusqu'à la place, en trois segments. */
const PATH: readonly (readonly [number, number])[] = [
  [150, 200],
  [150, 128],
  [72, 128],
  [72, 64],
];
/** Longueur de la voiture ; sa boîte de dessin (fumée comprise) fait le double en largeur, 1 fois en hauteur. */
const CAR = 36;

const lengths = PATH.slice(1).map(([x, y], i) => {
  const [px = 0, py = 0] = PATH[i] ?? [0, 0];
  return Math.hypot(x - px, y - py);
});
const total = lengths.reduce((a, b) => a + b, 0);
/** Part du trajet à chaque sommet (0 → 1). */
const stops = PATH.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0) / total);
const xs = PATH.map(([x]) => x);
const ys = PATH.map(([, y]) => y);
/** Cap de la voiture (nez vers la droite à 0°) : vers le haut, vers la gauche, vers le haut. Le virage est lissé. */
const headStops = [0, stops[1] ?? 0, (stops[1] ?? 0) + 0.06, stops[2] ?? 0, (stops[2] ?? 0) + 0.06, 1];
const headings = [-90, -90, -180, -180, -270, -270];
const pathD = PATH.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");

export function ParkingPlan() {
  const { t, reducedMotion } = useTheme();
  const { parking } = tutoArt;
  const [scale, setScale] = useState(1);
  const onLayout = (event: LayoutChangeEvent) => setScale(event.nativeEvent.layout.width / W);
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `progress` est stable
  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(1400, withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.quad) }));
  }, [reducedMotion]);
  const car = useAnimatedStyle(() => {
    "worklet";
    const p = progress.value;
    const x = interpolate(p, stops, xs);
    const y = interpolate(p, stops, ys);
    const heading = interpolate(p, headStops, headings);
    return {
      transform: [{ translateX: x - CAR }, { translateY: y - CAR / 2 }, { rotate: `${heading}deg` }],
    };
  });
  const dash = useEnterProgress(900, duration.poster);
  const trail = useAnimatedStyle(() => ({ opacity: dash.value }));
  return (
    <View
      onLayout={onLayout}
      style={{ width: "100%", height: H * scale }}
      accessibilityLabel={parking.label}
      accessibilityRole="image"
    >
      <View style={[styles.plan, { width: W, height: H, transform: [{ scale }] }]}>
        <Svg width={W} height={H}>
          <Rect
            x={4}
            y={6}
            width={140}
            height={110}
            rx={radius.radiusSm}
            fill="none"
            stroke={t.color.plateChip}
            strokeWidth={1.5}
          />
          <Rect
            x={156}
            y={6}
            width={140}
            height={110}
            rx={radius.radiusSm}
            fill="none"
            stroke={t.color.plateChip}
            strokeWidth={1.5}
          />
          <Rect
            x={4}
            y={140}
            width={292}
            height={64}
            rx={radius.radiusSm}
            fill="none"
            stroke={t.color.plateLine}
            strokeWidth={1}
          />
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, trail]}>
          <Svg width={W} height={H}>
            <Path
              d={pathD}
              fill="none"
              stroke={t.color.accent}
              strokeWidth={3}
              strokeDasharray="2 8"
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
        <View style={styles.zoneJdm}>
          <Text variant="meta" color={t.color.plateMuted}>
            {parking.zoneJdm}
          </Text>
        </View>
        <View style={styles.zoneEuro}>
          <Text variant="meta" color={t.color.plateMuted}>
            {parking.zoneEuro}
          </Text>
        </View>
        <View style={styles.entry}>
          <Text variant="meta" color={t.color.plateMuted}>
            {parking.entry}
          </Text>
        </View>
        <Animated.View style={[styles.car, { width: CAR * 2, height: CAR }, car]}>
          <CarTop length={CAR} color={t.color.accent} smoke={0} />
        </Animated.View>
      </View>
      <View style={styles.scanTag}>
        <Enter kind="pop" delay={500}>
          <Tag kind="acc" icon="qr">
            {parking.scan}
          </Tag>
        </Enter>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plan: { position: "absolute", left: 0, top: 0, transformOrigin: "0% 0%" },
  zoneJdm: { position: "absolute", left: 12, top: 12 },
  zoneEuro: { position: "absolute", left: 164, top: 12 },
  entry: { position: "absolute", left: 12, top: 176 },
  car: { position: "absolute", left: 0, top: 0, alignItems: "center", justifyContent: "center" },
  scanTag: { position: "absolute", right: 0, bottom: 0 },
});
