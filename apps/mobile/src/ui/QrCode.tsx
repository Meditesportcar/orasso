// QR code dessiné en SVG. Toujours sombre sur clair, quel que soit le thème : le thème Sable inverse la carte affiche
// (fond sombre), mais un QR inversé n'est pas lu par tous les lecteurs. La tuile du QR prend donc les jetons de la
// carte affiche du Béton (fond clair, encre sombre) dans les deux thèmes.
import { tokens } from "@orasso/design-system/native";
import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { qrMatrix, qrPath, qrViewBox } from "@/lib/qr";

const light = tokens.color.beton.poster;
const dark = tokens.color.beton.posterInk;

export function QrCode({ value, size, label }: { value: string; size: number; label: string }) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  const path = useMemo(() => qrPath(matrix), [matrix]);
  const box = qrViewBox(matrix);
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
        <Rect x={0} y={0} width={box} height={box} fill={light} />
        <Path d={path} fill={dark} />
      </Svg>
    </View>
  );
}
