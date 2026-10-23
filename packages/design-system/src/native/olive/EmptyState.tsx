// EmptyState (lot 39) : une liste vide. La place libre en pointillés dans le O, la voiture du logo attend dehors (elle
// arrive et se range à gauche). Un titre, un texte, une action facultative (un seul bouton principal par écran : à
// l'appelant de choisir). Réduction des animations : la voiture est déjà là, fondu de 120 ms.

import { type ReactNode, useEffect, useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Line, Path } from "react-native-svg";
import { carTransform, oTransform, useTone } from "../Brand";
import { brandArt } from "../brandArt";
import { duration, easings, park } from "../motionHooks";
import { Text } from "../text";
import { useTheme } from "../theme";
import { AnimatedCar, CAR_OUT_LEFT } from "./brandCar";
import { fadeIn } from "./shared";

/** Cadre du dessin : le O et, à sa gauche, la voiture qui attend (prototype : −95 −25 237 150). */
const VIEW = [-95, -25, 237, 150] as const;
/** La place libre, dans l'ouverture de l'O, penchée comme la voiture. */
const SPOT = "M60 33h38a12 12 0 0 1 12 12v10a12 12 0 0 1-12 12H60a12 12 0 0 1-12-12V45a12 12 0 0 1 12-12z";
/**
 * Lot M5 (maquette 9.3, retour 23) : la ligne de route en pointillés sous la voiture, pour qu'elle ne semble plus
 * flotter (`.empty-o .eo .road` : du bord gauche jusqu'à 30 px du bord droit, 23 px au-dessus du bas, tirets de 10 et
 * 8), en unités du viewBox.
 */
const ROAD = { x1: VIEW[0], x2: VIEW[0] + VIEW[2] - 19, y: VIEW[1] + VIEW[3] - 24 } as const;
/** La voiture arrive de 80 unités plus à gauche. */
const ARRIVE_FROM = CAR_OUT_LEFT - 80;

export type EmptyStateProps = {
  title: string;
  text?: string;
  action?: ReactNode;
  /** Largeur du dessin, en px. */
  width?: number;
  /** Rejouer (recette). */
  playKey?: unknown;
  /** La ligne de route sous la voiture (état vide de Sorties, lot M5). Sans elle : le dessin de l'artefact. */
  road?: boolean;
};

export function EmptyState({ title, text, action, width = 180, playKey, road = false }: EmptyStateProps) {
  const { t, reducedMotion } = useTheme();
  const version = useTone("auto");
  const id = `oe${useId().replaceAll(":", "")}`;
  const offset = useSharedValue(reducedMotion ? CAR_OUT_LEFT : ARRIVE_FROM);
  const fade = useSharedValue(1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `playKey` rejoue l'arrivée (recette)
  useEffect(() => {
    if (reducedMotion) {
      offset.value = CAR_OUT_LEFT;
      fadeIn(fade);
      return;
    }
    offset.value = ARRIVE_FROM;
    offset.value = withSequence(
      withTiming(CAR_OUT_LEFT + park.overshoot, { duration: duration.base * 2.4, easing: easings.park }),
      withTiming(CAR_OUT_LEFT, { duration: duration.base, easing: easings.inout }),
    );
  }, [reducedMotion, playKey, offset, fade]);

  const fadeStyle = useAnimatedStyle(() => {
    "worklet";
    return { opacity: fade.value };
  });
  const height = (width * VIEW[3]) / VIEW[2];
  return (
    <Animated.View style={[styles.root, fadeStyle]}>
      <View aria-hidden>
        <Svg width={width} height={height} viewBox={VIEW.join(" ")}>
          {road ? (
            <Line
              x1={ROAD.x1}
              y1={ROAD.y}
              x2={ROAD.x2}
              y2={ROAD.y}
              stroke={t.color.line}
              strokeWidth={2}
              strokeDasharray="10 8"
              testID="empty-road"
            />
          ) : null}
          <Path transform={oTransform} d={brandArt.oPath} fill={brandArt.ink[version]} fillRule="evenodd" />
          <Path
            transform={carTransform}
            d={SPOT}
            fill="none"
            stroke={t.color.accent}
            strokeWidth={2.4}
            strokeDasharray="5 5"
          />
          <AnimatedCar id={id} offset={offset} clipHole={false} />
        </Svg>
      </View>
      <View style={styles.text}>
        <Text variant="title" color={t.color.ink} style={styles.center}>
          {title}
        </Text>
        {text ? (
          <Text variant="body" color={t.color.inkMuted} style={styles.center}>
            {text}
          </Text>
        ) : null}
      </View>
      {action}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", gap: 12, paddingVertical: 16 },
  text: { alignItems: "center", gap: 4 },
  center: { textAlign: "center" },
});
