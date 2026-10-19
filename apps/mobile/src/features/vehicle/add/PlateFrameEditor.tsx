// Photo et cadres de plaque (lot 51, prototype `s-vadd` étape 5) : en mode Automatique, les cadres proposés par la
// détection sont montrés ; à la main, chaque cadre se déplace et s'agrandit par son coin (PanResponder, comme le curseur :
// même geste au téléphone et dans le navigateur ; position suivie par Reanimated pendant le geste, posée au lâcher).
import { Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { movePlateFrame, type PlateRect, resizePlateFrame } from "@orasso/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type ImageSourcePropType, PanResponder, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { EDITOR_MAX_HEIGHT, fitPhoto } from "./model";

const { space2 } = tokens.spacing;
const HANDLE = 22;

export function PlateFrameEditor({
  source,
  width,
  height,
  rects,
  editable,
  onChange,
  badge,
  testID,
}: {
  source: ImageSourcePropType | undefined;
  /** Taille de la photo en pixels : le cadre garde ses proportions. */
  width: number;
  height: number;
  rects: PlateRect[];
  /** À la main : les cadres se déplacent et s'agrandissent. */
  editable: boolean;
  onChange: (rects: PlateRect[]) => void;
  /** Pastille en haut à gauche (« 1 plaque floutée », « Place le cadre sur la plaque »). */
  badge?: ReactNode;
  testID?: string;
}) {
  // Relecture du lot 51 : la photo est montrée entière, à son vrai format (9:16, panorama…) ; le cadre est donc posé
  // sur l'image réelle, sans recadrage qui décalerait ses coordonnées.
  const [outer, setOuter] = useState(0);
  const box = fitPhoto(width, height, outer, EDITOR_MAX_HEIGHT);
  return (
    <View style={styles.outer} onLayout={(e) => setOuter(e.nativeEvent.layout.width)}>
      <View style={[styles.editor, { width: box.w, height: box.h }]} testID={testID}>
        <Photo source={source} style={StyleSheet.absoluteFill} />
        {box.w > 0
          ? rects.map((r, i) => (
              <FrameBox
                // biome-ignore lint/suspicious/noArrayIndexKey: les cadres n'ont pas d'identité propre, l'ordre suffit.
                key={i}
                rect={r}
                box={box}
                editable={editable}
                onCommit={(next) => onChange(rects.map((x, j) => (j === i ? next : x)))}
              />
            ))
          : null}
        {badge ? <View style={styles.badge}>{badge}</View> : null}
      </View>
    </View>
  );
}

function FrameBox({
  rect,
  box,
  editable,
  onCommit,
}: {
  rect: PlateRect;
  box: { w: number; h: number };
  editable: boolean;
  onCommit: (rect: PlateRect) => void;
}) {
  const { t } = useTheme();
  const x = useSharedValue(rect.x);
  const y = useSharedValue(rect.y);
  const w = useSharedValue(rect.w);
  const h = useSharedValue(rect.h);
  const bw = useSharedValue(box.w);
  const bh = useSharedValue(box.h);
  useEffect(() => {
    x.value = rect.x;
    y.value = rect.y;
    w.value = rect.w;
    h.value = rect.h;
  }, [rect, x, y, w, h]);
  useEffect(() => {
    bw.value = box.w;
    bh.value = box.h;
  }, [box, bw, bh]);

  // Les gestes lisent toujours les dernières valeurs (le PanResponder est créé une fois).
  const latest = useRef({ rect, box, editable, onCommit });
  latest.current = { rect, box, editable, onCommit };
  const start = useRef(rect);
  const current = useRef(rect);

  const responder = (kind: "move" | "resize") =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.editable,
      onStartShouldSetPanResponderCapture: () => latest.current.editable,
      onMoveShouldSetPanResponder: () => latest.current.editable,
      onMoveShouldSetPanResponderCapture: () => latest.current.editable,
      // Le cadre garde le geste : la page ne défile pas pendant qu'on le place.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start.current = latest.current.rect;
        current.current = latest.current.rect;
      },
      onPanResponderMove: (_e, g) => {
        const { w: W, h: H } = latest.current.box;
        if (!W || !H) return;
        const next =
          kind === "move"
            ? movePlateFrame(start.current, g.dx / W, g.dy / H)
            : resizePlateFrame(start.current, g.dx / W, g.dy / H);
        current.current = next;
        x.value = next.x;
        y.value = next.y;
        w.value = next.w;
        h.value = next.h;
      },
      onPanResponderRelease: () => latest.current.onCommit(current.current),
      onPanResponderTerminate: () => latest.current.onCommit(current.current),
    });
  const move = useRef(responder("move")).current;
  const resize = useRef(responder("resize")).current;

  const style = useAnimatedStyle(() => ({
    left: x.value * bw.value,
    top: y.value * bh.value,
    width: w.value * bw.value,
    height: h.value * bh.value,
  }));

  return (
    <Animated.View
      {...move.panHandlers}
      accessibilityLabel="Cadre de la plaque"
      testID="plate-frame"
      style={[
        styles.frame,
        { borderColor: t.color.accent, backgroundColor: t.color.scrim },
        editable ? styles.grab : null,
        style,
      ]}
    >
      {editable ? (
        <View
          {...resize.panHandlers}
          accessibilityLabel="Agrandir le cadre"
          testID="plate-frame-handle"
          style={[styles.handle, { backgroundColor: t.color.accent }]}
        />
      ) : null}
    </Animated.View>
  );
}

/** Pastille posée sur la photo : texte crème sur voile sombre (lisible sur toute photo, pas de contour sur le texte). */
export function PhotoBadge({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: accent ? t.color.accent : t.color.scrim }]}>
      <Text variant="label" color={accent ? t.color.accentInk : t.color.nightInk}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { width: "100%", alignItems: "center" },
  editor: { borderRadius: tokens.radius.radiusMd, overflow: "hidden" },
  frame: { position: "absolute", borderWidth: 2, borderRadius: 6 },
  grab: { cursor: "grab" } as object,
  handle: {
    position: "absolute",
    right: -HANDLE / 2,
    bottom: -HANDLE / 2,
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
  },
  badge: { position: "absolute", left: space2, top: space2 },
  pill: { paddingHorizontal: space2, paddingVertical: 4, borderRadius: tokens.radius.radiusPill },
});
