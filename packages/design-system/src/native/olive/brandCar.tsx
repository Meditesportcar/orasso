// La voiture du logo, de profil, penchée de 10°, qui se gare dans le O (kit d'identité). Déplacée de Loader.tsx au lot 39
// (Loader.tsx la ré-exporte) : le O vivant et l'ancien logo animé d'ouverture s'en servent.

import { useMemo } from "react";
import Animated, {
  Easing,
  type EasingFunction,
  type EasingFunctionFactory,
  type SharedValue,
  useAnimatedProps,
  withTiming,
} from "react-native-reanimated";
import { Defs, G, Mask, Path, Rect } from "react-native-svg";
import { carTransform, oTransform } from "../Brand";
import { brandArt } from "../brandArt";

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

// Appelée par useAnimatedProps sur le fil graphique : doit être un worklet (sinon plantage natif au démarrage).
function windowPathAt(dx: number): string {
  "worklet";
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
 * avec la courbe de l'image de départ. `pick` donne la valeur animée d'une image clé.
 */
export function keyframeSteps<F extends Frame>(frames: readonly F[], total: number, pick: (frame: F) => number) {
  return frames.slice(1).map((frame, i) => {
    const previous = frames[i];
    return withTiming(pick(frame), {
      duration: ((frame.at - (previous?.at ?? 0)) / 100) * total,
      easing: curveOf(previous?.curve ?? "linear"),
    });
  });
}

/** Translation de la voiture hors du O, à gauche (unités du viewBox) : elle attend dehors ou arrive pour se garer. */
export const CAR_OUT_LEFT = -120;
/** Translation de la voiture sortie du O par la droite (onglet central quitté). */
export const CAR_OUT_RIGHT = 130;

/**
 * La voiture moutarde, penchée de 10°, vitres découpées. `offset` est sa translation en unités du viewBox ;
 * `clipHole` : visible seulement dans l'ouverture de l'O (chargement), sinon libre (ouverture, état vide).
 */
export function AnimatedCar({ id, offset, clipHole }: { id: string; offset: SharedValue<number>; clipHole: boolean }) {
  const [thin, big] = brandArt.carRects;
  const bigProps = useAnimatedProps(() => {
    "worklet";
    return { x: (big?.x ?? 0) + offset.value };
  });
  const thinProps = useAnimatedProps(() => {
    "worklet";
    return { x: (thin?.x ?? 0) + offset.value };
  });
  const windowProps = useAnimatedProps(() => {
    "worklet";
    return { d: windowPathAt(offset.value) };
  });
  const initial = useMemo(() => windowPathAt(0), []);
  const car = (
    <G mask={`url(#${id}c)`}>
      <G transform={carTransform} fill={brandArt.car}>
        {thin && (
          <AnimatedRect
            animatedProps={thinProps}
            x={thin.x}
            y={thin.y}
            width={thin.width}
            height={thin.height}
            rx={thin.rx}
          />
        )}
        {big && (
          <AnimatedRect
            animatedProps={bigProps}
            x={big.x}
            y={big.y}
            width={big.width}
            height={big.height}
            rx={big.rx}
          />
        )}
      </G>
    </G>
  );
  return (
    <>
      <Defs>
        <Mask id={`${id}c`} maskUnits="userSpaceOnUse" x={-250} y={-50} width={500} height={200}>
          <Rect x={-250} y={-50} width={500} height={200} fill="white" />
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
