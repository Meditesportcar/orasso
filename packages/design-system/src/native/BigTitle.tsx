// BigTitle : le grand titre d'un onglet sur une ligne (DA v2, écart 7, 19/10/2026). Le titre ne passe jamais à la
// ligne (une ligne, taille ajustée jusqu'à 70 %) ; c'est l'étiquette de droite qui se replie dessous à 360 px.
// Lot R1 (24/10) : plus d'`adjustsFontSizeToFit` (Android figeait une taille calculée sur un onglet préchargé caché :
// « Mon garage » devenait « Mon » après un changement de casquette). Le titre est mesuré sur une ligne, hors champ, et
// sa taille se calcule à partir de la largeur réelle (`bigTitleFit`) ; une largeur nulle (écran caché) ne change rien.

import { type ReactNode, useReducer } from "react";
import { type LayoutChangeEvent, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { tokens } from "../tokens";
import { type BigTitleMeasure, bigTitleFit, bigTitleLayout, initialBigTitleLayout } from "./bigTitleFit";
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

const GAP = 12;
/** Largeur de la zone de mesure : le titre y tient toujours sur une ligne. */
const MEASURE_ROOM = 4096;

export function BigTitle({ title, label, style }: BigTitleProps) {
  const { t } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width <= 360;
  const size = bigTitleSize(width);
  // Tour 2 : les mesures passent par `bigTitleLayout` (pur, testé) : une largeur nulle (écran caché) ne change rien.
  const [layout, measure] = useReducer(bigTitleLayout, initialBigTitleLayout);
  const on = (kind: BigTitleMeasure["kind"]) => (e: LayoutChangeEvent) =>
    measure({ kind, width: e.nativeEvent.layout.width });
  const fit = bigTitleFit({
    size,
    natural: layout.natural,
    row: layout.row,
    label: label ? layout.label : 0,
    gap: GAP,
    narrow,
  });
  return (
    <View style={[styles.row, fit.stacked ? styles.column : null, style]} onLayout={on("row")}>
      {/* Mesure du titre sur une ligne, au corps de base, invisible et hors de la lecture d'écran. */}
      <View
        style={styles.measure}
        pointerEvents="none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          variant="posterL"
          numberOfLines={1}
          onLayout={on("natural")}
          style={[styles.measured, { fontSize: size, lineHeight: size }]}
        >
          {title}
        </Text>
      </View>
      <Text
        variant="posterL"
        color={t.color.ink}
        accessibilityRole="header"
        numberOfLines={1}
        testID="big-title"
        style={[styles.title, { fontSize: fit.fontSize, lineHeight: fit.fontSize }]}
      >
        {title}
      </Text>
      {label ? (
        <View style={fit.stacked ? null : styles.labelBox} onLayout={on("label")}>
          <Text variant="label" color={t.color.inkMuted} style={fit.stacked ? null : styles.label}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: GAP,
    paddingTop: 6,
  },
  column: { flexDirection: "column", alignItems: "flex-start", gap: 4 },
  title: { flexShrink: 1 },
  labelBox: { flexShrink: 0 },
  label: { marginBottom: 4, textAlign: "right" },
  measure: { position: "absolute", left: 0, top: 0, width: MEASURE_ROOM, flexDirection: "row", opacity: 0 },
  measured: { flexShrink: 0 },
});
