// Mouvement « tout se gare » : Park, Cascade, Reveal, TabPanel, ScreenTransition, Sheet.
// Mêmes noms et même rôle que web/components/Motion.tsx. Réduction des animations : fondu `fast` partout.

import { Children, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { withAlpha } from "./color";
import { duration, easings, park, startPark, useFadeStyle, useParkStyle } from "./motionHooks";
import { useGroundQuiet } from "./olive/quiet";
import { angle, radius, useTheme } from "./theme";

type BoxProps = ViewProps & { children?: ReactNode };

/** Ce qui arrive se gare : park jusqu'à 6 px au-delà de sa place, puis inout jusqu'à la place (`base`). */
export function Park({ style, delay, trigger, children, ...rest }: BoxProps & { delay?: number; trigger?: unknown }) {
  const animated = useParkStyle({ delay, trigger });
  return (
    <Animated.View style={[animated, style]} {...rest}>
      {children}
    </Animated.View>
  );
}

/** Une liste qui apparaît en cascade (`stagger`) : quatre lignes au plus, les suivantes d'un bloc. */
export function Cascade({ style, children, ...rest }: BoxProps) {
  const items = Children.toArray(children);
  return (
    <View style={style} {...rest}>
      {items.map((child, i) => (
        <Park key={(child as { key?: string }).key ?? i} delay={Math.min(i, park.staggerMax - 1) * duration.stagger}>
          {child}
        </Park>
      ))}
    </View>
  );
}

/** Changement d'onglet : fondu avec huit pixels de montée (base) ; l'ancien contenu s'efface en fast. */
export function TabPanel({ style, children, ...rest }: BoxProps) {
  const { reducedMotion } = useTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: reducedMotion ? duration.fast : duration.base,
      easing: reducedMotion ? easings.linear : easings.out,
    });
  }, [progress, reducedMotion]);
  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reducedMotion ? 0 : (1 - progress.value) * park.tabRise }],
  }));
  return (
    <Animated.View accessibilityRole="tablist" style={[animated, style]} {...rest}>
      {children}
    </Animated.View>
  );
}

/**
 * L'affiche se dévoile par la coupe à 10° (`poster`) : carte affiche, nouveau grade, mode jour J.
 * Un rideau diagonal (le bord est incliné de l'angle `cut`) découvre le contenu de gauche à droite.
 */
export function Reveal({ style, children, ...rest }: BoxProps) {
  const { reducedMotion } = useTheme();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [done, setDone] = useState(false);
  const progress = useSharedValue(0);
  const fade = useFadeStyle();

  const onLayout = (event: LayoutChangeEvent) => {
    if (size) return;
    const { width, height } = event.nativeEvent.layout;
    // Arrondi par excès : une largeur fractionnaire rognée d'un demi-pixel ferait passer un texte à la ligne.
    setSize({ width: Math.ceil(width), height: Math.ceil(height) });
  };

  const lean = size ? size.height * Math.tan((angle.cut * Math.PI) / 180) : 0;
  useEffect(() => {
    if (!size || reducedMotion) return;
    progress.value = withTiming(1, { duration: duration.poster, easing: easings.out });
    const timer = setTimeout(() => setDone(true), duration.poster);
    return () => clearTimeout(timer);
  }, [size, reducedMotion, progress]);

  const curtain = useAnimatedStyle(() => {
    const full = (size?.width ?? 0) + 2 * lean;
    return { width: interpolate(progress.value, [0, 1], [0, full]) };
  });

  if (reducedMotion) {
    return (
      <Animated.View style={[fade, style]} {...rest}>
        {children}
      </Animated.View>
    );
  }
  if (!size) {
    return (
      <View style={[style, styles.hidden]} onLayout={onLayout} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <View style={[style, { width: size.width, height: size.height }]} {...rest}>
      <Animated.View
        style={[
          styles.curtain,
          { left: -lean, height: size.height, transform: [{ skewX: `${-angle.cut}deg` }] },
          done ? styles.visible : styles.clipped,
          curtain,
        ]}
      >
        <View
          style={{
            marginLeft: lean,
            width: size.width,
            height: size.height,
            transform: [{ skewX: `${angle.cut}deg` }],
          }}
        >
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

export type ScreenTransitionProps = {
  /** Clé de l'écran courant : quand elle change, le nouvel écran se gare depuis la droite. */
  screenKey: string;
  children: ReactNode;
  style?: ViewStyle;
};

/**
 * Changer d'écran : l'écran qui arrive se gare depuis la droite (base) pendant que celui qui part s'efface en
 * fondu croisé (`screenOut`), jamais l'un posé sur l'autre puis l'ancien qui disparaît. Le premier écran apparaît
 * sans animation. Avec « réduction des animations », tout devient un fondu `fast`.
 */
export function ScreenTransition({ screenKey, children, style }: ScreenTransitionProps) {
  const current = useRef({ key: screenKey, node: children });
  const [leaving, setLeaving] = useState<{ key: string; node: ReactNode } | null>(null);
  const [entered, setEntered] = useState(false);

  if (current.current.key !== screenKey) {
    // On garde l'ancien écran le temps de son fondu de sortie.
    setLeaving(current.current);
    setEntered(true);
    current.current = { key: screenKey, node: children };
  } else {
    current.current.node = children;
  }

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), duration.screenOut);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <View style={[styles.screens, style]}>
      {leaving && <Leaving key={`out-${leaving.key}`}>{leaving.node}</Leaving>}
      <Entering key={screenKey} animated={entered}>
        {children}
      </Entering>
    </View>
  );
}

function Leaving({ children }: { children: ReactNode }) {
  const { reducedMotion } = useTheme();
  const progress = useSharedValue(1);
  useEffect(() => {
    progress.value = withTiming(0, {
      duration: reducedMotion ? duration.fast : duration.screenOut,
      easing: easings.linear,
    });
  }, [progress, reducedMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.View pointerEvents="none" aria-hidden style={[StyleSheet.absoluteFill, animated]}>
      {children}
    </Animated.View>
  );
}

function Entering({ children, animated }: { children: ReactNode; animated: boolean }) {
  const style = useParkStyle({ axis: "x", from: park.screenFrom, enabled: animated });
  return <Animated.View style={[styles.screen, style]}>{children}</Animated.View>;
}

/** Une zone de l'écran dont le point de départ est donné par la mesure de ce qui l'ouvre. */
export type SheetOrigin = { x: number; y: number };

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  /** `bottom` : feuilles d'action (QR, casquettes, confirmation, motifs) ; `top` : le Journal, sous la barre. */
  from?: "bottom" | "top";
  /** Ce qui l'a ouverte (centre de la cloche, de l'avatar…) : la feuille part de là. */
  origin?: SheetOrigin;
  children: ReactNode;
  accessibilityLabel?: string;
};

/**
 * Une feuille : voile à 80 % sur tout l'écran, la feuille se gare du bas (ou du haut) avec 6 px de dépassement,
 * ou part de ce qui l'a ouverte. À poser en dernier enfant d'un conteneur plein écran.
 */
export function Sheet({ visible, onClose, from = "bottom", origin, children, accessibilityLabel }: SheetProps) {
  const { t, reducedMotion } = useTheme();
  const [height, setHeight] = useState(0);
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const veil = useSharedValue(0);
  // Lot 39 : feuille ouverte, le fond animé « battle » se tait.
  useGroundQuiet(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      veil.value = withTiming(1, { duration: reducedMotion ? duration.fast : duration.base, easing: easings.linear });
      startPark(progress, 0, reducedMotion);
      return;
    }
    veil.value = withTiming(0, { duration: duration.fast, easing: easings.linear });
    progress.value = withTiming(0, { duration: duration.fast, easing: easings.linear });
    const timer = setTimeout(() => setMounted(false), duration.fast);
    return () => clearTimeout(timer);
  }, [visible, reducedMotion, progress, veil]);

  const onLayout = useCallback((event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height), []);
  const sign = from === "bottom" ? 1 : -1;
  const sheetStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (reducedMotion) return { opacity: interpolate(p, [0, 2], [0, 1]) };
    const rise = origin ? 0 : interpolate(p, [0, 1, 2], [sign * (height || 600), -sign * park.overshoot, 0]);
    const scale = origin ? interpolate(p, [0, 1, 2], [0.1, 1, 1]) : 1;
    return {
      opacity: interpolate(p, [0, 1, 2], [0, 1, 1]),
      transform: [{ translateY: rise }, { scale }],
    };
  });
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));

  if (!mounted) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(t.color.night, 0.8) }, veilStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        />
      </Animated.View>
      <View pointerEvents="box-none" style={[styles.anchor, from === "bottom" ? styles.bottom : styles.top]}>
        <Animated.View
          onLayout={onLayout}
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
          style={[
            styles.sheet,
            from === "bottom" ? styles.sheetBottom : styles.sheetTop,
            {
              backgroundColor: t.color.surface,
              boxShadow: t.shadow.shadowSheet,
              transformOrigin: origin ? `${origin.x}px ${origin.y}px` : undefined,
            },
            sheetStyle,
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  curtain: { position: "absolute", top: 0, overflow: "hidden" },
  clipped: { overflow: "hidden" },
  visible: { overflow: "visible" },
  screens: { flex: 1 },
  screen: { flex: 1 },
  overlay: { zIndex: 10 },
  anchor: { ...StyleSheet.absoluteFill, justifyContent: "flex-end" },
  bottom: { justifyContent: "flex-end" },
  top: { justifyContent: "flex-start" },
  sheet: { padding: 16 },
  sheetBottom: { borderTopLeftRadius: radius.radiusXl, borderTopRightRadius: radius.radiusXl },
  sheetTop: { borderBottomLeftRadius: radius.radiusXl, borderBottomRightRadius: radius.radiusXl },
});
