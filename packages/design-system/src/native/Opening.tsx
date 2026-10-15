// L'écran d'ouverture : le logo animé du kit, seul, 1,6 s, une fois par lancement, fond immobile.
// La voiture arrive de la gauche et se gare dans le O, le O prend sa place, les lettres se découvrent.
// Images clés : identite/anime/orasso-logo-anime-fond-sombre.svg (brandArt.intro). « Reduce motion » : logo garé.

import { useEffect, useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { type BrandTone, LogoLetters, oTransform, useTone } from "./Brand";
import { brandArt } from "./brandArt";
import { Ground } from "./Ground";
import { AnimatedCar, keyframeSteps } from "./Loader";
import { duration } from "./motionHooks";
import { useTheme } from "./theme";

const { intro, logoViewBox } = brandArt;
const [, viewY, viewW, viewH] = logoViewBox;
/** Centre du O dans le viewBox du logotype (le O mesure environ 135 × 104 une fois décalé de oOffset). */
const O_CENTER = { x: 67.7, y: 50 };
/** Le rideau du fichier de marque couvre [−40 + x, 720 + x] : son bord droit est à 720 + x. */
const WIPE_EDGE = 720;

export type OpeningLogoProps = {
  /** Largeur du logotype en px. */
  width?: number;
  tone?: BrandTone;
  /** Appelé à la fin de l'animation (1,6 s ; un fondu `fast` avec « reduce motion »). */
  onDone?: () => void;
};

/** Le logo animé, tel quel, et rien d'autre. */
export function OpeningLogo({ width = 240, tone = "dark", onDone }: OpeningLogoProps) {
  const version = useTone(tone);
  const { reducedMotion } = useTheme();
  const id = `o${useId().replaceAll(":", "")}`;
  const height = (width * viewH) / viewW;
  const k = width / viewW;

  const wipe = useSharedValue(reducedMotion ? 0 : (intro.wipe[0]?.x ?? 0));
  const car = useSharedValue(reducedMotion ? 0 : (intro.car[0]?.x ?? 0));
  const scale = useSharedValue(reducedMotion ? 1 : (intro.o[0]?.scale ?? 1));
  const opacity = useSharedValue(reducedMotion ? 1 : (intro.o[0]?.opacity ?? 1));

  useEffect(() => {
    if (reducedMotion) {
      wipe.value = 0;
      car.value = 0;
      scale.value = 1;
      opacity.value = 1;
      const timer = setTimeout(() => onDone?.(), duration.fast);
      return () => clearTimeout(timer);
    }
    wipe.value = withSequence(...keyframeSteps(intro.wipe, duration.loader, (f) => f.x));
    car.value = withSequence(...keyframeSteps(intro.car, duration.loader, (f) => f.x));
    scale.value = withSequence(...keyframeSteps(intro.o, duration.loader, (f) => f.scale ?? 1));
    opacity.value = withSequence(...keyframeSteps(intro.o, duration.loader, (f) => f.opacity ?? 1));
    const timer = setTimeout(() => onDone?.(), duration.loader);
    return () => {
      clearTimeout(timer);
      for (const value of [wipe, car, scale, opacity]) cancelAnimation(value);
    };
  }, [reducedMotion, onDone, wipe, car, scale, opacity]);

  const wipeStyle = useAnimatedStyle(() => ({
    width: Math.min(1, Math.max(0, (WIPE_EDGE + wipe.value) / viewW)) * width,
  }));
  const oStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <View accessibilityRole="image" accessibilityLabel="Orasso" accessible style={{ width, height }}>
      {/* Les lettres, découvertes de gauche à droite par le rideau. */}
      <Animated.View style={[styles.layer, { height }, styles.clip, wipeStyle]}>
        <Svg width={width} height={height} viewBox={logoViewBox.join(" ")}>
          <LogoLetters id={`${id}l`} ink={brandArt.logoInk[version]} withO={false} />
        </Svg>
      </Animated.View>
      {/* Le O, qui prend sa place (échelle 1,35 → 1) autour de son centre. */}
      <Animated.View
        style={[
          styles.layer,
          { width, height, transformOrigin: `${O_CENTER.x * k}px ${(O_CENTER.y - viewY) * k}px` },
          oStyle,
        ]}
      >
        <Svg width={width} height={height} viewBox={logoViewBox.join(" ")}>
          <Path transform={oTransform} d={brandArt.oPath} fill={brandArt.ink[version]} fillRule="evenodd" />
        </Svg>
      </Animated.View>
      {/* La voiture, qui arrive de la gauche et se gare. */}
      <View style={[styles.layer, { width, height }]}>
        <Svg width={width} height={height} viewBox={logoViewBox.join(" ")}>
          <AnimatedCar id={`${id}c`} offset={car} clipHole={false} />
        </Svg>
      </View>
    </View>
  );
}

export type OpeningScreenProps = {
  /** Appelé quand le logo est garé : l'appli passe à son premier écran. */
  onDone?: () => void;
  logoWidth?: number;
};

/** L'écran d'ouverture : le logo animé du kit, seul, sur le fond (immobile). Une fois par lancement. */
export function OpeningScreen({ onDone, logoWidth }: OpeningScreenProps) {
  return (
    <Ground animated={false}>
      <View style={styles.center}>
        <OpeningLogo width={logoWidth} onDone={onDone} />
      </View>
    </Ground>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", top: 0, left: 0 },
  clip: { overflow: "hidden" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
