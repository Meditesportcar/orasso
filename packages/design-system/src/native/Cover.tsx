// Cover : la couverture du système de design. Décorative : crème, moutarde, rouge et nuit, coupés à dix degrés.

import { useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { G, Polygon, Rect } from "react-native-svg";
import { Text } from "./text";
import { useTheme } from "./theme";

export type CoverProps = {
  title?: string;
  subtitle?: string;
  style?: ViewStyle;
};

// Le dessin et le texte sont posés dans un cadre de 960 × 288, mis à l'échelle de la largeur disponible.
const W = 960;
const H = 288;

/**
 * La couverture du système de design : une affiche crème sur le mur, la moutarde et le rouge posés dessus comme
 * des autocollants, la bande de nuit qui sort à droite.
 */
export function Cover({
  title = "Orasso",
  subtitle = "Affiche de nuit · tout le monde à sa place",
  style,
}: CoverProps) {
  const { t } = useTheme();
  const c = t.color;
  const [width, setWidth] = useState(W);
  const scale = width / W;
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return (
    <View
      onLayout={onLayout}
      accessibilityRole="image"
      accessibilityLabel="Orasso : crème, moutarde, rouge et nuit, coupés à dix degrés"
      style={[{ height: H * scale }, styles.cover, style]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Rect x={480} y={0} width={240} height={288} fill={c.poster} />
        <G fill={c.ground}>
          <Polygon points="480,200 720,158 720,166 480,208" />
          <Polygon points="480,232 720,190 720,198 480,240" />
          <Polygon points="480,264 720,222 720,230 480,272" />
          <Polygon points="480,296 720,254 720,262 480,304" />
        </G>
        <Rect x={720} y={0} width={240} height={96} fill={c.night} />
        <Rect x={744} y={120} width={168} height={144} rx={18} fill={c.accent} />
        <Rect x={640} y={24} width={72} height={72} rx={18} fill={c.win} />
        <Rect x={744} y={24} width={120} height={48} rx={18} fill={c.surfaceRaised} />
        <Rect x={800} y={192} width={160} height={96} rx={18} fill={c.night} />
      </Svg>
      <View pointerEvents="none" style={[styles.text, { left: 48 * scale, bottom: 30 * scale, maxWidth: 440 * scale }]}>
        <Text
          variant="posterXl"
          color={c.ink}
          style={{
            fontSize: 96 * scale,
            lineHeight: 86 * scale,
            letterSpacing: -0.96 * scale,
            marginBottom: 12 * scale,
          }}
        >
          {title}
        </Text>
        <Text variant="meta" color={c.inkMuted} style={{ fontSize: 12 * Math.max(scale, 0.5) }}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: "100%", overflow: "hidden" },
  text: { position: "absolute" },
});
