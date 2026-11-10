// Les barres de progression en haut de la visionneuse (maquette R7.7 `.r7bars`) : une par story, déjà vues pleines, la courante
// se remplit sur le fil d'interface (`useAnimatedStyle`, worklet), les suivantes vides.
import { tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { storyViewerLabels as L } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { trackLayout } from "./trackLayout";

function CurrentFill({ progress, width }: { progress: SharedValue<number>; width: number }) {
  const { t } = useTheme();
  const style = useAnimatedStyle(() => {
    "worklet";
    return { width: progress.value * width };
  });
  return <Animated.View style={[styles.fill, { backgroundColor: t.color.nightInk }, style]} />;
}

export function ProgressBars({
  count,
  index,
  progress,
}: {
  count: number;
  index: number;
  progress: SharedValue<number>;
}) {
  const { t } = useTheme();
  const [widths, setWidths] = useState<Record<number, number>>({});
  return (
    <View style={styles.row} accessibilityLabel={L.progress(index + 1, count)} testID="story-bars">
      {Array.from({ length: count }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: les barres n'ont pas d'identité propre, seulement un rang.
          key={i}
          style={[styles.track, { backgroundColor: withAlpha(t.color.nightInk, 0.35) }]}
          onLayout={trackLayout(setWidths, i)}
          testID={i < index ? "story-bar-done" : i === index ? "story-bar-current" : "story-bar-next"}
        >
          {i < index ? <View style={[styles.fill, styles.full, { backgroundColor: t.color.nightInk }]} /> : null}
          {i === index && (widths[i] ?? 0) > 0 ? <CurrentFill progress={progress} width={widths[i] ?? 0} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: tokens.spacing.space1 },
  track: { flex: 1, height: 3, borderRadius: 2, overflow: "hidden" },
  fill: { height: 3, borderRadius: 2 },
  full: { width: "100%" },
});
