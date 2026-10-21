// Frise des huit temps de l'assistant (artefact `s-create`, `.csteps` / `.cst`, lot C4a) : une pastille par temps,
// numéro dans un rond, coche pour les temps passés, temps en cours en encre avec son numéro moutarde. Un toucher sur un
// temps passé y revient (comme « Retour », sans validation) ; les temps à venir se rejoignent par « Continuer », qui
// vérifie et enregistre (logique inchangée). Défile seule pour garder le temps en cours visible. Plus : le bouton
// carré « précédent » du bas (`#csPrev`).
import { Icon, Text, useTheme } from "@orasso/design-system/native";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

export function StepRail({
  labels,
  index,
  disabled,
  onPick,
  stepLabel,
}: {
  labels: readonly string[];
  index: number;
  disabled: boolean;
  onPick: (i: number) => void;
  /** « Étape 2 sur 8 · Lieu » : nom accessible du temps en cours. */
  stepLabel: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);
  useEffect(() => {
    const x = offsets.current[index];
    if (x !== undefined) scroll.current?.scrollTo({ x: Math.max(0, x - 60), animated: false });
  }, [index]);
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      style={styles.outer}
      testID="wizard-steps"
    >
      {labels.map((label, i) => {
        const on = i === index;
        const done = i < index;
        return (
          <Pressable
            key={label}
            onLayout={(e) => {
              offsets.current[i] = e.nativeEvent.layout.x;
              // Première mesure du temps en cours : la frise le montre (la mesure arrive après le premier rendu).
              if (i === index) scroll.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 60), animated: false });
            }}
            onPress={() => onPick(i)}
            disabled={disabled || !done}
            accessibilityRole="button"
            accessibilityLabel={on ? stepLabel : label}
            accessibilityState={{ selected: on, disabled: disabled || !done }}
            testID={on ? "wizard-step" : undefined}
            style={[
              styles.cst,
              on ? { backgroundColor: c.ink } : { backgroundColor: c.surface, borderColor: c.line, borderWidth: 1 },
            ]}
          >
            <View style={[styles.num, { backgroundColor: on ? c.accent : done ? c.ink : c.surfaceRaised }]}>
              {done ? (
                <Icon name="check" size={14} color={c.ground} />
              ) : (
                <Text variant="numberNarrow" color={on ? c.accentInk : c.inkMuted} style={styles.numText}>
                  {String(i + 1)}
                </Text>
              )}
            </View>
            <Text variant="bodyStrong" color={on ? c.ground : c.inkMuted} style={styles.label}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Bouton carré « précédent » du bas de l'assistant (`.btn.btn-s` à icône seule). */
export function BackSquare({
  onPress,
  disabled,
  label,
  testID,
}: {
  onPress: () => void;
  disabled: boolean;
  label: string;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.square,
        { borderColor: t.color.ink, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      <Icon name="back" size={22} color={t.color.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { marginHorizontal: -16, flexGrow: 0 },
  rail: { gap: 6, paddingHorizontal: 16, paddingBottom: 2 },
  cst: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingLeft: 4,
    paddingRight: 11,
    borderRadius: 16,
  },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  numText: { fontSize: 15, lineHeight: 17, fontWeight: "800" },
  label: { fontSize: 12.5 },
  square: { width: 50, height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
