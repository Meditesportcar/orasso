// Les animations des tutos (lot C3) : les @keyframes de l'artefact (`aUp`, `aPop`, `aInR`, `aTag`, `aPz`, `stampIn`,
// `sentPop`, `qrPop`, `tcPress`, `aBar`, `aOn`…) rejouées avec Reanimated, avec leur délai (`--d`, en secondes) et
// leur durée. Une diapo montée = son animation qui part ; démontée = plus rien ne tourne. Réduction des animations :
// l'état final en fondu de 120 ms, sans mouvement (chaque worklet ci-dessous porte `'worklet'`).
import { duration, textStyles, useTheme } from "@orasso/design-system/native";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Text as RNText, type StyleProp, StyleSheet, type TextStyle, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  type EasingFunction,
  type EasingFunctionFactory,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { FILL, useArt } from "./art";

/** `--park` de l'artefact : cubic-bezier(.12,.75,.25,1). */
export const PARK = Easing.bezier(0.12, 0.75, 0.25, 1);
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

/**
 * Une horloge de 0 à 1 qui part après `d` secondes et dure `dur` secondes. Réduction des animations : 1 tout de suite
 * (et `fade` passe de 0 à 1 en 120 ms, pour le fondu de l'état final).
 */
export function useKey(d: number, dur: number, easing: EasingFunction | EasingFunctionFactory = PARK) {
  const { reducedMotion } = useTheme();
  const p = useSharedValue(reducedMotion ? 1 : 0);
  const fade = useSharedValue(reducedMotion ? 0 : 1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: les valeurs partagées sont stables
  useEffect(() => {
    if (reducedMotion) {
      p.value = 1;
      fade.value = 0;
      fade.value = withTiming(1, { duration: duration.fast });
      return;
    }
    p.value = 0;
    p.value = withDelay(d * 1000, withTiming(1, { duration: dur * 1000, easing }));
  }, [d, dur, reducedMotion]);
  return { p, fade, reduced: reducedMotion };
}

export type AKind =
  | "up"
  | "inUp"
  | "pop"
  | "inr"
  | "fade"
  | "out"
  | "tag"
  | "pz"
  | "phIn"
  | "stamp"
  | "press"
  | "sent"
  | "qrPop"
  | "slide";

/** Durée (s) de chaque keyframe de l'artefact. */
const DUR: Record<AKind, number> = {
  up: 0.55,
  inUp: 0.6,
  pop: 0.45,
  inr: 0.5,
  fade: 0.4,
  out: 0.25,
  tag: 0.45,
  pz: 0.55,
  phIn: 0.6,
  stamp: 0.5,
  press: 0.35,
  sent: 0.55,
  qrPop: 0.65,
  slide: 0.9,
};

/** Le style d'une keyframe à l'instant `k` (0 → 1). `rest` : la pose finale (`--r` : rotation et décalage). */
function frame(kind: AKind, k: number, restX: number, restRot: number): ViewStyle {
  "worklet";
  switch (kind) {
    case "up":
      return {
        opacity: interpolate(k, [0, 0.7, 1], [0, 1, 1]),
        transform: [
          { translateY: interpolate(k, [0, 0.7, 1], [28, -3, 0]) },
          { scale: interpolate(k, [0, 1], [0.97, 1]) },
        ],
      };
    case "inUp":
      return {
        opacity: interpolate(k, [0, 0.7, 1], [0, 1, 1]),
        transform: [
          { translateY: interpolate(k, [0, 0.7, 1], [60, -6, 0]) },
          { scale: interpolate(k, [0, 1], [0.96, 1]) },
        ],
      };
    case "pop":
      return {
        opacity: interpolate(k, [0, 0.7, 1], [0, 1, 1]),
        transform: [{ scale: interpolate(k, [0, 0.7, 1], [0.3, 1.08, 1]) }],
      };
    case "inr":
      return { opacity: k, transform: [{ translateX: interpolate(k, [0, 1], [44, 0]) }] };
    case "fade":
      return { opacity: k };
    case "out":
      return { opacity: 1 - k };
    case "tag":
      return {
        opacity: k,
        transform: [{ translateY: interpolate(k, [0, 1], [10, 0]) }, { scale: interpolate(k, [0, 1], [0.9, 1]) }],
      };
    case "pz":
    case "phIn":
      return {
        opacity: k,
        transform: [
          { translateX: interpolate(k, [0, 1], [0, restX]) },
          { translateY: interpolate(k, [0, 1], [kind === "pz" ? 34 : 46, 0]) },
          { rotate: `${interpolate(k, [0, 1], [0, restRot])}deg` },
          { scale: interpolate(k, [0, 1], [0.8, 1]) },
        ],
      };
    case "stamp":
      return {
        opacity: interpolate(k, [0, 0.55, 1], [0, 1, 1]),
        transform: [
          { scale: interpolate(k, [0, 0.55, 1], [1.8, 0.94, 1]) },
          { rotate: `${interpolate(k, [0, 0.55, 1], [-14, -6, -8])}deg` },
        ],
      };
    case "press":
      return { transform: [{ scale: interpolate(k, [0, 0.4, 1], [1, 0.95, 1]) }] };
    case "sent":
      return {
        opacity: interpolate(k, [0, 0.7, 1], [0, 1, 1]),
        transform: [
          { translateY: interpolate(k, [0, 0.7, 1], [16, -3, 0]) },
          { scale: interpolate(k, [0, 0.7, 1], [0.86, 1.04, 1]) },
        ],
      };
    case "qrPop":
      return {
        opacity: interpolate(k, [0, 0.6, 1], [0, 1, 1]),
        transform: [
          { scale: interpolate(k, [0, 0.6, 1], [0.2, 1.12, 1]) },
          { rotate: `${interpolate(k, [0, 0.6, 1], [-14, 3, 0])}deg` },
        ],
      };
    case "slide":
      return { transform: [{ translateX: interpolate(k, [0, 1], [128, 0]) }] };
  }
}

/** Un élément animé de l'artefact (`a-up`, `a-pop`…) : `d` = `--d` en secondes. */
export function A({
  k,
  d = 0,
  dur,
  rest,
  style,
  children,
  testID,
}: {
  k: AKind;
  d?: number;
  dur?: number;
  /** Pose finale de `pz` / `phIn` : décalage horizontal (px) et rotation (deg). */
  rest?: { x?: number; rot?: number };
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}) {
  const { p, fade, reduced } = useKey(d, dur ?? DUR[k], k === "fade" || k === "out" ? EASE : PARK);
  const rx = rest?.x ?? 0;
  const rr = rest?.rot ?? 0;
  const animated = useAnimatedStyle(() => {
    "worklet";
    if (reduced) {
      const end = frame(k, 1, rx, rr);
      return { ...end, opacity: (end.opacity === undefined ? 1 : Number(end.opacity)) * fade.value };
    }
    return frame(k, p.value, rx, rr);
  });
  return (
    <Animated.View style={[style, animated]} testID={testID}>
      {children}
    </Animated.View>
  );
}

/** `a-bar` : une barre qui se remplit de 0 à `w` %. */
export function Bar({
  w,
  d = 0,
  dur = 0.9,
  from = 0,
  color,
  height = 8,
  track,
  glow,
}: {
  w: number;
  d?: number;
  dur?: number;
  from?: number;
  color?: string;
  height?: number;
  track?: string;
  /** Halo moutarde en fin de course (`barGrow`). */
  glow?: boolean;
}) {
  const a = useArt();
  const { p, reduced } = useKey(d, dur);
  const fill = useAnimatedStyle(() => {
    "worklet";
    const k = reduced ? 1 : p.value;
    return { width: `${from + (w - from) * k}%` };
  });
  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: track ?? a.line }]}>
      <Animated.View
        style={[
          styles.fill,
          { borderRadius: height / 2, backgroundColor: color ?? a.accent },
          glow ? { boxShadow: `0 0 10px ${a.accent}` } : null,
          fill,
        ]}
      />
    </View>
  );
}

/** Fond qui passe à la couleur `to` (`a-on`, `tgFill`, `tcBox`) : `from` avant, `to` après `d` secondes. */
export function Fill({
  from,
  to,
  d = 0,
  dur = 0.3,
  style,
  children,
}: {
  from: string;
  to: string;
  d?: number;
  dur?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { p, reduced } = useKey(d, dur, EASE);
  const animated = useAnimatedStyle(() => {
    "worklet";
    return { backgroundColor: interpolateColor(reduced ? 1 : p.value, [0, 1], [from, to]) };
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Texte dont la couleur passe de `from` à `to` (le libellé d'une puce `a-on`). */
export function FillText({
  from,
  to,
  d = 0,
  dur = 0.3,
  size = 12,
  weight = "b",
  children,
}: {
  from: string;
  to: string;
  d?: number;
  dur?: number;
  size?: number;
  weight?: "b" | "num" | "label";
  children: ReactNode;
}) {
  const { p, reduced } = useKey(d, dur, EASE);
  const base = textStyles[weight === "num" ? "numberNarrow" : weight === "label" ? "label" : "number"] as TextStyle;
  const animated = useAnimatedStyle(() => {
    "worklet";
    return { color: interpolateColor(reduced ? 1 : p.value, [0, 1], [from, to]) };
  });
  return (
    <Animated.Text style={[base, { fontSize: size, lineHeight: Math.round(size * 1.25), letterSpacing: 0 }, animated]}>
      {children}
    </Animated.Text>
  );
}

/** Une valeur partagée qui va de 0 à 1 (exposée pour les scènes qui composent plusieurs propriétés). */
export function useProgress(
  d: number,
  dur: number,
  easing: EasingFunction | EasingFunctionFactory = PARK,
): SharedValue<number> {
  return useKey(d, dur, easing).p;
}

/** `data-count` : un nombre qui défile de `from` à `to` (sortie cubique), écrit à la française (1 284). */
export function Count({
  to,
  from = 0,
  d = 0,
  dur = 0.9,
  style,
}: {
  to: number;
  from?: number;
  d?: number;
  dur?: number;
  style?: StyleProp<TextStyle>;
}) {
  const { reducedMotion } = useTheme();
  const [value, setValue] = useState(reducedMotion ? to : from);
  const raf = useRef(0);
  useEffect(() => {
    if (reducedMotion) {
      setValue(to);
      return;
    }
    setValue(from);
    let t0 = 0;
    const step = (now: number) => {
      if (!t0) t0 = now;
      const k = Math.min(1, (now - t0) / (dur * 1000));
      setValue(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => {
      raf.current = requestAnimationFrame(step);
    }, d * 1000);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf.current);
    };
  }, [to, from, d, dur, reducedMotion]);
  return <RNText style={style}>{String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")}</RNText>;
}

/** Monte `children` après `d` secondes (un élément qui ne doit exister qu'à son heure). Réduction : tout de suite. */
export function Later({ d, children }: { d: number; children: ReactNode }) {
  const { reducedMotion } = useTheme();
  const [on, setOn] = useState(reducedMotion || d === 0);
  useEffect(() => {
    if (reducedMotion || d === 0) {
      setOn(true);
      return;
    }
    setOn(false);
    const timer = setTimeout(() => setOn(true), d * 1000);
    return () => clearTimeout(timer);
  }, [d, reducedMotion]);
  return on ? <>{children}</> : null;
}

/** `tzType` : le texte se découvre lettre à lettre (`steps(n)` sur `dur` secondes). */
export function Typed({
  text,
  d = 0,
  dur = 0.9,
  style,
}: {
  text: string;
  d?: number;
  dur?: number;
  style?: StyleProp<TextStyle>;
}) {
  const { reducedMotion } = useTheme();
  const [n, setN] = useState(reducedMotion ? text.length : 0);
  useEffect(() => {
    if (reducedMotion) {
      setN(text.length);
      return;
    }
    setN(0);
    const per = (dur * 1000) / text.length;
    let timer: ReturnType<typeof setTimeout>;
    const tick = (i: number) => {
      setN(i);
      if (i < text.length) timer = setTimeout(() => tick(i + 1), per);
    };
    timer = setTimeout(() => tick(1), d * 1000);
    return () => clearTimeout(timer);
  }, [text, d, dur, reducedMotion]);
  return (
    <View style={styles.typed}>
      {/* La place du texte entier est gardée : seul ce qui est tapé se voit. */}
      <RNText style={[style, styles.ghost]}>{text}</RNText>
      <RNText style={[style, FILL]}>{text.slice(0, n)}</RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: "hidden", width: "100%" },
  fill: { height: "100%" },
  typed: { alignSelf: "flex-start" },
  ghost: { opacity: 0 },
});
