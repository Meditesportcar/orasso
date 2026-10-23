// QR code dessiné en SVG. Toujours sombre sur clair, quel que soit le thème : le thème Sable inverse la carte affiche
// (fond sombre), mais un QR inversé n'est pas lu par tous les lecteurs. La tuile du QR prend donc les jetons de la
// carte affiche du Béton (fond clair, encre sombre) dans les deux thèmes.
// Lot M4 (maquette 5.1) : `logo` pose le O d'Orasso au centre (correction H, carré central vide de 22 % de la largeur,
// décodage vérifié par `lib/qr.test.ts`).
import { Monogram, tokens } from "@orasso/design-system/native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { QUIET_ZONE, qrMatrix, qrPath, qrViewBox } from "@/lib/qr";

const light = tokens.color.beton.poster;
const dark = tokens.color.beton.posterInk;

export function QrCode({
  value,
  size,
  label,
  logo = false,
}: {
  value: string;
  size: number;
  label: string;
  logo?: boolean;
}) {
  const matrix = useMemo(() => qrMatrix(value, { logo }), [value, logo]);
  const path = useMemo(() => qrPath(matrix), [matrix]);
  const box = qrViewBox(matrix);
  const unit = size / box;
  // Le O occupe le carré vide, une demi-marge de module autour.
  const mark = matrix.logo ? (matrix.logo.side - 1) * unit : 0;
  const offset = matrix.logo ? (QUIET_ZONE + matrix.logo.start + 0.5) * unit : 0;
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
        <Rect x={0} y={0} width={box} height={box} fill={light} />
        <Path d={path} fill={dark} />
      </Svg>
      {matrix.logo ? (
        <View
          style={[styles.mark, { left: offset, top: offset, width: mark, height: mark }]}
          pointerEvents="none"
          testID="qr-logo"
        >
          {/* « light » : la version du O pour fond clair (O noir, voiture moutarde). */}
          <Monogram size={mark} tone="light" alt="" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { position: "absolute", alignItems: "center", justifyContent: "center" },
});
