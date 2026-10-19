// Le fond vivant : cinq couches (halo, reflet, faisceau, marquage, vignette) puis le grain. Jamais un aplat.
// Redessiné avec react-native-svg d'après les jetons ground-fx ; mêmes couches que le composant web.
// Lot 39 (DA v2, écart 5) : variante « battle », le fond animé qui remplace le fond fixe : Béton = lampe à sodium (halo
// moutarde en haut à droite qui respire lentement) et contre-jour froid en bas à gauche ; Sable = fond uni (dégradé
// léger et grain, halo et reflet éteints par la surcouche v2), sans ombre ni reflet ; puis les meutes de la battle.

import type { ReactNode } from "react";
import { type LayoutChangeEvent, StyleSheet, View, type ViewProps } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { GradientFill } from "./Gradient";
import { BREATH_SCALE, SWEEP_TRAVEL, useBreath, usePhares, useSweep } from "./motionHooks";
import { BattleLayer } from "./olive/BattleLayer";
import { useIsGroundQuiet } from "./olive/quiet";
import { useAppActive } from "./olive/shared";
import { Grain } from "./Textures";
import { useTheme } from "./theme";

export type GroundProps = Omit<ViewProps, "children"> & {
  /**
   * `screen` : fond d'un écran de téléphone ; `site` : marquage au pas de 200 px, halo resserré ; `battle` (DA v2) :
   * lampe à sodium et contre-jour (Béton) ou fond uni (Sable), avec les meutes de drift.
   */
  variant?: "screen" | "site" | "battle";
  /**
   * Halo qui respire (6 s), phares (9 s), faisceau (14 s) : passionné seulement. Faux pour le staff et le jour J
   * (terrain : fond immobile). Sans effet quand l'appareil demande moins d'animations. (Variantes `screen` et `site`.)
   */
  animated?: boolean;
  /**
   * `battle` : fond immobile, sans meute ni respiration. Forcé par les écrans staff, jour J et tri (README, règle 5 :
   * le terrain ne joue pas).
   */
  still?: boolean;
  /** `battle` : écran hors focus (useIsFocused) : plus de meute. L'arrière-plan et une feuille ouverte coupent aussi. */
  paused?: boolean;
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

/** Le fond animé « battle » : vignette, contre-jour, lampe qui respire, grain, puis les meutes. */
function BattleFx({ still, paused }: { still: boolean; paused: boolean }) {
  const { t, reducedMotion } = useTheme();
  const fx = t.groundFx;
  const quiet = useIsGroundQuiet();
  const active = useAppActive();
  const moving = !still && !reducedMotion && !paused && active;
  const breath = useBreath(moving);
  const haloStyle = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ scale: 1 + (BREATH_SCALE - 1) * breath.value }] };
  });
  return (
    <View pointerEvents="none" style={styles.fx}>
      <GradientFill css={fx.vignette} />
      <GradientFill css={fx.battleRim} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.haloOrigin, haloStyle]}>
        <GradientFill css={fx.battleSpill} />
        <GradientFill css={fx.battleLamp} />
      </Animated.View>
      <Grain />
      <BattleLayer running={moving && !quiet} />
    </View>
  );
}

/**
 * Le fond d'un écran. Le contenu passe au-dessus. Le consommateur ne fournit que le thème (ThemeProvider) :
 * un écran n'a pas le droit de modifier son fond.
 */
export function Ground({
  variant = "screen",
  animated = false,
  still = false,
  paused = false,
  style,
  children,
  ...rest
}: GroundProps) {
  const { t } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: t.color.ground }, style]} {...rest}>
      {variant === "battle" ? <BattleFx still={still} paused={paused} /> : <Fx variant={variant} animated={animated} />}
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
