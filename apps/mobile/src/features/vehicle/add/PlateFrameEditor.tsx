// Photo et cadres de plaque (lot 51, prototype `s-vadd` étape 5) : en mode Automatique, les cadres proposés par la
// détection sont montrés ; à la main, chaque cadre se règle au doigt (PanResponder, comme le curseur : même geste au
// téléphone et dans le navigateur ; position suivie par Reanimated pendant le geste, posée au lâcher).
// Lot M1 (maquettes 1.3 et 1.4) : `mask="black"` montre le cadre en noir plein (ce qu'on voit est ce qui sera publié,
// le vrai flou reste celui du serveur) ; `loupe` : bulle ronde ×2,5 au-dessus du doigt ; `children` : ce qui se pose
// sur la photo (outils, message, confirmation).
// Lot R4a (maquette R4.1) : le cadre ne fait qu'une chose à la fois. Toucher le cadre passe au mode suivant
// (Déplacer → Rotation → Taille) ; il rouvre en Déplacer à chaque photo. Déplacer : un doigt, la loupe, seul repère le
// contour. Rotation : la tige, sans loupe. Taille : aucune poignée, les quatre bords s'attrapent (44 px invisibles), le
// bord opposé reste fixe, un coin tire ses deux bords ; seul le bord tenu s'allume, avec la loupe. Masque translucide
// pendant un geste, noir au lâcher. Une ligne sous la photo dit le mode et le geste, trois points disent où l'on en est.
// Plus de gestes à deux doigts. Un seul répondeur, posé sur toute la photo : il trouve le cadre et le geste par la
// logique pure de `@orasso/shared` (un enfant hors du cadre ne reçoit pas le doigt sur Android).
import { Icon, type IconName, Photo, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import {
  isPlateFrameTap,
  vehicleWizardLabels as L,
  nextPlateFrameMode,
  PLATE_FRAME_FIRST_MODE,
  PLATE_FRAME_MODES,
  PLATE_ROTATE_HANDLE_OFFSET,
  PLATE_ROTATE_KNOB,
  type PlateEdge,
  type PlateFrameMode,
  type PlateRect,
  rotateKnobBelow,
} from "@orasso/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Image, type ImageSourcePropType, PanResponder, StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { EDITOR_MAX_HEIGHT, fitPhoto } from "./model";
import { dragPlateFrame, edgeMask, LOUPE_SIZE, LOUPE_ZOOM, loupePlace, pickPlateFrame } from "./plateGestures";

const { space2 } = tokens.spacing;
const KNOB = PLATE_ROTATE_KNOB;
const STEM = PLATE_ROTATE_HANDLE_OFFSET;
const MODE_ICONS: Record<PlateFrameMode, IconName> = { move: "move", rotate: "undo", size: "crop" };

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

/** Ce que l'éditeur pilote dans un cadre pendant le geste. */
type FrameControl = { set: (rect: PlateRect) => void; drag: (on: boolean, edges: readonly PlateEdge[]) => void };

/** Le geste en cours. */
type Gesture = {
  index: number;
  kind: PlateFrameMode | null;
  edges: PlateEdge[];
  inside: boolean;
  start: PlateRect;
  current: PlateRect;
  x0: number;
  y0: number;
  t0: number;
  moved: boolean;
};

const sourceKey = (source: ImageSourcePropType | undefined) =>
  source && typeof source === "object" && "uri" in source ? String(source.uri ?? "") : String(source ?? "");

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
  /** À la main : les cadres se règlent au doigt. */
  editable: boolean;
  onChange: (rects: PlateRect[]) => void;
  /** Pastille en haut à gauche (« 1 plaque floutée », « Place le cadre sur la plaque »). */
  badge?: ReactNode;
  testID?: string;
  /** Lot M1 : `black` = aperçu masqué en noir plein (étape Plaque) ; `scrim` = voile (autres photos). */
  mask?: "black" | "scrim";
  /** Lot M1 : loupe pendant le déplacement et la taille. */
  loupe?: boolean;
  /** Posé sur la photo (outils, message, confirmation). */
  children?: ReactNode;
}) {
  // Relecture du lot 51 : la photo est montrée entière, à son vrai format (9:16, panorama…) ; le cadre est donc posé
  // sur l'image réelle, sans recadrage qui décalerait ses coordonnées.
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
  // Le cadre rouvre toujours en Déplacer : à chaque photo ouverte.
  const key = sourceKey(source);
  const [mode, setMode] = useState<PlateFrameMode>(PLATE_FRAME_FIRST_MODE);
  // biome-ignore lint/correctness/useExhaustiveDependencies: la photo change, le mode repart de Déplacer.
  useEffect(() => setMode(PLATE_FRAME_FIRST_MODE), [key]);
  const frames = useRef(new Map<number, FrameControl>());
  const latest = useRef({ rects, onChange, editable, loupe, box, mode });
  latest.current = { rects, onChange, editable, loupe, box, mode };
  const gesture = useRef<Gesture | null>(null);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        const { editable: on, rects: all, box: b, mode: m } = latest.current;
        if (!on || !all.length || !b.w) return false;
        const { locationX: x, locationY: y } = e.nativeEvent;
        const hit = pickPlateFrame(all, x, y, b.w, b.h, m);
        const start = hit ? all[hit.index] : undefined;
        if (!hit || !start) return false;
        gesture.current = { ...hit, start, current: start, x0: x, y0: y, t0: Date.now(), moved: false };
        return true;
      },
      onMoveShouldSetPanResponder: () => false,
      // Le cadre garde le geste : la page ne défile pas pendant qu'on le règle.
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, s) => {
        const g = gesture.current;
        const { box: b, loupe: withLoupe } = latest.current;
        if (!g?.kind || !b.w || !b.h) return;
        if (!g.moved && Math.hypot(s.dx, s.dy) < 6) return;
        g.moved = true;
        const next = dragPlateFrame(g.start, g.kind, g.edges, s.dx, s.dy, b.w, b.h);
        g.current = next;
        const frame = frames.current.get(g.index);
        frame?.set(next);
        frame?.drag(g.kind !== "rotate", g.kind === "size" ? g.edges : []);
        // Loupe pour Déplacer et Taille, pas pour la rotation (décision de Damien).
        if (withLoupe && g.kind !== "rotate") {
          probe.on.value = 1;
          probe.px.value = g.x0 + s.dx;
          probe.py.value = g.y0 + s.dy;
          probe.x.value = next.x;
          probe.y.value = next.y;
          probe.w.value = next.w;
          probe.h.value = next.h;
          probe.a.value = next.angle ?? 0;
        }
      },
      onPanResponderRelease: (_e, s) => finish(s.dx, s.dy, true),
      onPanResponderTerminate: (_e, s) => finish(s.dx, s.dy, false),
    }),
  ).current;
  function finish(dx: number, dy: number, released: boolean) {
    const g = gesture.current;
    gesture.current = null;
    probe.on.value = 0;
    if (!g) return;
    frames.current.get(g.index)?.drag(false, []);
    if (g.moved) {
      const { rects: all, onChange: commit } = latest.current;
      commit(all.map((r, i) => (i === g.index ? g.current : r)));
    } else if (released && g.inside && isPlateFrameTap(Math.hypot(dx, dy), Date.now() - g.t0)) {
      setMode((m) => nextPlateFrameMode(m));
    }
  }

  const showMode = editable && rects.length > 0;
  return (
    <View style={styles.outer} onLayout={(e) => setOuter(e.nativeEvent.layout.width)}>
      <View style={[styles.editor, { width: box.w, height: box.h }]} testID={testID}>
        {/* Lot 59c, tour 2 : la photo coupe ce qui la dépasse (cadre tourné contre un bord) ; la tige passe sous un
            cadre collé en haut (`rotateKnobBelow`) pour rester dans la photo et se toucher. */}
        <Photo source={source} style={StyleSheet.absoluteFill} />
        {box.w > 0
          ? rects.map((r, i) => (
              <FrameBox
                // biome-ignore lint/suspicious/noArrayIndexKey: les cadres n'ont pas d'identité propre, l'ordre suffit.
                key={i}
                index={i}
                rect={r}
                box={box}
                editable={editable}
                mode={mode}
                mask={mask}
                register={(control) => {
                  if (control) frames.current.set(i, control);
                  else frames.current.delete(i);
                }}
              />
            ))
          : null}
        {/* Toute la photo reçoit le doigt ; ce qui est posé dessus (outils, message) passe devant. */}
        <View
          style={StyleSheet.absoluteFill}
          {...responder.panHandlers}
          accessibilityLabel={showMode ? L.frameLabel(L.frameModes[mode].name) : undefined}
          testID={showMode ? "plate-frame-touch" : undefined}
        />
        {badge ? (
          <View style={styles.badge} pointerEvents="none">
            {badge}
          </View>
        ) : null}
        {loupe && box.w > 0 ? <Loupe source={source} box={box} probe={probe} /> : null}
        {children}
      </View>
      {showMode ? <ModeLine mode={mode} /> : null}
    </View>
  );
}

/** La ligne sous la photo (`.r4mode`) : le mode, son geste, et trois points. */
function ModeLine({ mode }: { mode: PlateFrameMode }) {
  const { t } = useTheme();
  const c = t.color;
  const i = PLATE_FRAME_MODES.indexOf(mode);
  const m = L.frameModes[mode];
  return (
    <View
      style={[styles.mode, { backgroundColor: c.surface, borderColor: c.line }]}
      accessibilityLiveRegion="polite"
      testID="plate-frame-mode"
    >
      <View style={[styles.modeIcon, { backgroundColor: c.surfaceRaised }]}>
        <Icon name={MODE_ICONS[mode]} size={18} color={c.ink} />
      </View>
      <Text variant="caption" color={c.inkMuted} style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink} style={styles.small}>
          {m.name}
        </Text>
        {` : ${m.touch} · ${L.frameModeSwitchTouch}`}
      </Text>
      <View style={styles.dots} accessibilityLabel={L.frameModeStep(i + 1)} testID="plate-frame-dots">
        {PLATE_FRAME_MODES.map((d, j) => (
          <View
            key={d}
            style={[styles.dot, j === i ? { width: 18, backgroundColor: c.accent } : { backgroundColor: c.line }]}
          />
        ))}
      </View>
    </View>
  );
}

function FrameBox({
  index,
  rect,
  box,
  editable,
  mode,
  mask,
  register,
}: {
  index: number;
  rect: PlateRect;
  box: { w: number; h: number };
  editable: boolean;
  mode: PlateFrameMode;
  mask: "black" | "scrim";
  register: (control: FrameControl | null) => void;
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
  const held = useSharedValue(0);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: l'éditeur pilote ce cadre par son rang ; les valeurs partagées ne changent pas.
  useEffect(() => {
    register({
      set: (next) => {
        x.value = next.x;
        y.value = next.y;
        w.value = next.w;
        h.value = next.h;
        angle.value = next.angle ?? 0;
      },
      drag: (on, edges) => {
        dragging.value = on ? 1 : 0;
        held.value = edgeMask(edges);
      },
    });
    return () => register(null);
  }, [index]);

  // Masque noir plein ; pendant le geste, un voile pour voir la plaque dessous (`.r4fr.drag`).
  const fill = mask === "black" ? c.night : c.scrim;
  const fillDrag = mask === "black" ? withAlpha(c.night, 0.62) : c.scrim;
  const style = useAnimatedStyle(() => {
    "worklet";
    return {
      left: x.value * bw.value,
      top: y.value * bh.value,
      width: w.value * bw.value,
      height: h.value * bh.value,
      backgroundColor: dragging.value ? fillDrag : fill,
      transform: [{ rotate: `${angle.value}deg` }],
    };
  });
  // Seul repère de chaque mode : le contour (Déplacer), la tige (Rotation), les bords (Taille).
  const outline =
    !editable || mode === "move"
      ? { borderColor: c.accent, borderWidth: 2 }
      : mode === "rotate"
        ? { borderColor: withAlpha(c.nightInk, 0.25), borderWidth: 1 }
        : { borderColor: "transparent", borderWidth: 0 };
  const below = rotateKnobBelow(rect, box.h);
  const edgeIdle = c.nightInk;
  const ring = `0 0 0 1px ${withAlpha(c.night, 0.45)}`;
  const edgeOn = c.accent;
  const top = useAnimatedStyle(() => {
    "worklet";
    const on = (held.value & 4) !== 0;
    return { backgroundColor: on ? edgeOn : edgeIdle, height: on ? 5 : 3, top: on ? -3 : -2 };
  });
  const bottom = useAnimatedStyle(() => {
    "worklet";
    const on = (held.value & 8) !== 0;
    return { backgroundColor: on ? edgeOn : edgeIdle, height: on ? 5 : 3, bottom: on ? -3 : -2 };
  });
  const left = useAnimatedStyle(() => {
    "worklet";
    const on = (held.value & 1) !== 0;
    return { backgroundColor: on ? edgeOn : edgeIdle, width: on ? 5 : 3, left: on ? -3 : -2 };
  });
  const right = useAnimatedStyle(() => {
    "worklet";
    const on = (held.value & 2) !== 0;
    return { backgroundColor: on ? edgeOn : edgeIdle, width: on ? 5 : 3, right: on ? -3 : -2 };
  });

  return (
    <Animated.View
      pointerEvents="none"
      testID="plate-frame"
      accessibilityLabel={L.frameLabel(L.frameModes[mode].name)}
      style={[styles.frame, mask === "black" ? null : styles.round, outline, style]}
    >
      {editable && mode === "size" ? (
        <>
          <Animated.View testID="plate-frame-edge-t" style={[styles.edgeH, { boxShadow: ring }, top]} />
          <Animated.View testID="plate-frame-edge-b" style={[styles.edgeH, { boxShadow: ring }, bottom]} />
          <Animated.View testID="plate-frame-edge-l" style={[styles.edgeV, { boxShadow: ring }, left]} />
          <Animated.View testID="plate-frame-edge-r" style={[styles.edgeV, { boxShadow: ring }, right]} />
        </>
      ) : null}
      {editable && mode === "rotate" ? (
        <>
          <View
            style={[
              styles.stem,
              below ? { bottom: -STEM, height: STEM } : { top: -STEM, height: STEM },
              { backgroundColor: c.nightInk },
            ]}
          />
          <View
            testID="plate-frame-rotate"
            style={[
              styles.knob,
              below ? { bottom: -STEM - KNOB / 2 } : { top: -STEM - KNOB / 2 },
              { backgroundColor: c.nightInk, boxShadow: `0 0 0 3px ${withAlpha(c.night, 0.55)}` },
            ]}
          >
            <Icon name="undo" size={15} strokeWidth={2.6} color={c.night} />
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
  const size = LOUPE_SIZE;
  const zoom = LOUPE_ZOOM;
  const bubble = useAnimatedStyle(() => {
    "worklet";
    const place = loupePlace(probe.px.value, probe.py.value, W, H, size);
    return { opacity: probe.on.value, left: place.left, top: place.top };
  });
  const inner = useAnimatedStyle(() => {
    "worklet";
    return {
      transform: [{ translateX: size / 2 - probe.px.value * zoom }, { translateY: size / 2 - probe.py.value * zoom }],
    };
  });
  const frame = useAnimatedStyle(() => {
    "worklet";
    return {
      left: probe.x.value * W * zoom,
      top: probe.y.value * H * zoom,
      width: probe.w.value * W * zoom,
      height: probe.h.value * H * zoom,
      transform: [{ rotate: `${probe.a.value}deg` }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      testID="plate-loupe"
      style={[styles.loupe, { borderColor: c.nightInk, boxShadow: t.shadow.shadowCard }, bubble]}
    >
      <Animated.View style={[{ width: W * zoom, height: H * zoom }, inner]}>
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
  outer: { width: "100%", alignItems: "center", gap: space2 },
  editor: { borderRadius: tokens.radius.radiusLg, overflow: "hidden" },
  frame: { position: "absolute", borderRadius: 3 },
  round: { borderRadius: tokens.radius.radiusSm },
  edgeH: { position: "absolute", left: 0, right: 0, borderRadius: 2 },
  edgeV: { position: "absolute", top: 0, bottom: 0, borderRadius: 2 },
  stem: { position: "absolute", left: "50%", marginLeft: -1, width: 2 },
  knob: {
    position: "absolute",
    left: "50%",
    marginLeft: -KNOB / 2,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: { position: "absolute", left: space2, top: space2 },
  pill: { paddingHorizontal: space2, paddingVertical: 4, borderRadius: tokens.radius.radiusPill },
  mode: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1,
  },
  modeIcon: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.radiusSm,
    alignItems: "center",
    justifyContent: "center",
  },
  grow: { flex: 1, minWidth: 0 },
  small: { fontSize: tokens.type.caption.fontSize, lineHeight: tokens.type.caption.lineHeight },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
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
