// Le métal brossé des barres (en-tête, barre d'onglets) : dégradé de barre + brossage, dans un cadre isolé.

import { StyleSheet, View, type ViewStyle } from "react-native";
import { GradientFill } from "./Gradient";
import { Brush } from "./Textures";
import { useTheme } from "./theme";

/** Calques du métal brossé ; à poser en premier enfant d'un conteneur positionné. Clippé dans son propre cadre. */
export function Metal({ style }: { style?: ViewStyle }) {
  const { t } = useTheme();
  return (
    <View pointerEvents="none" style={[styles.metal, style]}>
      <GradientFill css={t.barFx.barGradient} />
      <Brush />
    </View>
  );
}

const styles = StyleSheet.create({
  metal: { ...StyleSheet.absoluteFill, overflow: "hidden", isolation: "isolate" },
});
