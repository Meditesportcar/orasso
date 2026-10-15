// Feuille du système de design avec les zones de sécurité de l'appareil et un empilement régulier.
import { Sheet, type SheetProps, tokens } from "@orasso/design-system/native";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { space2, space3 } = tokens.spacing;

export function AppSheet({ children, from = "bottom", maxHeight = 0.8, ...rest }: SheetProps & { maxHeight?: number }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Sheet from={from} {...rest}>
      <View
        style={{ paddingTop: from === "top" ? insets.top : 0, paddingBottom: from === "bottom" ? insets.bottom : 0 }}
      >
        <ScrollView
          style={{ maxHeight: height * maxHeight }}
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
