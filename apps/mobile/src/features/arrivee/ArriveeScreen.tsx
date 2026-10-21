// Gabarit des écrans d'arrivée (lot C3, artefact `s-profil` / `s-dept` / `s-nom`, `.scr.flow`) : barre de flux
// (`.flowbar` : progression de 120 px, croix `.closex` à droite), titre `.ob-h` (affiche 30 px, phrase en `--muted`),
// zone qui défile (écart 18 px), bouton principal collé en bas (`.sticky-cta`). Fond de l'appli (lampe et battle).
// Le champ en saisie reste au-dessus du clavier (`KeyboardSafe`).
import { Ground, OliveActivityProvider } from "@orasso/design-system/native";
import { arriveeLabels } from "@orasso/shared";
import { useIsFocused } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { T, useArt } from "@/features/tuto/art";
import { ArtIcon } from "@/features/tuto/icons";
import { KeyboardSafe } from "@/ui/KeyboardSafe";

/** Les trois étapes : un quart, la moitié, les trois quarts (le tuto fait le reste). */
const progress = [0.25, 0.5, 0.75] as const;

/** `.ob-h` : le titre d'affiche (30 px) et sa phrase. */
export function ObHead({ title, text }: { title: string; text: string }) {
  const a = useArt();
  return (
    <View style={styles.head}>
      <T k="poster" size={30} lh={29} color={a.ink} accessibilityRole="header">
        {title}
      </T>
      <T k="body" size={15} lh={22} color={a.muted} style={styles.lead}>
        {text}
      </T>
    </View>
  );
}

export function ArriveeScreen({
  step,
  onClose,
  footer,
  children,
}: {
  step: 0 | 1 | 2;
  /** La croix de la barre de flux : retour à l'écran précédent (l'accueil depuis le choix du profil). */
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const a = useArt();
  const insets = useSafeAreaInsets();
  // Le O vivant et le fond se mettent en pause quand l'écran n'est plus affiché (lot 39).
  const focused = useIsFocused();
  // `.sticky-cta` : le bouton suit le contenu tant qu'il tient dans l'écran, et reste collé en bas quand ça défile.
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [ctaH, setCtaH] = useState(0);
  const stuck = viewH > 0 && contentH + ctaH > viewH;
  const cta = (
    <View
      style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}
      onLayout={(e) => setCtaH(e.nativeEvent.layout.height)}
    >
      {footer}
    </View>
  );
  return (
    <OliveActivityProvider active={focused}>
      <Ground variant="battle" style={styles.fill}>
        <KeyboardSafe style={styles.fill}>
          <View style={[styles.flowbar, { paddingTop: insets.top + 14 + 12 }]}>
            <View style={styles.fbT}>
              <View
                style={[styles.track, { backgroundColor: a.line }]}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 4, now: step + 1 }}
              >
                <View style={[styles.bar, { width: `${progress[step] * 100}%`, backgroundColor: a.accent }]} />
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={arriveeLabels.close}
              testID="arrivee-close"
              hitSlop={6}
              style={({ pressed }) => [
                styles.closex,
                { backgroundColor: a.card, boxShadow: `inset 0 0 0 1.5px ${a.line}` },
                pressed ? styles.pressed : null,
              ]}
            >
              <ArtIcon name="x" size={20} color={a.ink} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.fill}
            keyboardShouldPersistTaps="handled"
            onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
          >
            <View style={styles.content} onLayout={(e) => setContentH(e.nativeEvent.layout.height)}>
              {children}
            </View>
            {stuck ? null : cta}
          </ScrollView>
          {stuck ? cta : null}
        </KeyboardSafe>
      </Ground>
    </OliveActivityProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flowbar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  fbT: { flex: 1, minWidth: 0 },
  track: { width: 120, height: 6, borderRadius: 3, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pressed: { transform: [{ scale: 0.97 }] },
  content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 24, gap: 18 },
  head: { gap: 8 },
  lead: { maxWidth: 340 },
  footer: { paddingHorizontal: 16, paddingTop: 20, gap: 10 },
});
