// Chip : une catégorie, un filtre ou un fait. Voir docs/design-system/components/Chip.

import { type ReactNode, useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { chipAccessibility } from "./chipAccessibility";
import { duration, easings } from "./motionHooks";
import { Text } from "./text";
import { angle, radius, spacing, useTheme } from "./theme";

export type ChipProps = {
  children: ReactNode;
  /** Sélectionnée : fond encre (fond moutarde sur une plaque). */
  selected?: boolean;
  /**
   * `default` : catégorie, filtre, fait. `accent` : à toi (rayon, zone, grade), inclinée, moutarde.
   * `verified` : badge de confiance (structure vérifiée, pro vérifié, certifié), coins à 4 px, toujours en encre.
   */
  variant?: "default" | "accent" | "verified";
  /** Support : `plate` quand la chip est posée sur une plaque graphite. */
  surface?: "surface" | "plate";
  /** La catégorie recherchée par l'événement : moutarde telle quelle (carte véhicule). */
  lit?: boolean;
  /** Fourni : la chip est un bouton (filtre). */
  onPress?: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
  /** Onglet exclusif ; par défaut, bouton à bascule (filtre cumulable). */
  accessibilityRole?: "button" | "tab";
};

/** Une catégorie, un filtre ou un fait, en capitales étroites. */
export function Chip({
  children,
  selected = false,
  variant = "default",
  surface = "surface",
  lit = false,
  onPress,
  style,
  accessibilityLabel,
  accessibilityRole = "button",
}: ChipProps) {
  const { t } = useTheme();
  const c = t.color;
  const onPlate = surface === "plate";

  // Couleurs : contour, texte, fond de la sélection, texte sélectionné.
  let border = c.line;
  let ink = c.ink;
  let fill = c.ink;
  let selectedInk = c.surface;
  if (variant === "accent") {
    border = onPlate ? c.accent : c.accentText;
    ink = onPlate ? c.accent : c.accentText;
    fill = onPlate ? c.accent : c.accentText;
    selectedInk = c.accentInk;
  } else if (variant === "verified") {
    border = c.ink;
  } else if (onPlate) {
    border = c.plateChip;
    ink = c.plateInk;
    fill = c.accent;
    selectedInk = c.accentInk;
  }
  if (lit) {
    border = c.accent;
    ink = c.accent;
  }
  if (selected) border = fill;

  // Le fond glisse de gauche à droite (fast).
  const slide = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    slide.value = withTiming(selected ? 1 : 0, { duration: duration.fast, easing: easings.inout });
  }, [selected, slide]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: slide.value }] }));

  const textColor = selected ? selectedInk : ink;
  const compact = variant === "verified";
  const body = (
    <View
      style={[
        styles.base,
        compact ? styles.verified : null,
        { borderColor: border },
        variant === "accent" && { transform: [{ skewX: `${angle.skew}deg` }], boxShadow: t.shadow.neonAccentSoft },
        style,
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.fill, { backgroundColor: fill }, fillStyle]} />
      <View style={variant === "accent" ? { transform: [{ skewX: `${-angle.skew}deg` }] } : undefined}>
        <Text variant="meta" color={textColor} style={compact ? styles.verifiedText : styles.text}>
          {children}
        </Text>
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      {...chipAccessibility(selected, accessibilityRole)}
      accessibilityLabel={accessibilityLabel}
      style={styles.press}
    >
      {body}
    </Pressable>
  );
}

/** Une rangée de chips qui défile à l'horizontale ; la sélectionnée reste visible. */
export function ChipRow({
  children,
  accessibilityRole,
  accessibilityLabel,
}: {
  children: ReactNode;
  accessibilityRole?: "tablist";
  accessibilityLabel?: string;
}) {
  return (
    <ScrollView
      horizontal
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.rowScroll}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  press: {
    alignSelf: "flex-start",
    minHeight: spacing.touch,
    minWidth: spacing.touch,
    justifyContent: "center",
  },
  base: {
    flexDirection: "row",
    alignSelf: "flex-start",
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderWidth: 1.5,
    borderRadius: radius.radiusPill,
    overflow: "hidden",
  },
  verified: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  fill: { ...StyleSheet.absoluteFill, transformOrigin: "0% 50%" },
  text: { fontSize: 12, lineHeight: 15, letterSpacing: 0.72 },
  verifiedText: { fontSize: 10, lineHeight: 12, letterSpacing: 0.6 },
  row: { flexDirection: "row", gap: spacing.space2, paddingVertical: 2 },
  rowScroll: { flexGrow: 0 },
});
