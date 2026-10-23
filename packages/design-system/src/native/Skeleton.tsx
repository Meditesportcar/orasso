// Squelette (README, principe 6 : « les squelettes sont des plaques où la lumière balaie le métal brossé (1,6 s) ») :
// une plaque `surface` brossée, une bande de lumière qui la traverse en `loader` (1,6 s), en boucle. Lot M3 (fluidité) :
// tout ce qui attend une donnée montre un squelette à sa place, jamais un écran vide ; reduced motion = plaque fixe.
// Le balayage passe par l'`Animated` natif de React Native (pilote natif) : il s'arrête net au démontage, sans écrire
// sur une vue détruite quand la donnée arrive et que le squelette disparaît.
// Tour 2 : pas de balayage dans un écran caché (onglet préchargé, appli en arrière-plan : `useOliveActive`) ; avec les
// animations réduites, la plaque apparaît en fondu de 120 ms (`fast`) et reste fixe.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, type LayoutChangeEvent, StyleSheet, type ViewStyle } from "react-native";
import { duration } from "../motion";
import { tokens } from "../tokens";
import { GradientFill } from "./Gradient";
import { useOliveActive } from "./olive/shared";
import { Brush } from "./Textures";
import { useTheme } from "./theme";

export type SkeletonProps = {
  /** Hauteur (px) ; la largeur suit le conteneur, sauf `width`. */
  height: number;
  width?: number | `${number}%`;
  /** Rayon : `radiusMd` par défaut (celui des cartes). */
  radius?: number;
  style?: ViewStyle;
  testID?: string;
};

export function Skeleton({ height, width, radius, style, testID }: SkeletonProps) {
  const { t, reducedMotion } = useTheme();
  const [w, setW] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(reducedMotion ? 0 : 1)).current;
  const active = useOliveActive();
  useEffect(() => {
    if (!reducedMotion) return;
    Animated.timing(fade, {
      toValue: 1,
      duration: duration.fast,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, fade]);
  useEffect(() => {
    if (reducedMotion || !w || !active) return;
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: duration.loader,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, w, sweep, active]);
  const band = Math.max(80, w * 0.45);
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-band, w + band] });
  const onLayout = (event: LayoutChangeEvent) => setW(Math.round(event.nativeEvent.layout.width));
  return (
    <Animated.View
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID ?? "skeleton"}
      style={[
        styles.plate,
        {
          height,
          width: width ?? "100%",
          borderRadius: radius ?? tokens.radius.radiusMd,
          backgroundColor: t.color.surface,
        },
        { opacity: fade },
        style,
      ]}
    >
      <Brush />
      {!reducedMotion && w > 0 ? (
        <Animated.View style={[styles.band, { width: band, transform: [{ translateX }] }]} pointerEvents="none">
          <GradientFill
            css={`linear-gradient(90deg, ${t.color.ink}00 0%, ${t.color.ink}14 50%, ${t.color.ink}00 100%)`}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  plate: { overflow: "hidden", isolation: "isolate" },
  band: { position: "absolute", top: 0, bottom: 0, left: 0 },
});
