// Le grain du fond et le brossage des barres, en tuiles PNG calculées depuis les jetons (voir noise.ts).

import { useMemo } from "react";
import { Image, StyleSheet, View } from "react-native";
import { type TextureSpec, textureTile } from "./noise";
import { useTheme } from "./theme";

type Blend = "overlay" | "multiply" | "screen";

// Tailles de tuile : assez grandes pour qu'on ne voie pas la répétition, assez petites pour être calculées vite.
const GRAIN_TILE = 256;
const BRUSH_TILE = { width: 512, height: 64 };

function Tile({
  spec,
  width,
  height,
  opacity,
  blend,
}: {
  spec: TextureSpec;
  width: number;
  height: number;
  opacity: number;
  blend: Blend;
}) {
  const texture = useMemo(() => textureTile(spec, width, height), [spec, width, height]);
  // La fusion (overlay, multiply, screen) et l'opacité s'appliquent à la couche entière, comme sur le web.
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { opacity, mixBlendMode: blend }]}
    >
      <Image source={{ uri: texture.uri, width, height }} resizeMode="repeat" style={StyleSheet.absoluteFill} />
    </View>
  );
}

/** Le grain d'asphalte du fond : immobile, jamais animé. Overlay à 28 % en Béton, multiply à 32 % en Sable. */
export function Grain() {
  const { grain } = useTheme().t;
  return <Tile spec={grain} width={GRAIN_TILE} height={GRAIN_TILE} opacity={grain.opacity} blend={grain.blend as Blend} />;
}

/** Le brossage des barres (feTurbulence très étiré), à poser dans un conteneur isolé, derrière le contenu. */
export function Brush() {
  const { barBrush } = useTheme().t;
  return (
    <Tile
      spec={barBrush}
      width={BRUSH_TILE.width}
      height={BRUSH_TILE.height}
      opacity={barBrush.opacity}
      blend={barBrush.blend as Blend}
    />
  );
}
