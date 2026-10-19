// StampDrop (lot 39, préparé pour le passeport du lot 50) : au scan, le O frappe la page — il tombe de haut (échelle
// 1,8, penché), écrase la page, se pose penché de −8° — et l'encre bave un peu autour. L'encre, la forme et le petit
// désordre (angle, bavure) viennent de l'appelant : `seed` rend le même tampon à chaque affichage.
// Réduction des animations : le tampon posé, fondu de 120 ms.

import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { oTransform } from "../Brand";
import { brandArt } from "../brandArt";
import { duration, easings } from "../motionHooks";
import { useTheme } from "../theme";
import { seededRandom } from "./path";

export type StampShape = "o" | "round" | "square";

export type StampDropProps = {
  /** Encre du tampon (jeton `stamp-ink-*` du département ; `stamp-ink-default` sinon). */
  ink?: string;
  /** `o` : le O seul ; `round` : le O dans un cercle ; `square` : dans un cadre arrondi. */
  shape?: StampShape;
  /** Graine du désordre (angle, bavure) : même graine, même tampon. */
  seed?: number;
  size?: number;
  onDone?: () => void;
  /** Rejouer (recette). */
  playKey?: unknown;
};

/** Angle posé du tampon, en degrés, et départ penché de 6° de plus. */
const REST_ANGLE = -8;
const DROP_ANGLE = -6;
const DROP_SCALE = 1.8;
const IMPACT = 0.55;

export function StampDrop({ ink, shape = "round", seed = 1, size = 96, onDone, playKey }: StampDropProps) {
  const { t, reducedMotion } = useTheme();
  const color = ink ?? t.color.stampInkDefault;
  const random = seededRandom(seed);
  const jitter = (random() - 0.5) * 8;
  const bleed = { x: (random() - 0.5) * 3, y: (random() - 0.5) * 3, scale: 1.03 + random() * 0.03 };
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const fade = useSharedValue(1);
  const done = useRef(onDone);
  done.current = onDone;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `playKey` rejoue le tampon (recette)
  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      fade.value = 0;
      fade.value = withTiming(1, { duration: duration.fast, easing: easings.linear });
      const timer = setTimeout(() => done.current?.(), duration.fast);
      return () => clearTimeout(timer);
    }
    progress.value = 0;
    progress.value = withTiming(1, { duration: duration.poster, easing: easings.park });
    const timer = setTimeout(() => done.current?.(), duration.poster);
    return () => clearTimeout(timer);
  }, [reducedMotion, playKey, progress, fade]);

  const stampStyle = useAnimatedStyle(() => {
    "worklet";
    const p = progress.value;
    // Chute jusqu'à l'impact (échelle 1,8 → 0,94), puis la page rend un peu (0,94 → 1).
    const scale = p < IMPACT ? DROP_SCALE + (0.94 - DROP_SCALE) * (p / IMPACT) : 0.94 + 0.06 * ((p - IMPACT) / (1 - IMPACT));
    const angle = REST_ANGLE + jitter + DROP_ANGLE * (1 - p);
    return {
      opacity: fade.value * Math.min(1, p / IMPACT),
      transform: [{ rotate: `${angle}deg` }, { scale }],
    };
  });
  const bleedStyle = useAnimatedStyle(() => {
    "worklet";
    const p = progress.value;
    return { opacity: p < IMPACT ? 0 : 0.32 * ((p - IMPACT) / (1 - IMPACT)) };
  });

  const art = (fill: string) => (
    <Svg width={size} height={size} viewBox="-30 -50 200 200">
      {shape === "round" && <Circle cx={67.7} cy={50} r={92} fill="none" stroke={fill} strokeWidth={9} />}
      {shape === "square" && (
        <Rect x={-22} y={-34} width={180} height={168} rx={26} fill="none" stroke={fill} strokeWidth={9} />
      )}
      <Path transform={oTransform} d={brandArt.oPath} fill={fill} fillRule="evenodd" />
    </Svg>
  );

  return (
    <View aria-hidden style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, stampStyle]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ translateX: bleed.x }, { translateY: bleed.y }, { scale: bleed.scale }] },
            bleedStyle,
          ]}
        >
          {art(color)}
        </Animated.View>
        {art(color)}
      </Animated.View>
    </View>
  );
}
