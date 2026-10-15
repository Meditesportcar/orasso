// Une photo qui remplit son cadre, éventuellement coupée à 10° (carte affiche, vignette).
// React Native n'a pas de clip-path : la coupe est un polygone SVG (ClipPath) appliqué à l'image.

import { useId, useState } from "react";
import { type ImageSourcePropType, type LayoutChangeEvent, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { ClipPath, Defs, Image as SvgImage, Polygon } from "react-native-svg";
import { GradientRect } from "./Gradient";

/** Polygones des coupes, en fractions du cadre (ceux des aperçus du système, voir docs/JOURNAL-DES-CHOIX.md). */
export const cuts = {
  none: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ],
  /** Carte affiche : la coupe monte vers la droite (angle du logo). */
  poster: [
    [0, 0.18],
    [1, 0],
    [1, 1],
    [0, 1],
  ],
  /** Vignette : bords haut et bas inclinés. */
  thumb: [
    [0, 0],
    [1, 0.1],
    [1, 1],
    [0, 0.9],
  ],
} as const;

export type PhotoProps = {
  /** L'image (require ou { uri }). */
  source?: ImageSourcePropType;
  /** Sans image : un dégradé CSS des jetons (maquette, chargement, photo absente). */
  placeholder?: string;
  cut?: keyof typeof cuts;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export function Photo({ source, placeholder, cut = "none", style, accessibilityLabel }: PhotoProps) {
  const id = `p${useId().replaceAll(":", "")}`;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };
  return (
    <View
      onLayout={onLayout}
      accessibilityRole={source ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[styles.box, style]}
    >
      {size && size.width > 0 && (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <ClipPath id={`${id}c`}>
              <Polygon points={cuts[cut].map(([x, y]) => `${x * size.width},${y * size.height}`).join(" ")} />
            </ClipPath>
          </Defs>
          {source ? (
            <SvgImage
              href={source}
              width={size.width}
              height={size.height}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${id}c)`}
            />
          ) : placeholder ? (
            <GradientRect
              css={placeholder}
              width={size.width}
              height={size.height}
              id={`${id}g`}
              clipPath={`url(#${id}c)`}
            />
          ) : null}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ box: { overflow: "hidden" } });
