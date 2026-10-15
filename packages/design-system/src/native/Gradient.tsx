// Un dégradé CSS des jetons, redessiné avec react-native-svg (fonds, barres). Voir gradient.ts pour la lecture.

import { useId, useMemo, useState } from "react";
import { type LayoutChangeEvent, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";
import {
  type GradientStop,
  linearLine,
  type ParsedGradient,
  parseGradient,
  radialGeometry,
  repeatingBands,
  rgbOf,
} from "./gradientCss";

/** Les arrêts d'un dégradé SVG (un tableau : react-native-svg attend des éléments enfants directs). */
function stopElements(stops: GradientStop[], length: number) {
  return stops.map((stop, i) => {
    const offset = stop.unit === "px" ? stop.at / length : stop.at;
    return (
      <Stop
        // biome-ignore lint/suspicious/noArrayIndexKey: les arrêts sont fixes et ordonnés
        key={i}
        offset={Math.min(1, Math.max(0, offset))}
        stopColor={rgbOf(stop.color)}
        stopOpacity={stop.color.a}
      />
    );
  });
}

/** Les arrêts d'un dégradé répété ne s'écrivent pas en SVG : voir repeatingBands. */
function Linear({
  gradient,
  width,
  height,
  id,
}: {
  gradient: Extract<ParsedGradient, { kind: "linear" }>;
  width: number;
  height: number;
  id: string;
}) {
  if (gradient.repeating) {
    return repeatingBands(gradient, width, height).map((band, i) => (
      <Polygon
        // biome-ignore lint/suspicious/noArrayIndexKey: les bandes sont recalculées avec la taille
        key={i}
        points={band.points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill={rgbOf(band.color)}
        fillOpacity={band.color.a}
      />
    ));
  }
  const line = linearLine(gradient.angle, width, height);
  return (
    <>
      <Defs>
        <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}>
          {stopElements(gradient.stops, line.length)}
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
    </>
  );
}

/**
 * Dégradé radial elliptique. Le DOM SVG n'a pas de rx/ry sur radialGradient (le web ne verrait qu'un cercle) :
 * on trace un cercle de rayon rx, écrasé verticalement par gradientTransform, en pixels.
 */
function Radial({
  gradient,
  width,
  height,
  id,
}: {
  gradient: Extract<ParsedGradient, { kind: "radial" }>;
  width: number;
  height: number;
  id: string;
}) {
  const { cx, cy, r, transform } = radialGeometry(gradient, width, height);
  return (
    <>
      <Defs>
        <RadialGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          cx={cx}
          cy={cy}
          r={r}
          fx={cx}
          fy={cy}
          gradientTransform={transform}
        >
          {stopElements(gradient.stops, 1)}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
    </>
  );
}

/**
 * Un rectangle rempli d'un dégradé linéaire, à poser dans un <Svg> existant (avec un clipPath, par exemple pour
 * un placeholder de photo coupé à 10°). Pour un dégradé qui remplit un conteneur, voir GradientFill.
 */
export function GradientRect({
  css,
  width,
  height,
  id,
  clipPath,
}: {
  css: string;
  width: number;
  height: number;
  id: string;
  clipPath?: string;
}) {
  const gradient = useMemo(() => parseGradient(css), [css]);
  if (gradient.kind !== "linear") return null;
  const line = linearLine(gradient.angle, width, height);
  return (
    <>
      <Defs>
        <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}>
          {stopElements(gradient.stops, line.length)}
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} clipPath={clipPath} />
    </>
  );
}

export type GradientFillProps = {
  /** Dégradé CSS d'un jeton (groundFx.*, barFx.*). */
  css: string;
  style?: ViewStyle;
};

/**
 * Remplit son conteneur avec un dégradé CSS des jetons. Il faut la taille de la boîte (angle d'un dégradé
 * linéaire, ellipse d'un radial) : le dégradé apparaît après la mesure.
 */
export function GradientFill({ css, style }: GradientFillProps) {
  const id = `g${useId().replaceAll(":", "")}`;
  const gradient = useMemo(() => parseGradient(css), [css]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} onLayout={onLayout}>
      {size && size.width > 0 && size.height > 0 && (
        <Svg width={size.width} height={size.height}>
          {gradient.kind === "radial" ? (
            <Radial gradient={gradient} width={size.width} height={size.height} id={id} />
          ) : (
            <Linear gradient={gradient} width={size.width} height={size.height} id={id} />
          )}
        </Svg>
      )}
    </View>
  );
}
