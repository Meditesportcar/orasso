// Counters : une rangée de chiffres stables. Voir docs/design-system/components/Counters.

import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { duration, easings, park } from "./motionHooks";
import { Text } from "./text";
import { radius, useTheme } from "./theme";

export type CounterItem = {
  /** Valeur affichée ; elle ne change jamais de place quand elle change. */
  value: number | string;
  label: string;
};

export type CountersProps = {
  items: readonly CounterItem[];
  /** Index de la cellule active (ce sur quoi on travaille : à trier, places restantes). Une seule. */
  active?: number;
  /** `plate` sur téléphone ; `surface` sur le site organisateur (zone claire de la page). */
  variant?: "plate" | "surface";
  /** `phone` : chiffre 18 px ; `site` : 24 px. */
  size?: "phone" | "site";
  style?: ViewStyle;
};

function Cell({
  item,
  active,
  first,
  surface,
  size,
}: {
  item: CounterItem;
  active: boolean;
  first: boolean;
  surface: boolean;
  size: "phone" | "site";
}) {
  const { t, reducedMotion } = useTheme();
  const c = t.color;
  const previous = useRef(item.value);
  const slide = useSharedValue(1);
  const flash = useSharedValue(0);
  const [, setTick] = useState(0);

  // Le chiffre glisse de 10 px et la cellule active flashe (fast), seulement quand la valeur change.
  useEffect(() => {
    if (previous.current === item.value) return;
    previous.current = item.value;
    setTick((n) => n + 1);
    slide.value = 0;
    slide.value = withTiming(1, { duration: duration.fast, easing: reducedMotion ? easings.linear : easings.out });
    flash.value = 0.35;
    flash.value = withTiming(0, { duration: duration.fast, easing: easings.out });
  }, [item.value, reducedMotion, slide, flash]);

  const valueStyle = useAnimatedStyle(() => ({
    opacity: slide.value,
    transform: [{ translateY: reducedMotion ? 0 : (1 - slide.value) * park.counterSlide }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const valueInk = active ? c.accentInk : surface ? c.ink : c.plateInk;
  const labelInk = active ? c.accentInk : surface ? c.inkMuted : c.plateMuted;
  return (
    <View
      style={[
        styles.cell,
        !first && { borderLeftWidth: 1, borderLeftColor: surface ? c.line : c.plateLine },
        active && { backgroundColor: c.accent },
      ]}
    >
      {active && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.poster }, flashStyle]} />
      )}
      <Animated.View style={valueStyle}>
        <Text
          variant="number"
          color={valueInk}
          style={size === "site" ? styles.valueSite : styles.valuePhone}
          textBreakStrategy="simple"
        >
          {item.value}
        </Text>
      </Animated.View>
      <Text variant="label" color={labelInk} style={styles.label}>
        {item.label}
      </Text>
    </View>
  );
}

/**
 * Une rangée de chiffres qui ne bougent pas de place quand ils changent. Mise à jour en temps réel sans
 * défilement : le chiffre glisse de 10 px et la cellule active flashe (`fast`).
 */
export function Counters({ items, active, variant = "plate", size = "phone", style }: CountersProps) {
  const { t } = useTheme();
  const c = t.color;
  const surface = variant === "surface";
  return (
    <View
      style={[
        styles.row,
        surface
          ? { borderColor: "transparent", backgroundColor: c.surface }
          : { borderColor: c.plateEdge, backgroundColor: c.plate },
        { boxShadow: t.shadow.shadowCard },
        style,
      ]}
    >
      {items.map((item, i) => (
        <Cell key={item.label} item={item} active={i === active} first={i === 0} surface={surface} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", overflow: "hidden", borderWidth: 1, borderRadius: radius.radiusMd },
  cell: { flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 4, alignItems: "center" },
  valuePhone: { fontSize: 18, lineHeight: 18, textAlign: "center" },
  valueSite: { fontSize: 24, lineHeight: 24, textAlign: "center" },
  label: { marginTop: 4, fontSize: 9, lineHeight: 11, letterSpacing: 0.72, textAlign: "center" },
});
