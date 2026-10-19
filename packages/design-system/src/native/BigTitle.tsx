// BigTitle : le grand titre d'un onglet sur une ligne (DA v2, écart 7, 19/10/2026). Le titre ne passe jamais à la
// ligne (une ligne, taille ajustée jusqu'à 70 %) ; c'est l'étiquette de droite qui se replie dessous à 360 px.

import type { ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { tokens } from "../tokens";
import { Text } from "./text";
import { useTheme } from "./theme";

export type BigTitleProps = {
  /** Le titre de la page (« Mon garage »), en `poster-l`. */
  title: string;
  /** L'étiquette à droite (« 3 véhicules ») : elle passe dessous quand l'écran fait 360 px ou moins. */
  label?: ReactNode;
  style?: ViewStyle;
};

/** Taille du titre selon la largeur d'écran : 8,2 % de la largeur utile, entre `poster-l` et `poster-xl`. */
export function bigTitleSize(screenWidth: number): number {
  const min = tokens.type.posterL.fontSize;
  const max = tokens.type.posterXl.fontSize;
  return Math.round(Math.min(max, Math.max(min, (screenWidth - 32) * 0.082)));
}

export function BigTitle({ title, label, style }: BigTitleProps) {
  const { t } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width <= 360;
  const size = bigTitleSize(width);
  return (
    <View style={[styles.row, narrow ? styles.column : null, style]}>
      <Text
        variant="posterL"
        color={t.color.ink}
        accessibilityRole="header"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[styles.title, { fontSize: size, lineHeight: size }]}
      >
        {title}
      </Text>
      {label ? (
        <Text variant="label" color={t.color.inkMuted} style={narrow ? null : styles.label}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 6,
  },
  column: { flexDirection: "column", alignItems: "flex-start", gap: 4 },
  title: { flexShrink: 1 },
  label: { marginBottom: 4, textAlign: "right", flexShrink: 0 },
});
