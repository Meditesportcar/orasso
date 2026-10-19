// Feuille du système de design avec les zones de sécurité de l'appareil et un empilement régulier.
// Lot 36 : clavier ouvert, la feuille remonte au-dessus de lui (marge du bas = hauteur recouverte, voir KeyboardSafe) et
// sa zone qui défile rétrécit d'autant : le champ en saisie (mot de passe de la suppression du compte…) reste visible.
import { Sheet, type SheetProps, tokens } from "@orasso/design-system/native";
import { useRef } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabSwipeDisabledWhile } from "@/features/nav/useTabSwipe";

import { useKeyboardOverlap } from "./KeyboardSafe";

const { space2, space3 } = tokens.spacing;

export function AppSheet({ children, from = "bottom", maxHeight = 0.8, ...rest }: SheetProps & { maxHeight?: number }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const ref = useRef<View>(null);
  const keyboard = useKeyboardOverlap(ref);
  const bottom = from === "bottom" ? Math.max(insets.bottom, keyboard) : 0;
  // Lot 40 : feuille ouverte, pas de glissement vers l'onglet voisin.
  useTabSwipeDisabledWhile(rest.visible);
  return (
    <Sheet from={from} {...rest}>
      <View ref={ref} style={{ paddingTop: from === "top" ? insets.top : 0, paddingBottom: bottom }}>
        <ScrollView
          style={{ maxHeight: Math.max(height * 0.3, height * maxHeight - keyboard) }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space3, paddingVertical: space2 },
});
