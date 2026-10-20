// Un tampon du passeport (lot 50) : `react-native-svg`, dessiné par `stampModel` (forme, texte, usure déterministes).
// Encre = jeton `stamp-ink-<département>` du thème ; dorure (dégradé or) pour les rares ; angle, pression, bavure et
// éclats de papier tirés de `seed`. `animateIn` : le tampon se pose (échelle 1,5 → 1 en 320 ms, fondu de 120 ms si les
// animations sont réduites).

import { useTheme } from "@orasso/design-system/native";
import type { PassportStamp } from "@orasso/shared";
import { useEffect, useId } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop, Text as SvgText, TextPath } from "react-native-svg";

import {
  inkTokenKey,
  ringFontSize,
  STAMP_BOX,
  STAMP_GOLD,
  STAMP_RING_PATH,
  silhouetteOf,
  stampLook,
  stampShapeArt,
  stampText,
} from "./stampModel";

export function Stamp({
  stamp,
  size,
  paper,
  animateIn,
  testID,
}: {
  stamp: PassportStamp;
  size: number;
  /** Couleur de la page sous le tampon (les éclats d'usure la reprennent). */
  paper?: string;
  animateIn?: boolean;
  testID?: string;
}) {
  const { t, reducedMotion } = useTheme();
  const id = `st${useId().replaceAll(":", "")}`;
  const art = stampShapeArt(silhouetteOf(stamp));
  const look = stampLook(stamp.seed);
  const text = stampText(stamp);
  const ink = stamp.rare ? `url(#${id}g)` : t.color[inkTokenKey(stamp.ink)];
  const page = paper ?? t.color.surface;

  const progress = useSharedValue(animateIn && !reducedMotion ? 0 : 1);
  const fade = useSharedValue(animateIn && reducedMotion ? 0 : 1);
  useEffect(() => {
    if (!animateIn) return;
    if (reducedMotion) {
      fade.value = withTiming(1, { duration: 120 });
      return;
    }
    progress.value = withTiming(1, { duration: 320 });
  }, [animateIn, reducedMotion, progress, fade]);
  const animated = useAnimatedStyle(() => {
    "worklet";
    return {
      opacity: fade.value * Math.min(1, progress.value * 1.6),
      transform: [{ scale: 1.5 - 0.5 * progress.value }],
    };
  });

  const drawing = (
    <>
      {art.strokes.map((s) => (
        <Path key={s.d} d={s.d} fill="none" stroke={ink} strokeWidth={s.width} strokeLinejoin="round" />
      ))}
      {art.fills.map((d) => (
        <Path key={d} d={d} fill={ink} />
      ))}
      {art.ring ? (
        <SvgText fill={ink} fontFamily="Archivo-Narrow-Bold" fontSize={ringFontSize(text.ring)} letterSpacing={1.6}>
          <TextPath href={`#${id}p`} startOffset="2%">
            {text.ring}
          </TextPath>
        </SvgText>
      ) : (
        <SvgText
          x={60}
          y={art.titleY}
          textAnchor="middle"
          fill={ink}
          fontFamily="Archivo-Narrow-Bold"
          fontSize={8.5}
          letterSpacing={1}
        >
          {text.short}
        </SvgText>
      )}
      <SvgText
        x={60}
        y={art.dateY}
        textAnchor="middle"
        fill={ink}
        fontFamily="Archivo-Narrow-Bold"
        fontSize={art.dateSize}
      >
        {text.date}
      </SvgText>
      <SvgText
        x={60}
        y={art.yearY}
        textAnchor="middle"
        fill={ink}
        fontFamily="Archivo-Narrow-Bold"
        fontSize={8}
        letterSpacing={1.5}
      >
        {text.year}
      </SvgText>
    </>
  );

  return (
    <Animated.View
      testID={testID}
      style={[{ width: size, height: size }, animated]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Tampon ${stamp.event.title}, ${text.date}`}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${STAMP_BOX} ${STAMP_BOX}`} style={{ overflow: "visible" }}>
        <Defs>
          <LinearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={STAMP_GOLD.from} />
            <Stop offset="0.5" stopColor={STAMP_GOLD.mid} />
            <Stop offset="1" stopColor={STAMP_GOLD.to} />
          </LinearGradient>
          <Path id={`${id}p`} d={STAMP_RING_PATH} />
        </Defs>
        <G transform={`rotate(${look.angle} 60 60)`} opacity={look.opacity}>
          <G
            opacity={look.bleed.alpha}
            transform={`translate(${look.bleed.x} ${look.bleed.y}) translate(60 60) scale(${look.bleed.scale}) translate(-60 -60)`}
          >
            {drawing}
          </G>
          {drawing}
          {look.specks.map((s) => (
            <Circle key={`${s.x}-${s.y}`} cx={s.x} cy={s.y} r={s.r} fill={page} opacity={0.85} />
          ))}
        </G>
      </Svg>
    </Animated.View>
  );
}
