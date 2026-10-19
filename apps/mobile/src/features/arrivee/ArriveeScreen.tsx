// Gabarit des écrans d'arrivée (lot 41, prototype `s-profil` / `s-dept` / `s-nom`) : barre de flux (progression, retour),
// zone qui défile, bouton principal collé en bas. Le champ en saisie reste au-dessus du clavier (`KeyboardSafe`).
import { Button, Ground, OliveActivityProvider, tokens, useTheme } from "@orasso/design-system/native";
import { arriveeLabels } from "@orasso/shared";
import { useIsFocused } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardSafe } from "@/ui/KeyboardSafe";

const { space2, space3, space4 } = tokens.spacing;

/** Les trois étapes : un quart, la moitié, les trois quarts (le tuto fait le reste). */
const progress = [0.25, 0.5, 0.75] as const;

export function ArriveeScreen({
  step,
  onBack,
  footer,
  children,
}: {
  step: 0 | 1 | 2;
  /** Absent sur la première étape : on n'en revient pas. */
  onBack?: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  // Le O vivant et le fond se mettent en pause quand l'écran n'est plus affiché (lot 39).
  const focused = useIsFocused();
  return (
    <OliveActivityProvider active={focused}>
      <Ground animated style={styles.fill}>
        <KeyboardSafe style={styles.fill}>
          <ScrollView
            style={styles.fill}
            contentContainerStyle={[styles.content, { paddingTop: insets.top + space3 }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.bar}>
              <View
                style={[styles.track, { backgroundColor: t.color.line }]}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 4, now: step + 1 }}
              >
                <View
                  style={[styles.fillBar, { width: `${progress[step] * 100}%`, backgroundColor: t.color.accent }]}
                />
              </View>
              {onBack ? <Button variant="close" label={arriveeLabels.close} icon="back" onPress={onBack} /> : null}
            </View>
            {children}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + space3 }]}>{footer}</View>
        </KeyboardSafe>
      </Ground>
    </OliveActivityProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: space4, paddingBottom: space4, gap: space3 },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  track: { width: 120, height: 4, borderRadius: 2, overflow: "hidden" },
  fillBar: { height: 4, borderRadius: 2 },
  footer: { paddingHorizontal: space4, paddingTop: space2, gap: space2 },
});
