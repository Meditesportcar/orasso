// Le fond vivant : cinq couches (halo, reflet, faisceau, marquage, vignette) puis le grain. Jamais un aplat.
// Redessiné avec react-native-svg d'après les jetons ground-fx ; mêmes couches que le composant web.

import type { ReactNode } from "react";
import { type LayoutChangeEvent, StyleSheet, View, type ViewProps } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { GradientFill } from "./Gradient";
import { BREATH_SCALE, SWEEP_TRAVEL, useBreath, usePhares, useSweep } from "./motionHooks";
import { Grain } from "./Textures";
import { useTheme } from "./theme";

export type GroundProps = Omit<ViewProps, "children"> & {
  /** `screen` : fond d'un écran de téléphone ; `site` : marquage au pas de 200 px, halo resserré. */
  variant?: "screen" | "site";
  /**
   * Halo qui respire (6 s), phares (9 s), faisceau (14 s) : passionné seulement. Faux pour le staff et le jour J
   * (terrain : fond immobile). Sans effet quand l'appareil demande moins d'animations.
   */
  animated?: boolean;
  children?: ReactNode;
};

// Le faisceau est plus large que l'écran pour que le balayage ne découvre jamais un bord (web : inset 0 -14%).
const SWEEP_OVERSCAN = 0.14;

function Fx({ variant, animated }: { variant: "screen" | "site"; animated: boolean }) {
  const { t, reducedMotion } = useTheme();
  const fx = variant === "site" ? t.groundFxSite : t.groundFx;
  const moving = animated && !reducedMotion;
  const breath = useBreath(moving);
  const phares = usePhares(moving);
  const sweep = useSweep(moving);
  const width = useSharedValue(0);

  const haloStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (BREATH_SCALE - 1) * breath.value }] }));
  const refletStyle = useAnimatedStyle(() => ({ opacity: phares.value }));
  const sweepStyle = useAnimatedStyle(() => {
    const travel = SWEEP_TRAVEL * width.value * (1 + 2 * SWEEP_OVERSCAN);
    return { transform: [{ translateX: (sweep.value * 2 - 1) * travel }] };
  });

  const onLayout = (event: LayoutChangeEvent) => {
    width.value = event.nativeEvent.layout.width;
  };

  return (
    <View pointerEvents="none" style={styles.fx} onLayout={onLayout}>
      <GradientFill css={fx.vignette} />
      <GradientFill css={fx.marquage} />
      <Animated.View
        style={[styles.sweep, { left: `-${SWEEP_OVERSCAN * 100}%`, right: `-${SWEEP_OVERSCAN * 100}%` }, sweepStyle]}
      >
        <GradientFill css={fx.faisceau} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, refletStyle]}>
        <GradientFill css={fx.reflet} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.haloOrigin, haloStyle]}>
        <GradientFill css={fx.halo} />
      </Animated.View>
      <Grain />
    </View>
  );
}

/**
 * Le fond d'un écran. Le contenu passe au-dessus. Le consommateur ne fournit que le thème (ThemeProvider) :
 * un écran n'a pas le droit de modifier son fond.
 */
export function Ground({ variant = "screen", animated = false, style, children, ...rest }: GroundProps) {
  const { t } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: t.color.ground }, style]} {...rest}>
      <Fx variant={variant} animated={animated} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden", isolation: "isolate" },
  fx: { ...StyleSheet.absoluteFill, overflow: "hidden", isolation: "isolate" },
  sweep: { position: "absolute", top: 0, bottom: 0 },
  haloOrigin: { transformOrigin: "95% 0%" },
  content: { flex: 1 },
});
