// Chip : une catégorie, un filtre ou un fait. Voir docs/design-system/components/Chip.

import { type ReactNode, useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { type ChipRole, chipPressableProps } from "./chipAccessibility";
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
  /**
   * `button` (défaut) : action ou navigation, sans état annoncé. `toggle` : vraie bascule (filtre cumulable, `aria-pressed`).
   * `tab` : onglet exclusif d'une liste d'onglets. `radio` : choix exclusif d'un réglage sans panneau.
   * Les trois rôles à état agrandissent la cible tactile au jeton `touch` (segments et filtres) ; la puce, elle, ne bouge pas.
   */
  accessibilityRole?: ChipRole;
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
  const press = chipPressableProps({ selected, role: accessibilityRole, onPress, accessibilityLabel });
  return (
    <Pressable
      onPress={press.onPress}
      {...press.a11y}
      accessibilityLabel={press.accessibilityLabel}
      style={press.targeted ? styles.press : styles.pressPlain}
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
  accessibilityRole?: "tablist" | "radiogroup";
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
  // Cible agrandie (segments, filtres) : la puce est centrée dans sa cible, elle ne grandit pas.
  press: {
    alignSelf: "flex-start",
    alignItems: "center",
    minHeight: spacing.touch,
    minWidth: spacing.touch,
    justifyContent: "center",
  },
  pressPlain: { alignSelf: "flex-start" },
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
