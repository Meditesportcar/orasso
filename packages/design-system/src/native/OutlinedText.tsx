// OutlinedText : le contour couleur du fond d'un texte posé sur une photo ou sur le fond animé (écart 1 de la DA v2,
// docs/design-system/README.md « Ce qui a changé depuis le gel », 19/10/2026). React Native n'a pas de
// `-webkit-text-stroke` : huit copies de la même chaîne, décalées d'un demi-trait dans les huit directions, sont posées
// derrière le texte dans la couleur du fond, plus un halo. Les copies sont masquées à l'accessibilité.
// Portée limitée : photo et fond animé. La règle « pas de contour ni de néon sur un texte » reste valable ailleurs.

import { StyleSheet, type TextStyle, View, type ViewStyle } from "react-native";
import { Text, type TextProps } from "./text";
import { textStyles } from "./textStyles";
import { useTheme } from "./theme";

export type OutlinedTextProps = TextProps & {
  /** Ce qui est sous le texte : le fond animé (`ground`), une photo (`photo`, contour nuit) ou une surface. */
  on: "ground" | "photo" | "surface";
  /** Épaisseur du trait en px ; par défaut min(0,24 em, 6 px) comme sur le site. */
  width?: number;
  /** Style du conteneur (placement : `alignSelf: "center"`, marges…) ; le texte prend sa largeur. */
  containerStyle?: ViewStyle;
};

/** Les huit directions, à un demi-trait (le trait CSS est centré sur le contour : la moitié dépasse). */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** Épaisseur par défaut du trait : min(0,24 em, 6 px). */
export function outlineWidth(fontSize: number): number {
  return Math.min(fontSize * 0.24, 6);
}

export function OutlinedText({
  on,
  width,
  containerStyle,
  variant,
  color,
  style,
  children,
  ...rest
}: OutlinedTextProps) {
  const { t } = useTheme();
  const outline = on === "photo" ? t.color.night : on === "surface" ? t.color.surface : t.color.ground;
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontSize = flat?.fontSize ?? textStyles[variant].fontSize ?? 15;
  const half = (width ?? outlineWidth(fontSize)) / 2;
  const halo: TextStyle = {
    textShadowColor: outline,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: Math.round(fontSize * 0.45),
  };
  return (
    <View style={[styles.wrap, containerStyle]}>
      {DIRECTIONS.map(([dx, dy]) => (
        <Text
          key={`${dx}${dy}`}
          // Les copies ne reprennent que l'apparence (style, nombre de lignes) : ni appui, ni nom accessible, ni identifiant.
          variant={variant}
          color={outline}
          numberOfLines={rest.numberOfLines}
          style={[style, styles.copy, { left: dx * half, right: -dx * half, top: dy * half }, halo]}
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {children}
        </Text>
      ))}
      <Text variant={variant} color={color} style={style} {...rest}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  copy: { position: "absolute" },
});
