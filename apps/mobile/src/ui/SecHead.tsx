// Titre de section avec, à droite, un mot d'aide (prototype `sec-h` : « Remises par grade · Montre ton QR de compte »).
//
// Lot R5b (titres « SON » sur le Pixel de Damien) : un titre ne perd jamais de mot. Cause probable : le titre était
// réduit à sa largeur mesurée (rangée en `space-between`, sans `flexGrow`) ; sur Android 16, le texte natif pose les
// capitales italiques à leur encre, un peu plus large que leur chasse mesurée par React Native, et passe le dernier mot
// sur une seconde ligne que la hauteur mesurée ne montre pas (« SON » au lieu de « SON CREW »). Le titre prend désormais
// toute la place de la rangée (`flexGrow`) : il a toujours de la marge, et ne passe à la ligne qu'entre deux mots quand
// la place manque vraiment.
//
// Lot R5b, tour 2 (relecture Opus 3) : on ne compte plus sur la mesure pour placer l'aide. Dès que la police du système
// est agrandie (`fontScale > 1`) ou que la rangée fait moins de 400 dp, l'aide (ou le lien, la mention) passe dessous et
// le titre a toute la rangée (`flexBasis: "100%"`). Même règle pour les copies de ce titre (`SecH` de `KitTz` et de
// l'Accueil, sections des personnes de l'Explorer, rôles de l'équipe) : `useSecHeadStack`.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type ReactNode, useCallback, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from "react-native";

import { Muted } from "./Muted";

const { space2 } = tokens.spacing;

/** Sous cette largeur de rangée (dp), l'aide de droite passe sous le titre. */
export const SEC_HEAD_STACK_BELOW = 400;

/**
 * L'aide passe-t-elle sous le titre ? Police agrandie ou fenêtre de moins de 400 dp (la rangée est alors forcément plus
 * étroite) : oui, sans rien mesurer. Sinon, la rangée est mesurée une fois posée (`onLayout`, à poser sur elle).
 */
export function useSecHeadStack(): { stacked: boolean; onLayout?: (e: LayoutChangeEvent) => void } {
  const { width, fontScale } = useWindowDimensions();
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setRowWidth((prev) => (prev === w ? prev : w));
  }, []);
  if (fontScale > 1 || width < SEC_HEAD_STACK_BELOW) return { stacked: true };
  return { stacked: rowWidth !== null && rowWidth < SEC_HEAD_STACK_BELOW, onLayout };
}

export function SecHead({
  title,
  hint,
  right,
  testID,
}: {
  title: string;
  hint?: string;
  /** À la place de l'aide : un lien ou un petit bouton à droite. */
  right?: ReactNode;
  testID?: string;
}) {
  const { t } = useTheme();
  const { stacked, onLayout } = useSecHeadStack();
  return (
    <View style={secHeadStyles.row} onLayout={onLayout} testID={testID}>
      <Text
        variant="posterM"
        color={t.color.ink}
        accessibilityRole="header"
        style={[secHeadStyles.title, stacked && secHeadStyles.titleStacked]}
      >
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
 * titre qui prend la place restante ; posé dessus (`titleStacked`), il prend toute la rangée.
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
  // Lot C1 : `.sec-h h2` de l’artefact, Archivo 125 % 900 italique 16 px.
  title: { flexGrow: 1, flexShrink: 1, fontSize: 16, lineHeight: 18, letterSpacing: -0.16 },
  titleStacked: { flexBasis: "100%" },
  hint: { flexShrink: 1, textAlign: "right" },
  hintStacked: { textAlign: "left" },
});
