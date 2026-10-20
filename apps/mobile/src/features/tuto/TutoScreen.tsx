// Le tuto d'un profil (lot 42, prototype `s-tuto`) : une diapo à la fois (jour, titre, texte, illustration animée qui
// montre le geste), des points de progression, « Passer » en haut, « Précédent » et « Suivant » / « C'est parti » en bas.
// Une seule illustration est montée : celle de la diapo visible (les autres sont démontées, donc rien ne tourne en
// coulisse). Changer de diapo : fondu de `fast` (120 ms) ; réduction des animations : fondu seul, illustration à l'état
// final. Le glissement horizontal change de diapo (la route est hors des groupes d'onglets : pas de glissement d'onglet).
import { Button, duration, easings, Ground, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type MainProfile, tutoLabels, tutoSlides } from "@orasso/shared";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabSwipe } from "@/features/nav/useTabSwipe";
import { Muted } from "@/ui/Muted";

import { stepIndex } from "./model";
import { tutoIllustrations } from "./slides";

const { space1, space2, space3, space4 } = tokens.spacing;

/** Le contenu d'une diapo apparaît en fondu (120 ms) et glisse de 12 px si les animations sont permises. */
function SlideFade({ direction, children }: { direction: 1 | -1; children: React.ReactNode }) {
  const { reducedMotion } = useTheme();
  const p = useSharedValue(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: monté une fois par diapo (clé = index)
  useEffect(() => {
    p.value = withTiming(1, { duration: duration.fast, easing: easings.linear });
  }, []);
  const animated = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateX: reducedMotion ? 0 : (1 - p.value) * 12 * direction }],
  }));
  return <Animated.View style={[styles.fill, animated]}>{children}</Animated.View>;
}

export function TutoScreen({ profile, onDone }: { profile: MainProfile; onDone: () => void }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const texts = tutoSlides[profile];
  const illustrations = tutoIllustrations[profile];
  // Un tuto dont les textes et les illustrations ne correspondent pas est une erreur de code : elle se voit tout de suite.
  if (texts.length !== illustrations.length) {
    throw new Error(`Tuto « ${profile} » : ${texts.length} textes pour ${illustrations.length} illustrations`);
  }
  const count = texts.length;
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const last = index === count - 1;

  const go = (dir: 1 | -1) => {
    const next = stepIndex(index, dir, count);
    if (next === index) return;
    setDirection(dir);
    setIndex(next);
  };
  // Même geste que le glissement entre onglets (seuil et vélocité), ici pour passer d'une diapo à l'autre.
  const { panHandlers } = useTabSwipe((dir) => go(dir));

  const text = texts[index];
  const Illustration = illustrations[index];
  if (!text || !Illustration) return null;

  return (
    <Ground style={styles.fill}>
      <View style={[styles.fill, { paddingTop: insets.top + space3 }]} testID={`tuto-${profile}`} {...panHandlers}>
        <View style={styles.top}>
          <View
            style={styles.dots}
            accessibilityRole="progressbar"
            accessibilityLabel={tutoLabels.progress(index + 1, count)}
            accessibilityValue={{ min: 1, max: count, now: index + 1 }}
            testID="tuto-dots"
          >
            {texts.slice(0, count).map((slide, i) => (
              <View
                key={slide.title}
                testID="tuto-dot"
                style={[
                  styles.dot,
                  i === index ? styles.dotOn : null,
                  { backgroundColor: i === index ? t.color.accent : i < index ? t.color.inkMuted : t.color.line },
                ]}
              />
            ))}
          </View>
          <Button variant="plate" icon="next" onPress={onDone} testID="tuto-skip">
            {tutoLabels.skip}
          </Button>
        </View>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SlideFade key={index} direction={direction}>
            <View testID={`tuto-slide-${index + 1}`} style={styles.slide}>
              <Illustration />
              <View style={styles.copy}>
                <Text variant="label" color={t.color.accentText}>
                  {text.day}
                </Text>
                <Text variant="posterM" color={t.color.ink} accessibilityRole="header">
                  {text.title}
                </Text>
                <Muted variant="body">{text.text}</Muted>
              </View>
            </View>
          </SlideFade>
        </ScrollView>
        <View style={[styles.actions, { paddingBottom: insets.bottom + space3 }]}>
          {index > 0 ? (
            <Button variant="plate" icon="back" onPress={() => go(-1)} testID="tuto-prev">
              {tutoLabels.previous}
            </Button>
          ) : null}
          <View style={styles.fill}>
            <Button
              variant="primary"
              icon={last ? "check" : "next"}
              fullWidth
              onPress={last ? onDone : () => go(1)}
              testID="tuto-next"
            >
              {last ? tutoLabels.start : tutoLabels.next}
            </Button>
          </View>
        </View>
      </View>
    </Ground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space2,
    paddingHorizontal: space4,
    paddingBottom: space2,
  },
  dots: { flexDirection: "row", flexWrap: "wrap", gap: space1 + 2, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: tokens.radius.radiusPill },
  dotOn: { width: 22 },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: space4, paddingBottom: space3 },
  slide: { flex: 1, justifyContent: "center", gap: space3 },
  copy: { gap: space1 },
  actions: { flexDirection: "row", alignItems: "center", gap: space2, paddingHorizontal: space4, paddingTop: space2 },
});
