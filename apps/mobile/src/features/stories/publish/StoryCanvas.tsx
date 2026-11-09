// Le canevas 9:16 d'une story (lot R7f3, maquettes R7.22 et R7.8) : la photo posée au centre sur un fond = la même image
// floutée et assombrie (`blurRadius`), cadrée par `frame` (zoom relatif à « tenir en entier », décalage en pixels du canevas
// 1080 × 1920) : c'est le rendu que le serveur refait avec sharp, l'aperçu est fidèle. `motion` : les valeurs partagées que
// l'écran « Ajuster » pilote pendant un geste (le fil UI suit sans repasser par React) ; sans `motion`, le cadrage de `frame`.
// `plateRects` : la plaque floutée est **simulée** par le cadre plein du kit (aucun floutage local : le vrai flou est celui
// du serveur). Les rectangles sont dans la photo d'origine ; `mapRects` les place dans le canevas.
import { tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { type Frame, mapRect, type PlateRect, STORY_H, STORY_W } from "@orasso/shared";
import { type ReactNode, useEffect } from "react";
import { Image, type ImageStyle, Platform, StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

export type StoryMotion = { scale: SharedValue<number>; x: SharedValue<number>; y: SharedValue<number> };

/** Un fond flou : `blurRadius` sur téléphone, le filtre CSS dans le navigateur (où `blurRadius` n'existe pas). */
const WEB_BLUR = Platform.OS === "web" ? ({ filter: "blur(28px)" } as unknown as ImageStyle) : null;

export function useStoryMotion(frame: Frame): StoryMotion {
  const scale = useSharedValue(frame.scale);
  const x = useSharedValue(frame.offsetX);
  const y = useSharedValue(frame.offsetY);
  return { scale, x, y };
}

export function StoryCanvas({
  uri,
  width,
  height,
  frame,
  motion,
  viewWidth,
  plateRects,
  children,
  rounded = true,
  testID,
}: {
  uri: string;
  /** La photo d'origine, en pixels. */
  width: number;
  height: number;
  frame: Frame;
  motion?: StoryMotion;
  /** Largeur du canevas à l'écran ; la hauteur suit (9:16). */
  viewWidth: number;
  plateRects?: readonly PlateRect[];
  /** Posé sur le canevas : pastilles, légende, autocollants. */
  children?: ReactNode;
  rounded?: boolean;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const own = useStoryMotion(frame);
  const m = motion ?? own;
  // Sans `motion`, le cadrage reçu est posé tel quel (aperçus) ; avec `motion`, c'est l'écran qui le pilote.
  useEffect(() => {
    if (motion) return;
    own.scale.value = frame.scale;
    own.x.value = frame.offsetX;
    own.y.value = frame.offsetY;
  }, [motion, own, frame.scale, frame.offsetX, frame.offsetY]);

  const viewHeight = Math.round((viewWidth * STORY_H) / STORY_W);
  const k = viewWidth / STORY_W;
  // La photo entière (zoom 1) tient dans le canevas : c'est son rectangle de base, au centre.
  const base = Math.min(viewWidth / width, viewHeight / height);
  const baseW = width * base;
  const baseH = height * base;

  const { x: mx, y: my, scale: ms } = m;
  const front = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ translateX: mx.value * k }, { translateY: my.value * k }, { scale: ms.value }] };
  });

  return (
    <View
      style={[
        styles.canvas,
        { width: viewWidth, height: viewHeight, backgroundColor: c.night },
        rounded && { borderRadius: tokens.radius.radiusLg },
      ]}
      testID={testID}
    >
      <Image
        source={{ uri }}
        blurRadius={40}
        resizeMode="cover"
        style={[StyleSheet.absoluteFill, styles.back, WEB_BLUR]}
        accessibilityIgnoresInvertColors
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(c.night, 0.2) }]} />
      <Animated.View
        style={[
          {
            position: "absolute",
            width: baseW,
            height: baseH,
            left: (viewWidth - baseW) / 2,
            top: (viewHeight - baseH) / 2,
          },
          front,
        ]}
      >
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
      </Animated.View>
      {plateRects?.map((r, i) => {
        // Le cadre est donné dans la photo d'origine : on le place dans le canevas avec le même cadrage que le serveur.
        const box = mapRect(r, frame, { width, height });
        return (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: les cadres n'ont pas d'identifiant ; l'ordre est stable.
            key={i}
            pointerEvents="none"
            testID="story-plate-mask"
            style={{
              position: "absolute",
              left: box.x * viewWidth,
              top: box.y * viewHeight,
              width: box.w * viewWidth,
              height: box.h * viewHeight,
              backgroundColor: c.night,
              transform: box.angle ? [{ rotate: `${box.angle}deg` }] : undefined,
            }}
          />
        );
      })}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { overflow: "hidden" },
  back: { transform: [{ scale: 1.12 }] },
});
