// StatusBadge : les sept états. Voir docs/design-system/components/StatusBadge.

import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { type BadgeStatus, badgeLabels, rankLabel } from "../labels";
import { GradientFill } from "./Gradient";
import { duration, easings } from "./motionHooks";
import { Text } from "./text";
import { angle, radius, useTheme } from "./theme";

export type StatusBadgeProps = {
  status: BadgeStatus;
  /** Rang dans la liste d'attente (statut `waitlist`) : « Liste d'attente · 4e ». */
  rank?: number;
  /** Posé sur une plaque graphite : la liste d'attente garde le bleu clair du Béton. */
  onPlate?: boolean;
  /** Retourné comme une plaque quand le statut change (`base`). */
  animated?: boolean;
  style?: ViewStyle;
};

/**
 * Le statut d'une candidature ou d'un événement, incliné comme une étiquette d'affiche, reconnaissable sans sa
 * couleur (contour, plein, barré, hachuré). Jamais un « Refusée » rouge, jamais deux badges sur une même carte.
 */
export function StatusBadge({ status, rank, onPlate = false, animated = true, style }: StatusBadgeProps) {
  const { t, reducedMotion } = useTheme();
  const c = t.color;

  // Retourné comme une plaque, seulement quand le statut change : jamais au premier rendu.
  const previous = useRef(status);
  const [flips, setFlips] = useState(0);
  const flip = useSharedValue(1);
  useEffect(() => {
    if (previous.current === status) return;
    previous.current = status;
    setFlips((n) => n + 1);
    if (!animated) return;
    flip.value = 0;
    flip.value = withTiming(1, {
      duration: reducedMotion ? duration.fast : duration.base,
      easing: reducedMotion ? easings.linear : easings.inout,
    });
  }, [status, animated, reducedMotion, flip]);
  const flipStyle = useAnimatedStyle(() => ({
    opacity: flip.value,
    transform: reducedMotion
      ? []
      : [{ perspective: 400 }, { rotateX: `${interpolate(flip.value, [0, 1], [-180, 0])}deg` }],
  }));

  let box: ViewStyle = {};
  let ink = c.ink;
  let hatched = false;
  let strike = false;
  switch (status) {
    case "pending":
      box = { borderColor: onPlate ? c.plateMuted : c.statusPending };
      ink = onPlate ? c.plateMuted : c.statusPending;
      break;
    case "retained":
      box = { backgroundColor: c.statusRetained, boxShadow: t.shadow.neonAccentSoft };
      ink = c.accentInk;
      break;
    case "waitlist":
      box = { backgroundColor: onPlate ? c.statusWaitlistOnPlate : c.statusWaitlist };
      ink = c.night;
      break;
    case "refused":
      box = { borderColor: onPlate ? c.plateMuted : c.statusRefused };
      ink = onPlate ? c.plateMuted : c.statusRefused;
      strike = true;
      break;
    case "onsite":
      box = { backgroundColor: onPlate ? c.nightInk : c.statusOnsite };
      ink = onPlate ? c.night : c.posterInk;
      break;
    case "cancelled":
      box = { backgroundColor: c.statusCancelled, boxShadow: t.shadow.neonWin };
      ink = c.winInk;
      break;
    case "uncertain":
      box = { borderColor: c.statusUncertain };
      ink = onPlate ? c.plateInk : c.ink;
      hatched = true;
      break;
  }

  const label = status === "waitlist" && rank ? `${badgeLabels.waitlist} · ${rankLabel(rank)}` : badgeLabels[status];
  return (
    <Animated.View
      key={flips}
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.base, box, { transform: [{ skewX: `${angle.skew}deg` }] }, style]}
    >
      <Animated.View style={flipStyle}>
        {hatched && (
          <GradientFill css={`repeating-linear-gradient(45deg, ${c.statusUncertain} 0 6px, transparent 6px 10px)`} />
        )}
        <View style={styles.inner}>
          <Text variant="label" color={ink} style={strike ? styles.strike : undefined}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    borderWidth: 1.5,
    borderColor: "transparent",
    borderRadius: radius.radiusPill,
    overflow: "hidden",
  },
  inner: { paddingVertical: 5, paddingHorizontal: 11, transform: [{ skewX: `${-angle.skew}deg` }] },
  strike: { textDecorationLine: "line-through" },
});
