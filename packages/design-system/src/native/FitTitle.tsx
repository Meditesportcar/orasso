// FitTitle : un titre d'affiche (capitales Archivo large) qui ne se coupe jamais (lot R3a, retour 2 de Damien du 24/10 :
// « AJOUTER DES… » sur son Android). Chaque mot est mesuré hors champ, tel qu'il s'affiche ; `fitTitle` choisit les
// coupures de ligne et le corps (jusqu'à 70 % sur deux lignes, puis une ligne de plus) ; chaque ligne est un texte d'une
// ligne, qu'Android ne peut plus couper. Même méthode que `BigTitle` (lot R1) : une largeur nulle (écran caché) ne
// change rien. Sans mesure (premier rendu), le titre s'affiche au corps de base.

import { useReducer } from "react";
import { type LayoutChangeEvent, Platform, StyleSheet, type TextStyle, View, type ViewStyle } from "react-native";
import type { TypeStyleName } from "../tokens";
import { Text } from "./text";
import { textStyles } from "./textStyles";
import { fitTitle, titleWords } from "./titleFit";

export type FitTitleProps = {
  title: string;
  /** Style de texte du système (un `poster*` en général). */
  variant: TypeStyleName;
  color: string;
  /** Alignement des lignes (gauche par défaut ; « center » pour une case d'appel). */
  align?: "left" | "center";
  /** Lignes visées avant d'en ajouter une (2 par défaut). */
  maxLines?: number;
  /** Titre de l'écran pour la lecture d'écran (`header`). */
  header?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/** Mesure hors champ : assez large pour que tout tienne sur une ligne. */
const MEASURE_ROOM = 4096;

type Layout = { room: number; full: number; words: number[] };
type MeasureKey = { kind: "room" | "full" } | { kind: "word"; index: number };
type Measure = MeasureKey & { width: number };

function layoutOf(state: Layout, m: Measure): Layout {
  const width = Math.round(m.width * 10) / 10;
  if (!(width > 0)) return state;
  if (m.kind === "word") {
    if (state.words[m.index] === width) return state;
    const words = [...state.words];
    words[m.index] = width;
    return { ...state, words };
  }
  return state[m.kind] === width ? state : { ...state, [m.kind]: width };
}

/**
 * Sur le web (recettes, version de démonstration), le navigateur mesure le texte tel qu'il s'affiche et passe à la ligne
 * entre les mots : un texte simple suffit, sans les mesures cachées (qui doubleraient le texte dans la page).
 */
export function FitTitle(props: FitTitleProps) {
  if (Platform.OS === "web") {
    const { title, variant, color, align = "left", header = false, style, testID } = props;
    return (
      <View style={[styles.box, style]} testID={testID}>
        <Text
          variant={variant}
          color={color}
          accessibilityRole={header ? "header" : undefined}
          style={{ textAlign: align }}
          testID={testID ? `${testID}-line` : undefined}
        >
          {title}
        </Text>
      </View>
    );
  }
  return <MeasuredTitle {...props} />;
}

function MeasuredTitle({
  title,
  variant,
  color,
  align = "left",
  maxLines = 2,
  header = false,
  style,
  testID,
}: FitTitleProps) {
  const words = titleWords(title);
  const base = textStyles[variant];
  const size = base.fontSize ?? 16;
  const lineHeight = base.lineHeight ?? size;
  const [layout, measure] = useReducer(layoutOf, { room: 0, full: 0, words: [] });
  const on = (m: MeasureKey) => (e: LayoutChangeEvent) =>
    measure({ ...m, width: e.nativeEvent.layout.width } as Measure);
  const measured = words.map((_, i) => layout.words[i] ?? 0);
  const ready = layout.room > 0 && layout.full > 0 && measured.every((w) => w > 0);
  const sum = measured.reduce((a, b) => a + b, 0);
  const space = words.length > 1 ? Math.max(0, (layout.full - sum) / (words.length - 1)) : 0;
  const fit = ready ? fitTitle({ words: measured, space, room: layout.room, size, maxLines }) : null;
  const textAlign: TextStyle = { textAlign: align };
  return (
    <View
      style={[styles.box, style]}
      onLayout={on({ kind: "room" })}
      accessible={header}
      accessibilityRole={header ? "header" : undefined}
      accessibilityLabel={header ? title : undefined}
      testID={testID}
    >
      {/* Mesures hors champ, invisibles et hors de la lecture d'écran : le titre entier et chaque mot, au corps de base. */}
      <View
        style={styles.clip}
        pointerEvents="none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.measure}>
          <Text variant={variant} numberOfLines={1} onLayout={on({ kind: "full" })} style={styles.measured}>
            {title}
          </Text>
          {words.map((w, i) => (
            <Text
              // biome-ignore lint/suspicious/noArrayIndexKey: un mot peut revenir deux fois ; sa place est sa clé
              key={i}
              variant={variant}
              numberOfLines={1}
              onLayout={on({ kind: "word", index: i })}
              style={styles.measured}
            >
              {w}
            </Text>
          ))}
        </View>
      </View>
      {fit ? (
        fit.lines.map((line, n) => (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: les lignes sont recalculées avec la largeur
            key={n}
            variant={variant}
            color={color}
            numberOfLines={1}
            testID={testID ? `${testID}-line` : undefined}
            style={[textAlign, { fontSize: fit.fontSize, lineHeight: (lineHeight * fit.fontSize) / size }]}
          >
            {line.map((i) => words[i]).join(" ")}
          </Text>
        ))
      ) : (
        <Text variant={variant} color={color} style={textAlign}>
          {title}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: "stretch" },
  /** Boîte vide qui cache la zone de mesure (aucun débordement, ni défilement horizontal sur le web). */
  clip: { position: "absolute", left: 0, top: 0, width: 0, height: 0, overflow: "hidden" },
  measure: {
    position: "absolute",
    left: 0,
    top: 0,
    width: MEASURE_ROOM,
    flexDirection: "row",
    alignItems: "flex-start",
    opacity: 0,
  },
  measured: { flexShrink: 0 },
});
