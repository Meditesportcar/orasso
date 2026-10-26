// Titre de section avec, à droite, un mot d'aide (prototype `sec-h` : « Remises par grade · Montre ton QR de compte »).
//
// Lot R5b (titres « SON » sur le Pixel de Damien) : un titre ne perd jamais de mot. Cause probable : le titre était
// réduit à sa largeur mesurée (rangée en `space-between`, sans `flexGrow`) ; sur Android 16, le texte natif pose les
// capitales italiques à leur encre, un peu plus large que leur chasse mesurée par React Native, et passe le dernier mot
// sur une seconde ligne que la hauteur mesurée ne montre pas (« SON » au lieu de « SON CREW »). Le titre prend désormais
// toute la place de la rangée (`flexGrow`) : il a toujours de la marge, et ne passe à la ligne qu'entre deux mots quand
// la place manque vraiment. L'aide de droite passe dessous si elle ne tient pas à côté (`flexWrap`).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Muted } from "./Muted";

const { space2 } = tokens.spacing;

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
  return (
    <View style={secHeadStyles.row} testID={testID}>
      <Text variant="posterM" color={t.color.ink} accessibilityRole="header" style={secHeadStyles.title}>
        {title}
      </Text>
      {right ??
        (hint ? (
          <Muted variant="caption" style={secHeadStyles.hint}>
            {hint}
          </Muted>
        ) : null)}
    </View>
  );
}

/**
 * Styles partagés des titres de section (`SecHead` et ses cousins des autres écrans) : rangée qui passe à la ligne,
 * titre qui prend la place restante.
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
  hint: { flexShrink: 1, textAlign: "right" },
});
