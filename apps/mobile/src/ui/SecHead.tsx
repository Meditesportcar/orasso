// Titre de section avec, à droite, un mot d'aide (prototype `sec-h` : « Remises par grade · Montre ton QR de compte »).
//
// Lot R5b (titres « SON » sur le Pixel de Damien) : un titre ne perd jamais de mot. Cause probable : le titre était
// réduit à sa largeur mesurée (rangée en `space-between`, sans `flexGrow`) ; sur Android 16, le texte natif pose les
// capitales italiques à leur encre, un peu plus large que leur chasse mesurée par React Native, et passe le dernier mot
// sur une seconde ligne que la hauteur mesurée ne montre pas (« SON » au lieu de « SON CREW »).
//
// Lot R5b, tour 2 (décision du coordinateur, `secHeadLayout`) : l'aide reste à droite, comme dans l'artefact. Elle
// passe dessous seulement si la police du système est agrandie (`fontScale > 1`) ou si titre + écart + aide ne
// tiennent pas côte à côte ; le titre est estimé à la chasse de chaque signe plus 10 % pour l'encre. Côte à côte, le
// titre ne rétrécit jamais (`flexShrink: 0`, au moins sa largeur estimée) : c'est l'aide qui cède. Même règle pour les
// copies de ce titre (`SecH` de `KitTz` et de l'Accueil, sections des personnes de l'Explorer, rôles de l'équipe).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type ReactNode, useCallback, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, type TextStyle, useWindowDimensions, View } from "react-native";

import { Muted } from "./Muted";
import { type SecHeadSpec, secHeadLayout } from "./secHeadLayout";

const { space2 } = tokens.spacing;
/** Avant la première mesure, la rangée est estimée à la largeur de l'écran moins ses deux marges de 16 px. */
const SCREEN_GUTTERS = 32;
const STACKED_TITLE: TextStyle = { flexBasis: "100%" };
/** Lot C1 : `.sec-h h2` de l'artefact, Archivo 125 % 900 italique 16 px. */
const TITLE_SIZE = 16;

/**
 * La place de l'aide d'un titre de section (voir `secHeadLayout`). `titleStyle` se pose sur le titre ; `onLayout` sur
 * la rangée (mesurée seulement quand la décision en dépend : une aide, la police normale).
 */
export function useSecHeadStack(spec: SecHeadSpec): {
  stacked: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
  titleStyle: TextStyle | null;
} {
  const { width, fontScale } = useWindowDimensions();
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setRowWidth((prev) => (prev === w ? prev : w));
  }, []);
  const layout = secHeadLayout({ ...spec, rowWidth: rowWidth ?? width - SCREEN_GUTTERS, fontScale });
  return {
    stacked: layout.stacked,
    onLayout: spec.side && fontScale <= 1 ? onLayout : undefined,
    titleStyle: layout.stacked
      ? STACKED_TITLE
      : layout.titleMinWidth !== null
        ? { flexShrink: 0, minWidth: layout.titleMinWidth }
        : null,
  };
}

export function SecHead({
  title,
  hint,
  right,
  testID,
}: {
  title: string;
  hint?: string;
  /** À la place de l'aide : un lien ou un petit bouton à droite (largeur inconnue : la rangée passe à la ligne seule). */
  right?: ReactNode;
  testID?: string;
}) {
  const { t } = useTheme();
  const { stacked, onLayout, titleStyle } = useSecHeadStack({
    title,
    titleSize: TITLE_SIZE,
    side: right ? null : hint,
    sideSize: tokens.type.caption.fontSize,
  });
  return (
    <View style={secHeadStyles.row} onLayout={onLayout} testID={testID}>
      <Text variant="posterM" color={t.color.ink} accessibilityRole="header" style={[secHeadStyles.title, titleStyle]}>
        {title}
      </Text>
      {right ??
        (hint ? (
          <Muted variant="caption" style={[secHeadStyles.hint, stacked && secHeadStyles.hintStacked]}>
            {hint}
          </Muted>
        ) : null)}
    </View>
  );
}

/**
 * Styles partagés des titres de section (`SecHead` et ses cousins des autres écrans) : rangée qui passe à la ligne,
 * titre qui prend la place restante ; l'aide dessous s'aligne sur le titre (`hintStacked`).
 */
export const secHeadStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: space2,
    rowGap: 2,
    marginTop: space2,
  },
  title: { flexGrow: 1, flexShrink: 1, fontSize: TITLE_SIZE, lineHeight: 18, letterSpacing: -0.16 },
  hint: { flexShrink: 1, textAlign: "right" },
  hintStacked: { textAlign: "left" },
});
