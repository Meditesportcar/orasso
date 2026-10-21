// Photo et cadres de plaque (lot 51, prototype `s-vadd` étape 5) : en mode Automatique, les cadres proposés par la
// détection sont montrés ; à la main, chaque cadre se déplace et s'agrandit par son coin (PanResponder, comme le curseur :
// même geste au téléphone et dans le navigateur ; position suivie par Reanimated pendant le geste, posée au lâcher).
// Lot 59c : le cadre se tourne par une poignée au-dessus de son bord haut (plaque penchée) ; un cadre détecté arrive
// déjà orienté (coins de ML Kit).
import { Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  dragRotatePlateFrame,
  vehicleWizardLabels as L,
  movePlateFrame,
  PLATE_ROTATE_HANDLE_OFFSET,
  type PlateRect,
  resizeOrientedPlateFrame,
} from "@orasso/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type ImageSourcePropType, PanResponder, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { EDITOR_MAX_HEIGHT, fitPhoto } from "./model";
import { capturesGesture, PLATE_HANDLE, type PlateGesture, rotateHandleBelow } from "./plateGestures";

const { space2 } = tokens.spacing;
const HANDLE = PLATE_HANDLE;
/** Cible tactile des poignées : 22 px visibles, 46 px au doigt. */
const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

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
  const { t } = useTheme();
  const [outer, setOuter] = useState(0);
  const box = fitPhoto(width, height, outer, EDITOR_MAX_HEIGHT);
  return (
    <View style={styles.outer} onLayout={(e) => setOuter(e.nativeEvent.layout.width)}>
      <View style={[styles.editor, { width: box.w, height: box.h }]} testID={testID}>
        {/* Lot 59c, tour 2 : l'arrondi coupe la photo seule ; les poignées des cadres peuvent dépasser. */}
        <View style={styles.clip}>
          <Photo source={source} style={StyleSheet.absoluteFill} />
        </View>
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
      {editable && rects.length > 0 ? (
        <Text variant="caption" color={t.color.inkMuted} style={styles.hint}>
          {L.frameHint}
        </Text>
      ) : null}
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
  const angle = useSharedValue(rect.angle ?? 0);
  const bw = useSharedValue(box.w);
  const bh = useSharedValue(box.h);
  useEffect(() => {
    x.value = rect.x;
    y.value = rect.y;
    w.value = rect.w;
    h.value = rect.h;
    angle.value = rect.angle ?? 0;
  }, [rect, x, y, w, h, angle]);
  useEffect(() => {
    bw.value = box.w;
    bh.value = box.h;
  }, [box, bw, bh]);

  // Les gestes lisent toujours les dernières valeurs (le PanResponder est créé une fois).
  const below = rotateHandleBelow(rect, box.h);
  const latest = useRef({ rect, box, editable, onCommit, below });
  latest.current = { rect, box, editable, onCommit, below };
  const start = useRef(rect);
  const current = useRef(rect);

  const responder = (kind: PlateGesture) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.editable,
      onMoveShouldSetPanResponder: () => latest.current.editable,
      // Lot 59c, tour 2 : seules les poignées capturent (sinon le cadre, leur parent, leur prenait le doigt).
      onStartShouldSetPanResponderCapture: () => capturesGesture(kind) && latest.current.editable,
      onMoveShouldSetPanResponderCapture: () => capturesGesture(kind) && latest.current.editable,
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
            : kind === "resize"
              ? resizeOrientedPlateFrame(start.current, g.dx, g.dy, W, H)
              : dragRotatePlateFrame(start.current, g.dx, g.dy, H, PLATE_ROTATE_HANDLE_OFFSET, latest.current.below);
        current.current = next;
        x.value = next.x;
        y.value = next.y;
        w.value = next.w;
        h.value = next.h;
        angle.value = next.angle ?? 0;
      },
      onPanResponderRelease: () => latest.current.onCommit(current.current),
      onPanResponderTerminate: () => latest.current.onCommit(current.current),
    });
  const move = useRef(responder("move")).current;
  const resize = useRef(responder("resize")).current;
  const rotate = useRef(responder("rotate")).current;

  const style = useAnimatedStyle(() => ({
    left: x.value * bw.value,
    top: y.value * bh.value,
    width: w.value * bw.value,
    height: h.value * bh.value,
    transform: [{ rotate: `${angle.value}deg` }],
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
        <>
          <View
            {...resize.panHandlers}
            accessibilityLabel={L.resizeFrame}
            testID="plate-frame-handle"
            hitSlop={HIT}
            style={[styles.handle, { backgroundColor: t.color.accent }]}
          />
          <View
            pointerEvents="none"
            style={[styles.stem, below ? styles.stemBelow : null, { backgroundColor: t.color.accent }]}
          />
          <View
            {...rotate.panHandlers}
            accessibilityLabel={L.rotateFrame}
            testID="plate-frame-rotate"
            hitSlop={HIT}
            style={[styles.handle, below ? styles.rotateBelow : styles.rotate, { backgroundColor: t.color.accent }]}
          />
        </>
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
  editor: { borderRadius: tokens.radius.radiusMd },
  clip: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: tokens.radius.radiusMd,
    overflow: "hidden",
  },
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
  // Poignée de rotation : centrée au-dessus du bord haut, reliée au cadre par une tige.
  rotate: {
    right: undefined,
    bottom: undefined,
    left: "50%",
    marginLeft: -HANDLE / 2,
    top: -PLATE_ROTATE_HANDLE_OFFSET - HANDLE / 2,
  },
  stem: {
    position: "absolute",
    left: "50%",
    marginLeft: -1,
    width: 2,
    top: -PLATE_ROTATE_HANDLE_OFFSET,
    height: PLATE_ROTATE_HANDLE_OFFSET,
  },
  // Cadre collé en haut de la photo : poignée et tige sous le bord bas (lot 59c, tour 2).
  rotateBelow: {
    right: undefined,
    bottom: -PLATE_ROTATE_HANDLE_OFFSET - HANDLE / 2,
    left: "50%",
    marginLeft: -HANDLE / 2,
  },
  stemBelow: { top: undefined, bottom: -PLATE_ROTATE_HANDLE_OFFSET },
  badge: { position: "absolute", left: space2, top: space2 },
  hint: { marginTop: space2, alignSelf: "stretch" },
  pill: { paddingHorizontal: space2, paddingVertical: 4, borderRadius: tokens.radius.radiusPill },
});
