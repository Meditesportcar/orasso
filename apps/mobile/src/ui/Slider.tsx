// Curseur à pas (rayon des notifications, 10 à 300 km). Ni gestes natifs ni bibliothèque : un PanResponder suffit, et il
// marche pareil sur téléphone et dans le navigateur (recette). Accessible : « réglable », +/− au lecteur d'écran.
// Posé sur une plaque graphite (jetons plate-*).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";

import { sliderValueAt } from "@/lib/slider";

const { radiusPill } = tokens.radius;

export function Slider({
  value,
  onChange,
  onCommit,
  min,
  max,
  step,
  label,
  format,
}: {
  value: number;
  /** À chaque déplacement. */
  onChange: (value: number) => void;
  /** Quand le doigt se lève (ou au +/− du lecteur d'écran) : enregistrer. */
  onCommit: (value: number) => void;
  min: number;
  max: number;
  step: number;
  label: string;
  format: (value: number) => string;
}) {
  const { t } = useTheme();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const latest = useRef(value);
  latest.current = value;

  const move = (x: number) => {
    const next = sliderValueAt(x, widthRef.current, min, max, step);
    latest.current = next;
    onChange(next);
  };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => move(e.nativeEvent.locationX),
      onPanResponderMove: (e) => move(e.nativeEvent.locationX),
      onPanResponderRelease: () => onCommit(latest.current),
      onPanResponderTerminate: () => onCommit(latest.current),
    }),
  ).current;

  const ratio = (value - min) / (max - min);
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: format(value) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        const next =
          e.nativeEvent.actionName === "increment" ? Math.min(max, value + step) : Math.max(min, value - step);
        onChange(next);
        onCommit(next);
      }}
      style={styles.wrap}
    >
      <View
        {...responder.panHandlers}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        style={styles.hit}
      >
        <View pointerEvents="none" style={[styles.track, { backgroundColor: t.color.plateLine }]}>
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: t.color.accent }]} />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { left: Math.max(0, ratio * width - 12), backgroundColor: t.color.accent, borderColor: t.color.plateInk },
          ]}
        />
      </View>
      <View style={styles.ends}>
        <Text variant="caption" color={t.color.plateMuted}>
          {format(min)}
        </Text>
        <Text variant="caption" color={t.color.plateMuted}>
          {format(max)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  hit: { height: 40, justifyContent: "center" },
  track: { height: 6, borderRadius: radiusPill, overflow: "hidden" },
  fill: { height: 6 },
  thumb: { position: "absolute", top: 8, width: 24, height: 24, borderRadius: radiusPill, borderWidth: 2 },
  ends: { flexDirection: "row", justifyContent: "space-between" },
});
