// Le tuto d'un profil (lot C3, artefact `s-tuto`, reproduit au pixel) : en haut les tirets de progression et « Passer »
// (lien) ; au milieu la grande carte de l'illustration animée (`.tu-art`) puis le jour, le titre et le texte ; en bas le
// bouton carré « précédent » (icône seule) et « Suivant » / « C'est parti ». Une seule illustration est montée : celle
// de la diapo visible (les autres sont démontées, rien ne tourne en coulisse) ; changer de diapo = fondu de 220 ms et
// l'animation de la nouvelle diapo repart de zéro. Réduction des animations : fondu de 120 ms, illustrations à l'état
// final. Le glissement horizontal change aussi de diapo.
import { Button, duration, Ground, useTheme } from "@orasso/design-system/native";
import { type MainProfile, tutoLabels, tutoSlides } from "@orasso/shared";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabSwipe } from "@/features/nav/useTabSwipe";

import { T, useArt } from "./art";
import { ArtIcon } from "./icons";
import { balanceTitle, stepIndex, titleCharsFor } from "./model";
import { tutoIllustrations } from "./slides";

/** Les tirets de progression (`.tu-dots`) : 22 × 5, l'actif 36 px moutarde. */
function Dots({ count, index }: { count: number; index: number }) {
  const a = useArt();
  return (
    <View
      style={styles.dots}
      accessibilityRole="progressbar"
      accessibilityLabel={tutoLabels.progress(index + 1, count)}
      accessibilityValue={{ min: 1, max: count, now: index + 1 }}
      testID="tuto-dots"
    >
      {Array.from({ length: count }, (_, i) => (
        <Dash key={String(i)} on={i === index} line={a.line} accent={a.accent} />
      ))}
    </View>
  );
}

function Dash({ on, line, accent }: { on: boolean; line: string; accent: string }) {
  const { reducedMotion } = useTheme();
  const w = useSharedValue(on ? 36 : 22);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `w` est stable
  useEffect(() => {
    w.value = reducedMotion ? (on ? 36 : 22) : withTiming(on ? 36 : 22, { duration: duration.base });
  }, [on, reducedMotion]);
  const style = useAnimatedStyle(() => {
    "worklet";
    return { width: w.value };
  });
  return <Animated.View testID="tuto-dot" style={[styles.dash, { backgroundColor: on ? accent : line }, style]} />;
}

/** Le contenu d'une diapo arrive en fondu (`.tu-slide` : opacité sur 220 ms ; 120 ms si animations réduites). */
function SlideFade({ children }: { children: React.ReactNode }) {
  const { reducedMotion } = useTheme();
  const p = useSharedValue(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: monté une fois par diapo (clé = index)
  useEffect(() => {
    p.value = withTiming(1, { duration: reducedMotion ? duration.fast : duration.base });
  }, []);
  const style = useAnimatedStyle(() => {
    "worklet";
    return { opacity: p.value };
  });
  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
}

export function TutoScreen({ profile, onDone }: { profile: MainProfile; onDone: () => void }) {
  const a = useArt();
  const insets = useSafeAreaInsets();
  const texts = tutoSlides[profile];
  const illustrations = tutoIllustrations[profile];
  // Un tuto dont les textes et les illustrations ne correspondent pas est une erreur de code : elle se voit tout de suite.
  if (texts.length !== illustrations.length) {
    throw new Error(`Tuto « ${profile} » : ${texts.length} textes pour ${illustrations.length} illustrations`);
  }
  const count = texts.length;
  const [index, setIndex] = useState(0);
  // Le contenu défile seulement s'il dépasse (petit écran, police agrandie) : sinon tout tient, comme l'artefact.
  const [stageH, setStageH] = useState(0);
  const [contentH, setContentH] = useState(0);
  // Retours à la ligne équilibrés calculés pour la largeur réelle et la taille de police de l'appareil.
  const { width, fontScale } = useWindowDimensions();
  const titleChars = titleCharsFor(width, fontScale);
  const last = index === count - 1;

  const go = (dir: 1 | -1) => {
    const next = stepIndex(index, dir, count);
    if (next !== index) setIndex(next);
  };
  // Même geste que le glissement entre onglets (seuil et vélocité), ici pour passer d'une diapo à l'autre.
  const { panHandlers } = useTabSwipe((dir) => go(dir));

  const text = texts[index];
  const Illustration = illustrations[index];
  if (!text || !Illustration) return null;

  return (
    <Ground variant="battle" style={styles.fill}>
      <View
        style={[styles.fill, styles.pad, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 20 }]}
        testID={`tuto-${profile}`}
        {...panHandlers}
      >
        <View style={styles.top}>
          <Dots count={count} index={index} />
          {/* « Passer » : `.btn.btn-g.sm`, un lien (chevron + capitales), pas un bouton encadré. */}
          <Pressable
            onPress={onDone}
            accessibilityRole="button"
            testID="tuto-skip"
            hitSlop={8}
            style={({ pressed }) => [styles.skip, pressed ? styles.pressed : null]}
          >
            <ArtIcon name="chr" size={16} color={a.ink} />
            <T k="btn" size={12} lh={14} color={a.ink}>
              {tutoLabels.skip}
            </T>
          </Pressable>
        </View>
        <ScrollView
          style={styles.stage}
          contentContainerStyle={styles.stageContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={contentH > stageH + 1}
          onLayout={(e) => setStageH(e.nativeEvent.layout.height)}
          onContentSizeChange={(_, h) => setContentH(h)}
          testID="tuto-stage"
        >
          <SlideFade key={index}>
            <View testID={`tuto-slide-${index + 1}`} style={styles.slide}>
              <Illustration />
              <View>
                <T k="label" color={a.accentText}>
                  {text.day}
                </T>
                <T k="poster" size={26} lh={25} color={a.ink} style={styles.title} accessibilityRole="header">
                  {balanceTitle(text.title, titleChars)}
                </T>
                <T k="body" size={15} lh={22} color={a.muted}>
                  {text.text}
                </T>
              </View>
            </View>
          </SlideFade>
        </ScrollView>
        <View style={styles.actions}>
          {/* Précédent : `.btn.btn-s`, carré à icône seule (sans effet sur la première diapo, comme l'artefact). */}
          <Pressable
            onPress={() => go(-1)}
            disabled={index === 0}
            accessibilityRole="button"
            accessibilityLabel={tutoLabels.previous}
            testID="tuto-prev"
            style={({ pressed }) => [
              styles.prev,
              { backgroundColor: a.card, boxShadow: `inset 0 0 0 1.5px ${a.line}` },
              pressed ? styles.pressed : null,
            ]}
          >
            <ArtIcon name="chl" size={20} color={a.ink} />
          </Pressable>
          <View style={styles.fill}>
            <Button variant="primary" icon="next" fullWidth onPress={last ? onDone : () => go(1)} testID="tuto-next">
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
  pad: { paddingHorizontal: 16 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dots: { flexDirection: "row", gap: 6 },
  dash: { height: 5, borderRadius: 3 },
  skip: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingHorizontal: 6 },
  pressed: { transform: [{ scale: 0.97 }] },
  stage: { flex: 1, marginVertical: 14 },
  stageContent: { flexGrow: 1, minHeight: 360 },
  slide: { flex: 1, gap: 16 },
  title: { marginTop: 4, marginBottom: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  prev: { width: 56, minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
