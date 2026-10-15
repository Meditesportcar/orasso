// L'indicateur de chargement du kit : la voiture qui se gare (cycle `loader`). Jamais une roue qui tourne.
// AnimatedCar est aussi utilisée par le logo animé d'ouverture (Opening.tsx).

import { useEffect, useId, useMemo } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  type EasingFunction,
  type EasingFunctionFactory,
  type SharedValue,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, G, Mask, Path, Rect } from "react-native-svg";
import { brandArt } from "./brandArt";
import { type BrandTone, carTransform, oTransform, useTone } from "./Brand";
import { duration } from "./motionHooks";
import { useTheme } from "./theme";

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);

type Point = [number, number];
/** Les vitres de la voiture, en polygones : leur chemin est recalculé à chaque image de l'animation. */
const windowPolygons: Point[][] = brandArt.windowPath
  .split("Z")
  .filter((part) => part.trim())
  .map((part) =>
    part
      .trim()
      .replace(/^M/, "")
      .split("L")
      .map((pair): Point => {
        const [px = 0, py = 0] = pair.trim().split(/\s+/).map(Number);
        return [px, py];
      }),
  );

function windowPathAt(dx: number): string {
  return windowPolygons
    .map((poly) => `${poly.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px + dx} ${py}`).join(" ")}Z`)
    .join("");
}

/** Une courbe du fichier de marque (« .12,.75,.25,1 », « linear », « none ») en fonction d'accélération. */
export function curveOf(curve: string): EasingFunction | EasingFunctionFactory {
  if (curve === "linear" || curve === "none") return Easing.linear;
  const [a = 0, b = 0, c = 1, d = 1] = curve.split(",").map(Number);
  return Easing.bezier(a, b, c, d);
}

type Frame = { at: number; curve: string };

/**
 * Les segments d'une animation d'images clés : de chaque image à la suivante, `total` ms × l'écart en pour cent,
 * avec la courbe de l'image de départ. `valueOf` donne la valeur animée d'une image clé.
 */
export function keyframeSteps<F extends Frame>(frames: readonly F[], total: number, valueOf: (frame: F) => number) {
  return frames.slice(1).map((frame, i) => {
    const previous = frames[i];
    return withTiming(valueOf(frame), {
      duration: ((frame.at - (previous?.at ?? 0)) / 100) * total,
      easing: curveOf(previous?.curve ?? "linear"),
    });
  });
}

/**
 * La voiture moutarde, penchée de 10°, vitres découpées. `offset` est sa translation en unités du viewBox ;
 * `clipHole` : visible seulement dans l'ouverture de l'O (chargement), sinon libre (ouverture).
 */
export function AnimatedCar({ id, offset, clipHole }: { id: string; offset: SharedValue<number>; clipHole: boolean }) {
  const [thin, big] = brandArt.carRects;
  const bigProps = useAnimatedProps(() => ({ x: (big?.x ?? 0) + offset.value }));
  const thinProps = useAnimatedProps(() => ({ x: (thin?.x ?? 0) + offset.value }));
  const windowProps = useAnimatedProps(() => ({ d: windowPathAt(offset.value) }));
  const initial = useMemo(() => windowPathAt(0), []);
  const car = (
    <G mask={`url(#${id}c)`}>
      <G transform={carTransform} fill={brandArt.car}>
        {thin && (
          <AnimatedRect animatedProps={thinProps} x={thin.x} y={thin.y} width={thin.width} height={thin.height} rx={thin.rx} />
        )}
        {big && (
          <AnimatedRect animatedProps={bigProps} x={big.x} y={big.y} width={big.width} height={big.height} rx={big.rx} />
        )}
      </G>
    </G>
  );
  return (
    <>
      <Defs>
        <Mask id={`${id}c`} maskUnits="userSpaceOnUse" x={-50} y={-50} width={300} height={200}>
          <Rect x={-50} y={-50} width={300} height={200} fill="white" />
          <G transform={carTransform}>
            <AnimatedPath
              d={initial}
              animatedProps={windowProps}
              fill="black"
              stroke="black"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </G>
        </Mask>
        {clipHole && (
          <Mask id={`${id}h`} maskUnits="userSpaceOnUse" x={-50} y={-50} width={300} height={200}>
            <Path transform={oTransform} d={brandArt.hole} fill="white" />
          </Mask>
        )}
      </Defs>
      {clipHole ? <G mask={`url(#${id}h)`}>{car}</G> : car}
    </>
  );
}

/** Position de la voiture du chargement : les images clés du fichier `chargement`, en boucle de `loader`. */
function useLoaderOffset(playing: boolean) {
  const frames = brandArt.loaderKeyframes;
  const offset = useSharedValue(0);
  useEffect(() => {
    if (!playing) {
      cancelAnimation(offset);
      offset.value = 0;
      return;
    }
    offset.value = frames[0]?.x ?? 0;
    offset.value = withRepeat(withSequence(...keyframeSteps(frames, duration.loader, (f) => f.x)), -1);
    return () => cancelAnimation(offset);
  }, [playing, frames, offset]);
  return offset;
}

export type LoaderProps = {
  /** 72 px plein écran, 24 px dans un bouton. */
  size?: number;
  tone?: BrandTone;
};

/** L'indicateur de chargement du kit. Avec « réduction des animations » la voiture reste garée. */
export function Loader({ size = 24, tone = "auto" }: LoaderProps) {
  const version = useTone(tone);
  const { reducedMotion } = useTheme();
  const id = `d${useId().replaceAll(":", "")}`;
  const offset = useLoaderOffset(!reducedMotion);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={brandArt.viewBox.join(" ")}
      accessibilityRole="progressbar"
      accessibilityLabel="Chargement en cours"
      accessible
    >
      <Path transform={oTransform} d={brandArt.oPath} fill={brandArt.ink[version]} fillRule="evenodd" />
      <AnimatedCar id={id} offset={offset} clipHole />
    </Svg>
  );
}
