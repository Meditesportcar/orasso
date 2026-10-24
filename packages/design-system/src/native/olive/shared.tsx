// Briques communes du O vivant natif (lot 39) : la voiture vue de dessus peinte aux jetons, l'horloge image par image
// (un seul useFrameCallback par variante, arrêté hors focus et en arrière-plan), le O et sa voiture garée.

import { type ComponentProps, type ReactNode, useEffect, useId, useState } from "react";
import { AppState, Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  type SharedValue,
  useFrameCallback,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { olive, smoke } from "../../motion";
import { type BrandTone, oTransform, useTone } from "../Brand";
import { brandArt } from "../brandArt";
import { withAlpha } from "../color";
import { duration, easings, park } from "../motionHooks";
import { useTheme } from "../theme";
import { useOliveScreenActive } from "./activity";
import { AnimatedCar } from "./brandCar";
import { poolSlots, smokePoolSize } from "./smoke";

export { poolSlots };

const { carTop } = brandArt;
const [, , viewW, viewH] = carTop.viewBox;
const [, , boxW] = carTop.box;

/** Côté de la scène autour du O, en unités du monogramme (le O mesure 135 × 104, le drift tourne à 92 × 72). */
export const STAGE = 260;
/** Scène resserrée des petites tailles (24 px, dans un bouton) : le O occupe les deux tiers de la boîte. */
export const STAGE_COMPACT = 200;
/** Le drift autour du O : rayon horizontal et écrasement vertical (prototype : 92 × 72). */
export const ORBIT = { radius: 92, squash: 0.78 } as const;
/** Longueur de la voiture vue de dessus autour du O, en unités du monogramme. */
export const CAR_UNITS = 36;
/**
 * Petites tailles (bouton, 24 px) : la voiture fait presque la moitié du O (8 px à 24 px) pour que le mouvement se
 * voie, et elle prend l'encre du O (la moutarde disparaîtrait sur un bouton moutarde).
 */
export const CAR_UNITS_COMPACT = 64;
/** En dessous de cette taille (px), l'indicateur passe en version compacte. */
export const COMPACT_MAX = 32;
/** L'anneau de progression de l'envoi, entre le O (135 × 104) et le drift (92 × 72 de rayon). */
export const RING = { rx: 80, ry: 64 } as const;
/** Périmètre approché d'une ellipse (Ramanujan), pour les pointillés de l'anneau. */
export function ellipsePerimeter(rx: number, ry: number): number {
  return Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
}
const [monoX, monoY, monoW] = brandArt.viewBox;
/** Centre du O dans le viewBox du monogramme. */
export const O_CENTER = { x: monoX + monoW / 2, y: monoY + monoW / 2 } as const;
/** Côté du viewBox du monogramme (le O centré dedans). */
export const MONO_UNITS = monoW;

/** La voiture vue de dessus (64 × 28, nez vers la droite) ; `length` en px. Caisse `poster`, feux `win`, fumée `ink`. */
export function CarTop({
  length,
  color,
  steer = 0,
  smoke = 1,
  spoiler = false,
}: {
  length: number;
  /** Caisse : `poster` par défaut (crème en Béton, nuit en Sable) ; la voiture de tête du O est moutarde. */
  color?: string;
  /** Braquage des roues avant, en radians (contre-braquage négatif). */
  steer?: number;
  /** Intensité de la fumée, 0 → 1 (multipliée par les 12 % de l'encre). */
  smoke?: number;
  spoiler?: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const width = (length * viewW) / boxW;
  const height = (width * viewH) / viewW;
  const steerDeg = (steer * 180) / Math.PI;
  const rect = (r: { x: number; y: number; width: number; height: number; rx: number }, fill: string, key: string) => (
    <Rect key={key} x={r.x} y={r.y} width={r.width} height={r.height} rx={r.rx} fill={fill} />
  );
  return (
    <Svg width={width} height={height} viewBox={carTop.viewBox.join(" ")} pointerEvents="none">
      {smoke > 0 &&
        carTop.smoke.map((s) => (
          <Circle key={s.cx} cx={s.cx} cy={s.cy} r={s.r} fill={c.ink} opacity={Math.min(1, smoke) * 0.12 * s.opacity} />
        ))}
      {carTop.rearWheels.map((w) => rect(w, c.night, `r${w.cy}`))}
      {carTop.frontWheels.map((w) => (
        <G key={`f${w.cy}`} transform={`rotate(${steerDeg} ${w.cx} ${w.cy})`}>
          {rect(w, c.night, "w")}
        </G>
      ))}
      <Path d={carTop.body} fill={color ?? c.poster} />
      {spoiler && rect(carTop.spoiler, color ?? c.poster, "s")}
      <Path d={carTop.glass} fill={withAlpha(c.ground, 0.85)} />
      {carTop.headlights.map((r) => rect(r, c.nightInk, `h${r.y}`))}
      {carTop.brakeLights.map((r) => rect(r, c.win, `b${r.y}`))}
    </Svg>
  );
}

/** Taille en px de la boîte de dessin d'une voiture de `length` px (fumée comprise) : à centrer sur sa position. */
export function carBox(length: number) {
  const width = (length * viewW) / boxW;
  return { width, height: (width * viewH) / viewW };
}

/** Vrai tant que l'appli est au premier plan : le O vivant et le fond s'arrêtent en arrière-plan. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== "background");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => subscription.remove();
  }, []);
  return active;
}

/**
 * Le O vivant et le fond peuvent bouger : appli au premier plan et écran affiché (OliveActivityProvider, alimenté par
 * l'appli avec useIsFocused). Utilisé par chaque variante en plus de leur prop `paused`.
 */
export function useOliveActive(): boolean {
  const app = useAppActive();
  const screen = useOliveScreenActive();
  return app && screen;
}

/**
 * L'horloge du O vivant (ms écoulées) : le seul useFrameCallback de la variante, actif seulement quand `running`
 * (au premier plan, écran au focus, animation en cours, pas de réduction des animations).
 */
export function useOliveClock(running: boolean): SharedValue<number> {
  const clock = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    "worklet";
    clock.value += info.timeSincePreviousFrame ?? 0;
  }, false);
  useEffect(() => {
    frame.setActive(running);
    return () => frame.setActive(false);
  }, [running, frame]);
  return clock;
}

/** Le geste « se garer » de la voiture du logo : de `from` jusqu'à 6 unités au-delà de sa place, puis en place. */
export function parkCar(offset: SharedValue<number>, from: number) {
  offset.value = from;
  offset.value = withSequence(
    withTiming(park.overshoot, { duration: olive.park * 0.6, easing: easings.park }),
    withTiming(0, { duration: olive.park * 0.4, easing: easings.inout }),
  );
}

/** Fondu de `fast` (réduction des animations : tout apparaît en 120 ms). */
export function fadeIn(value: SharedValue<number>) {
  value.value = 0;
  value.value = withTiming(1, { duration: duration.fast, easing: easings.linear });
}

/**
 * Le O du monogramme et sa voiture du logo (garée quand `offset` vaut 0, dehors à gauche à −120). `size` : côté du
 * monogramme en px. `clip` : la voiture n'est visible que dans l'ouverture de l'O.
 */
export function OMark({
  size,
  offset,
  tone = "auto",
  ink,
  clip = true,
}: {
  size: number;
  offset: SharedValue<number>;
  tone?: BrandTone;
  /** Encre du O (sinon celle du kit selon le ton). */
  ink?: string;
  clip?: boolean;
}) {
  const version = useTone(tone);
  const id = `ov${useId().replaceAll(":", "")}`;
  return (
    <Svg width={size} height={size} viewBox={brandArt.viewBox.join(" ")} pointerEvents="none">
      <Path transform={oTransform} d={brandArt.oPath} fill={ink ?? brandArt.ink[version]} fillRule="evenodd" />
      <AnimatedCar id={id} offset={offset} clipHole={clip} />
    </Svg>
  );
}

/**
 * Une voiture vue de dessus qui drifte autour du O : sa pose vient de `pose` (worklet), en unités de scène × `k` px.
 * Rendue centrée sur la scène de `stagePx` px.
 */
export function OrbitCar({
  stagePx,
  length,
  color,
  style,
}: {
  stagePx: number;
  length: number;
  color?: string;
  /** Style animé (useAnimatedStyle) qui porte la pose. */
  style: ComponentProps<typeof Animated.View>["style"];
}) {
  const box = carBox(length);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.car,
        { width: box.width, height: box.height, left: (stagePx - box.width) / 2, top: (stagePx - box.height) / 2 },
        style,
      ]}
    >
      <CarTop length={length} color={color} steer={(olive.steer * Math.PI) / 180} />
    </Animated.View>
  );
}

/**
 * Une bouffée de fumée (lot C8) : un disque en dégradé radial pré-dessiné (`ink-muted` au centre vers transparent, pas
 * de flou en temps réel), de rayon `maxR` px, que le style animé déplace, met à l'échelle et efface (transform et
 * opacité seulement : la vue n'est jamais redessinée).
 */
export function SmokePuff({ maxR, style }: { maxR: number; style: ComponentProps<typeof Animated.View>["style"] }) {
  const { t } = useTheme();
  const id = `sp${useId().replaceAll(":", "")}`;
  const d = maxR * 2;
  return (
    <Animated.View pointerEvents="none" style={[styles.layer, { width: d, height: d, opacity: 0 }, style]}>
      <Svg width={d} height={d} viewBox="0 0 2 2">
        <Defs>
          <RadialGradient id={id} cx="1" cy="1" r="1" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={t.color.inkMuted} stopOpacity={1} />
            <Stop offset="1" stopColor={t.color.inkMuted} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={1} cy={1} r={1} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Taille du pool de bouffées par voiture, selon l'écran et l'appareil (téléphones modestes : moins). */
export function useSmokePool(kind: "battle" | "orbit" = "battle"): number {
  const { width } = useWindowDimensions();
  const api = Platform.OS === "android" ? Number(Platform.Version) : undefined;
  const size = smokePoolSize(width, api, kind === "orbit" ? smoke.orbitPool : smoke.pool);
  return kind === "orbit" && Platform.OS === "android" ? Math.min(size, smoke.orbitPoolAndroidMax) : size;
}

export const styles = StyleSheet.create({
  car: { position: "absolute" },
  layer: { position: "absolute", left: 0, top: 0 },
  center: { alignItems: "center", justifyContent: "center" },
});

/** Calque centré de `inner` px dans une scène de `outer` px. */
export function centered(outer: number, inner: number) {
  const at = (outer - inner) / 2;
  return { position: "absolute" as const, left: at, top: at, width: inner, height: inner };
}

/** Un calque plein qui ne capte pas le toucher. */
export function Layer({ children }: { children: ReactNode }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {children}
    </View>
  );
}
