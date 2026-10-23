// Photo et cadres de plaque (lot 51, prototype `s-vadd` étape 5) : en mode Automatique, les cadres proposés par la
// détection sont montrés ; à la main, chaque cadre se déplace et s'agrandit par son coin (PanResponder, comme le curseur :
// même geste au téléphone et dans le navigateur ; position suivie par Reanimated pendant le geste, posée au lâcher).
// Lot 59c : le cadre se tourne par une poignée au-dessus de son bord haut (plaque penchée) ; un cadre détecté arrive
// déjà orienté (coins de ML Kit).
// Lot M1 (maquettes 1.3 et 1.4) : `mask="black"` montre le cadre en noir plein (ce qu'on voit est ce qui sera publié,
// le vrai flou reste celui du serveur) ; `loupe` : bulle ronde ×2,5 au-dessus du doigt pendant le déplacement du cadre
// et l'agrandissement par son coin (pas pendant la rotation ni à deux doigts) ; deux doigts n'importe où sur la photo :
// pincer agrandit, tourner fait pivoter ; poignées de 48 px au doigt, poignée de rotation plus loin du cadre ;
// `children` : ce qui se pose sur la photo (outils, message, confirmation).
import { Icon, Photo, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import {
  dragRotatePlateFrame,
  vehicleWizardLabels as L,
  movePlateFrame,
  PLATE_ROTATE_HANDLE_OFFSET,
  type PlateRect,
  resizeOrientedPlateFrame,
} from "@orasso/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  Image,
  type ImageSourcePropType,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { EDITOR_MAX_HEIGHT, fitPhoto } from "./model";
import {
  angleDelta,
  capturesGesture,
  LOUPE_SIZE,
  LOUPE_ZOOM,
  loupePlace,
  PLATE_HANDLE,
  PLATE_HANDLE_HIT,
  PLATE_ROTATE_OFFSET_FAR,
  type PlateGesture,
  pinchPlateFrame,
  rotateHandleBelow,
  twoFingers,
} from "./plateGestures";

const { space2 } = tokens.spacing;
const HANDLE = PLATE_HANDLE;

/** Ce que la loupe suit : le doigt (px de la photo) et le cadre en cours de geste (normalisé). */
type Probe = {
  on: SharedValue<number>;
  px: SharedValue<number>;
  py: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  w: SharedValue<number>;
  h: SharedValue<number>;
  a: SharedValue<number>;
};

export function PlateFrameEditor({
  source,
  width,
  height,
  rects,
  editable,
  onChange,
  badge,
  testID,
  mask = "scrim",
  loupe = false,
  children,
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
  /** Lot M1 : `black` = aperçu masqué en noir plein (étape Plaque) ; `scrim` = voile (autres photos). */
  mask?: "black" | "scrim";
  /** Lot M1 : loupe, gestes à deux doigts, grandes poignées. */
  loupe?: boolean;
  /** Posé sur la photo (outils, message, confirmation). */
  children?: ReactNode;
}) {
  // Relecture du lot 51 : la photo est montrée entière, à son vrai format (9:16, panorama…) ; le cadre est donc posé
  // sur l'image réelle, sans recadrage qui décalerait ses coordonnées.
  const { t } = useTheme();
  const [outer, setOuter] = useState(0);
  const box = fitPhoto(width, height, outer, EDITOR_MAX_HEIGHT);
  const probe: Probe = {
    on: useSharedValue(0),
    px: useSharedValue(0),
    py: useSharedValue(0),
    x: useSharedValue(0),
    y: useSharedValue(0),
    w: useSharedValue(0),
    h: useSharedValue(0),
    a: useSharedValue(0),
  };
  // Deux doigts sur la photo : le dernier cadre touché (sinon le dernier posé) suit le pincement et la rotation.
  const active = useRef(Math.max(0, rects.length - 1));
  const latest = useRef({ rects, onChange, editable, loupe });
  latest.current = { rects, onChange, editable, loupe };
  const pinch = useRef<{ start: PlateRect; distance: number; angle: number; index: number } | null>(null);
  const background = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => twoOn(e) && canPinch(),
      onMoveShouldSetPanResponder: (e) => twoOn(e) && canPinch(),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (e) => {
        const [a, b] = e.nativeEvent.touches ?? [];
        if (!a || !b) return;
        const now = twoFingers(a, b);
        const { rects: all, onChange: commit } = latest.current;
        if (!pinch.current) {
          const index = Math.min(active.current, all.length - 1);
          const start = all[index];
          if (!start) return;
          pinch.current = { start, distance: now.distance, angle: now.angle, index };
          return;
        }
        const p = pinch.current;
        const next = pinchPlateFrame(p.start, now.distance / Math.max(1, p.distance), angleDelta(p.angle, now.angle));
        commit(all.map((r, i) => (i === p.index ? next : r)));
      },
      onPanResponderRelease: () => {
        pinch.current = null;
      },
      onPanResponderTerminate: () => {
        pinch.current = null;
      },
    }),
  ).current;
  function canPinch() {
    return latest.current.loupe && latest.current.editable && latest.current.rects.length > 0;
  }
  return (
    <View style={styles.outer} onLayout={(e) => setOuter(e.nativeEvent.layout.width)}>
      <View style={[styles.editor, { width: box.w, height: box.h }]} testID={testID} {...background.panHandlers}>
        {/* Lot 59c, tour 2 : la photo coupe ce qui la dépasse (cadre tourné contre un bord) ; la poignée de rotation
            passe sous un cadre collé en haut (`rotateHandleBelow`) pour rester dans la photo et se toucher. */}
        <Photo source={source} style={StyleSheet.absoluteFill} />
        {box.w > 0
          ? rects.map((r, i) => (
              <FrameBox
                // biome-ignore lint/suspicious/noArrayIndexKey: les cadres n'ont pas d'identité propre, l'ordre suffit.
                key={i}
                rect={r}
                box={box}
                editable={editable}
                mask={mask}
                big={loupe}
                probe={loupe ? probe : null}
                onTouch={() => {
                  active.current = i;
                }}
                onCommit={(next) => onChange(rects.map((x, j) => (j === i ? next : x)))}
              />
            ))
          : null}
        {badge ? <View style={styles.badge}>{badge}</View> : null}
        {loupe && box.w > 0 ? <Loupe source={source} box={box} probe={probe} /> : null}
        {children}
      </View>
      {editable && rects.length > 0 && !loupe ? (
        <Text variant="caption" color={t.color.inkMuted} style={styles.hint}>
          {L.frameHint}
        </Text>
      ) : null}
    </View>
  );
}

const twoOn = (e: GestureResponderEvent) => (e.nativeEvent.touches?.length ?? 0) >= 2;

function FrameBox({
  rect,
  box,
  editable,
  mask,
  big,
  probe,
  onTouch,
  onCommit,
}: {
  rect: PlateRect;
  box: { w: number; h: number };
  editable: boolean;
  mask: "black" | "scrim";
  big: boolean;
  probe: Probe | null;
  onTouch: () => void;
  onCommit: (rect: PlateRect) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const x = useSharedValue(rect.x);
  const y = useSharedValue(rect.y);
  const w = useSharedValue(rect.w);
  const h = useSharedValue(rect.h);
  const angle = useSharedValue(rect.angle ?? 0);
  const bw = useSharedValue(box.w);
  const bh = useSharedValue(box.h);
  const dragging = useSharedValue(0);
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

  const offset = big ? PLATE_ROTATE_OFFSET_FAR : PLATE_ROTATE_HANDLE_OFFSET;
  const hit = big ? PLATE_HANDLE_HIT : 12;
  const slop = { top: hit, bottom: hit, left: hit, right: hit };
  // Les gestes lisent toujours les dernières valeurs (le PanResponder est créé une fois).
  const below = rotateHandleBelow(rect, box.h, offset);
  const latest = useRef({ rect, box, editable, onCommit, below, offset, probe, onTouch });
  latest.current = { rect, box, editable, onCommit, below, offset, probe, onTouch };
  const start = useRef(rect);
  const current = useRef(rect);
  const finger = useRef({ x: 0, y: 0 });
  const two = useRef<{ distance: number; angle: number } | null>(null);

  const set = (next: PlateRect) => {
    current.current = next;
    x.value = next.x;
    y.value = next.y;
    w.value = next.w;
    h.value = next.h;
    angle.value = next.angle ?? 0;
  };
  const responder = (kind: PlateGesture) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.editable,
      onMoveShouldSetPanResponder: () => latest.current.editable,
      // Lot 59c, tour 2 : seules les poignées capturent (sinon le cadre, leur parent, leur prenait le doigt).
      onStartShouldSetPanResponderCapture: () => capturesGesture(kind) && latest.current.editable,
      onMoveShouldSetPanResponderCapture: () => capturesGesture(kind) && latest.current.editable,
      // Le cadre garde le geste : la page ne défile pas pendant qu'on le place.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        latest.current.onTouch();
        start.current = latest.current.rect;
        current.current = latest.current.rect;
        two.current = null;
        dragging.value = 1;
        const { w: W, h: H } = latest.current.box;
        const r = latest.current.rect;
        // Le point sous le doigt, dans la photo : là où il a touché le cadre, ou le coin qu'il tient.
        finger.current =
          kind === "resize"
            ? { x: (r.x + r.w) * W, y: (r.y + r.h) * H }
            : { x: r.x * W + e.nativeEvent.locationX, y: r.y * H + e.nativeEvent.locationY };
      },
      onPanResponderMove: (e, g) => {
        const { w: W, h: H } = latest.current.box;
        if (!W || !H) return;
        const p = latest.current.probe;
        const [a, b] = e.nativeEvent.touches ?? [];
        if (kind === "move" && a && b && p) {
          // Deux doigts posés sur le cadre : pincer et tourner, sans loupe.
          const now = twoFingers(a, b);
          if (!two.current) {
            two.current = now;
            start.current = current.current;
          }
          p.on.value = 0;
          set(
            pinchPlateFrame(
              start.current,
              now.distance / Math.max(1, two.current.distance),
              angleDelta(two.current.angle, now.angle),
            ),
          );
          return;
        }
        const next =
          kind === "move"
            ? movePlateFrame(start.current, g.dx / W, g.dy / H)
            : kind === "resize"
              ? resizeOrientedPlateFrame(start.current, g.dx, g.dy, W, H)
              : dragRotatePlateFrame(start.current, g.dx, g.dy, H, latest.current.offset, latest.current.below);
        set(next);
        if (p) {
          // Loupe pour le déplacement et l'agrandissement par le coin, pas pour la rotation (décision de Damien).
          p.on.value = kind === "rotate" ? 0 : 1;
          p.px.value = finger.current.x + g.dx;
          p.py.value = finger.current.y + g.dy;
          p.x.value = next.x;
          p.y.value = next.y;
          p.w.value = next.w;
          p.h.value = next.h;
          p.a.value = next.angle ?? 0;
        }
      },
      onPanResponderRelease: () => {
        dragging.value = 0;
        if (latest.current.probe) latest.current.probe.on.value = 0;
        latest.current.onCommit(current.current);
      },
      onPanResponderTerminate: () => {
        dragging.value = 0;
        if (latest.current.probe) latest.current.probe.on.value = 0;
        latest.current.onCommit(current.current);
      },
    });
  const move = useRef(responder("move")).current;
  const resize = useRef(responder("resize")).current;
  const rotate = useRef(responder("rotate")).current;

  // Masque noir plein ; pendant le geste, un voile pour voir la plaque dessous (`.pl-mask.drag`).
  const fill = mask === "black" ? c.night : c.scrim;
  const fillDrag = mask === "black" ? withAlpha(c.night, 0.68) : c.scrim;
  const style = useAnimatedStyle(() => ({
    left: x.value * bw.value,
    top: y.value * bh.value,
    width: w.value * bw.value,
    height: h.value * bh.value,
    backgroundColor: dragging.value ? fillDrag : fill,
    transform: [{ rotate: `${angle.value}deg` }],
  }));

  return (
    <Animated.View
      {...move.panHandlers}
      accessibilityLabel="Cadre de la plaque"
      testID="plate-frame"
      style={[
        styles.frame,
        mask === "black" ? { borderColor: c.accent, borderWidth: 1.5, borderRadius: 0 } : { borderColor: c.accent },
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
            hitSlop={slop}
            style={[styles.handle, { backgroundColor: c.accent }]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.stem,
              { top: -offset, height: offset },
              below ? { top: undefined, bottom: -offset } : null,
              { backgroundColor: big ? c.nightInk : c.accent },
            ]}
          />
          <View
            {...rotate.panHandlers}
            accessibilityLabel={L.rotateFrame}
            testID="plate-frame-rotate"
            hitSlop={slop}
            style={[
              styles.handle,
              styles.rotate,
              below ? { top: undefined, bottom: -offset - HANDLE / 2 } : { top: -offset - HANDLE / 2 },
              { backgroundColor: big ? c.nightInk : c.accent },
            ]}
          >
            {big ? <Icon name="undo" size={13} color={c.night} /> : null}
          </View>
        </>
      ) : null}
    </Animated.View>
  );
}

/** La loupe (`.loupe` de la maquette 1.4) : la photo ×2,5 autour du doigt, avec le cadre, au-dessus du doigt. */
function Loupe({
  source,
  box,
  probe,
}: {
  source: ImageSourcePropType | undefined;
  box: { w: number; h: number };
  probe: Probe;
}) {
  const { t } = useTheme();
  const c = t.color;
  const W = box.w;
  const H = box.h;
  const bubble = useAnimatedStyle(() => {
    "worklet";
    const place = loupePlace(probe.px.value, probe.py.value, W, H);
    return { opacity: probe.on.value, left: place.left, top: place.top };
  });
  const inner = useAnimatedStyle(() => {
    "worklet";
    return {
      transform: [
        { translateX: LOUPE_SIZE / 2 - probe.px.value * LOUPE_ZOOM },
        { translateY: LOUPE_SIZE / 2 - probe.py.value * LOUPE_ZOOM },
      ],
    };
  });
  const frame = useAnimatedStyle(() => {
    "worklet";
    return {
      left: probe.x.value * W * LOUPE_ZOOM,
      top: probe.y.value * H * LOUPE_ZOOM,
      width: probe.w.value * W * LOUPE_ZOOM,
      height: probe.h.value * H * LOUPE_ZOOM,
      transform: [{ rotate: `${probe.a.value}deg` }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      testID="plate-loupe"
      style={[styles.loupe, { borderColor: c.nightInk, boxShadow: t.shadow.shadowCard }, bubble]}
    >
      <Animated.View style={[{ width: W * LOUPE_ZOOM, height: H * LOUPE_ZOOM }, inner]}>
        {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        {/* Dans la loupe, le cadre n'est qu'un contour : on aligne ses bords sur la plaque qu'il cache. */}
        <Animated.View style={[styles.loupeFrame, { borderColor: c.accent }, frame]} />
      </Animated.View>
      <View style={[styles.cross, { backgroundColor: c.accent }]} />
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
  editor: { borderRadius: tokens.radius.radiusLg, overflow: "hidden" },
  frame: { position: "absolute", borderWidth: 2, borderRadius: tokens.radius.radiusSm },
  grab: { cursor: "grab" } as object,
  handle: {
    position: "absolute",
    right: -HANDLE / 2,
    bottom: -HANDLE / 2,
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  // Poignée de rotation : centrée au-dessus du bord haut, reliée au cadre par une tige.
  rotate: { right: undefined, bottom: undefined, left: "50%", marginLeft: -HANDLE / 2 },
  stem: { position: "absolute", left: "50%", marginLeft: -1, width: 2 },
  badge: { position: "absolute", left: space2, top: space2 },
  hint: { marginTop: space2, alignSelf: "stretch" },
  pill: { paddingHorizontal: space2, paddingVertical: 4, borderRadius: tokens.radius.radiusPill },
  loupe: {
    position: "absolute",
    width: LOUPE_SIZE,
    height: LOUPE_SIZE,
    borderRadius: LOUPE_SIZE / 2,
    borderWidth: 3,
    overflow: "hidden",
  },
  loupeFrame: { position: "absolute", borderWidth: 2, borderRadius: 0 },
  cross: {
    position: "absolute",
    left: LOUPE_SIZE / 2 - 3,
    top: LOUPE_SIZE / 2 - 3,
    width: 6,
    height: 6,
    borderRadius: 0,
  },
});
