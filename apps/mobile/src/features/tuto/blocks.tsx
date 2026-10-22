// Les blocs des illustrations des tutos (lot C3) : `.tu-art`, `.tz`, `.tz-card`, `.tz-it`, `.tz-chip`, `.tz-btn`,
// `.tz-big`, `.tz-bars`, `.ta-flip`, `a-ring`, `a-fly` de l'artefact, aux mêmes mesures.
import { textStyles, useTheme } from "@orasso/design-system/native";
import { createContext, type ReactNode, type RefObject, useContext, useEffect, useRef, useState } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { A, Count, Fill, FillText, useKey } from "./anim";
import { FILL, T, Tag, useArt } from "./art";
import { ArtIcon, type ArtIconName } from "./icons";

/** Les éléments repérés d'une illustration (départ et arrivée d'un vol `a-fly`). */
type Marks = { frame: RefObject<View | null>; refs: Map<string, RefObject<View | null>> };
const MarksContext = createContext<Marks | null>(null);

/** `.tu-art` : la grande carte de l'illustration (rayon 24, ombre), qui prend la place libre. */
export function ArtFrame({ label, children }: { label: string; children: ReactNode }) {
  const a = useArt();
  const frame = useRef<View>(null);
  const marks = useRef<Marks>({ frame, refs: new Map() }).current;
  return (
    <MarksContext.Provider value={marks}>
      <View
        ref={frame}
        style={[styles.frame, { backgroundColor: a.card, boxShadow: a.shadow }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        testID="tuto-art"
      >
        {children}
      </View>
    </MarksContext.Provider>
  );
}

/** Repère un élément (`id`) pour qu'un vol parte de lui ou y arrive. */
export function Mark({ id, style, children }: { id: string; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const marks = useContext(MarksContext);
  const ref = useRef<View>(null);
  useEffect(() => {
    marks?.refs.set(id, ref);
    return () => {
      marks?.refs.delete(id);
    };
  }, [id, marks]);
  return (
    <View ref={ref} style={style} collapsable={false}>
      {children}
    </View>
  );
}

type Box = { x: number; y: number; w: number; h: number };
function measure(ref: RefObject<View | null>): Promise<Box | null> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node) return resolve(null);
    node.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
  });
}

/**
 * `a-fly` (keyframes `tcFly`, 0,8 s) : une copie de `from` s'envole vers le centre de `to` en rapetissant (la photo de la
 * Supra vers le logo de l'organisateur). Réduction des animations : rien ne vole (l'état final est sans copie).
 */
export function Fly({
  from,
  to,
  d,
  radius = 14,
  children,
}: {
  from: string;
  to: string;
  d: number;
  radius?: number;
  children: ReactNode;
}) {
  const marks = useContext(MarksContext);
  const a = useArt();
  const { reducedMotion } = useTheme();
  const [geo, setGeo] = useState<{ w: number; h: number; x0: number; y0: number; x1: number; y1: number } | null>(null);
  const p = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || !marks) return;
    let alive = true;
    // Les positions se lisent une fois la diapo posée (avant le départ du vol).
    const timer = setTimeout(
      async () => {
        const [f, s, e] = await Promise.all([
          measure(marks.frame),
          measure(marks.refs.get(from) ?? { current: null }),
          measure(marks.refs.get(to) ?? { current: null }),
        ]);
        if (!alive || !f || !s || !e) return;
        setGeo({
          w: s.w,
          h: s.h,
          x0: s.x - f.x,
          y0: s.y - f.y,
          x1: e.x - f.x + e.w / 2 - s.w / 2,
          y1: e.y - f.y + e.h / 2 - s.h / 2,
        });
      },
      Math.max(0, d * 1000 - 300),
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [from, to, d, marks, reducedMotion]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `p` est stable
  useEffect(() => {
    if (!geo) return;
    p.value = 0;
    p.value = withDelay(300, withTiming(1, { duration: 800, easing: Easing.bezier(0.55, 0, 0.7, 0.4) }));
  }, [geo]);
  const g = geo ?? { w: 0, h: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
  const style = useAnimatedStyle(() => {
    "worklet";
    const k = p.value;
    if (k === 0) return { opacity: 0 };
    return {
      opacity: interpolate(k, [0, 0.3, 1], [1, 1, 0]),
      transform: [
        { translateX: interpolate(k, [0, 0.3, 1], [g.x0, g.x0 + 14, g.x1]) },
        { translateY: interpolate(k, [0, 0.3, 1], [g.y0, g.y0 - 26, g.y1]) },
        { rotate: `${interpolate(k, [0, 0.3, 1], [0, -4, 14])}deg` },
        { scale: interpolate(k, [0, 0.3, 1], [1.07, 0.8, 0.16]) },
      ],
    };
  });
  if (!geo) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.fly, { width: g.w, height: g.h, borderRadius: radius, boxShadow: a.shadowLg }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** `.tz` : la colonne centrée de l'illustration (marge 18, écart 12). */
export function Tz({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return <View style={[styles.tz, { gap }]}>{children}</View>;
}

/** `.tz-card` : carte du fond (`--bg`), rayon 14, ombre. */
export function Card({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const a = useArt();
  return <View style={[styles.card, { backgroundColor: a.bg, boxShadow: a.shadow }, style]}>{children}</View>;
}

/** `.tz-row` (`sb` : justifié aux deux bords). */
export function Row({
  children,
  sb,
  gap = 10,
  style,
}: {
  children?: ReactNode;
  sb?: boolean;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, { gap }, sb ? styles.sb : null, style]}>{children}</View>;
}

/** `.grow` */
export function Grow({ children }: { children?: ReactNode }) {
  return <View style={styles.grow}>{children}</View>;
}

/** `.tz-it` : ligne d'une liste (rayon 12, fond, ombre). */
export function It({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const a = useArt();
  return <View style={[styles.it, { backgroundColor: a.bg, boxShadow: a.shadow }, style]}>{children}</View>;
}

/** Titre d'une ligne (`b` 13,5 px gras) et sa précision (`small` 11,5 px). */
export function Nm({ children, size = 13.5 }: { children: ReactNode; size?: number }) {
  const a = useArt();
  return (
    <T k="b" size={size} lh={Math.round(size * 1.3)} color={a.ink}>
      {children}
    </T>
  );
}
export function Sm({ children, center }: { children: ReactNode; center?: boolean }) {
  const a = useArt();
  return (
    <T k="body" size={11.5} lh={15} color={a.muted} style={center ? styles.center : null}>
      {children}
    </T>
  );
}
export function Lbl({ children, color }: { children: ReactNode; color?: string }) {
  const a = useArt();
  return (
    <T k="label" color={color ?? a.muted}>
      {children}
    </T>
  );
}
export function Cap({ children, center }: { children: ReactNode; center?: boolean }) {
  const a = useArt();
  return (
    <T k="cap" color={a.muted} style={center ? styles.center : null}>
      {children}
    </T>
  );
}

/** `.tz-chip` ; `on` (secondes) : la puce passe moutarde (`a-on`) ; `lit` : déjà moutarde. */
export function Chip({ children, on, icon }: { children: string; on?: number; icon?: ArtIconName }) {
  const a = useArt();
  const body = (color: string) => (
    <>
      {icon && on === undefined ? <ArtIcon name={icon} size={16} color={color} /> : null}
      {icon && on !== undefined ? (
        <View>
          <ArtIcon name={icon} size={16} color={a.muted} />
          <A k="fade" d={on} dur={0.3} style={FILL}>
            <ArtIcon name={icon} size={16} color={a.accentInk} />
          </A>
        </View>
      ) : null}
      {on === undefined ? (
        <T k="b" size={12} lh={15} color={color}>
          {children}
        </T>
      ) : (
        <FillText from={a.muted} to={a.accentInk} d={on} size={12}>
          {children}
        </FillText>
      )}
    </>
  );
  if (on === undefined)
    return (
      <View style={[styles.chip, { backgroundColor: a.card2, boxShadow: `inset 0 0 0 1px ${a.line}` }]}>
        {body(a.muted)}
      </View>
    );
  return (
    <Fill from={a.card2} to={a.accent} d={on} style={styles.chip}>
      {body(a.muted)}
    </Fill>
  );
}

/** `.tz-chips` */
export function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

/** `.tz-btn` : le bouton nuit d'une illustration, pressé à `press` secondes (`a-press`). */
export function Btn({ icon, children, press }: { icon: ArtIconName; children: string; press?: number }) {
  const a = useArt();
  const inner = (
    <View style={[styles.btn, { backgroundColor: a.ink }]}>
      <ArtIcon name={icon} size={16} color={a.bg} />
      <T k="b" size={14} lh={18} color={a.bg}>
        {children}
      </T>
    </View>
  );
  return press === undefined ? (
    inner
  ) : (
    <A k="press" d={press}>
      {inner}
    </A>
  );
}

/** `.tz-big` : grand chiffre étroit (40 px) et son unité. */
export function Big({ children, small }: { children: ReactNode; small?: string }) {
  const a = useArt();
  return (
    <View style={styles.big}>
      {children}
      {small ? (
        <T k="label" size={14} lh={16} color={a.ink} style={styles.bigSmall}>
          {small}
        </T>
      ) : null}
    </View>
  );
}

/** Un nombre qui défile, au style de `.tz-big`. */
export function BigCount({ to, from, d, dur }: { to: number; from?: number; d?: number; dur?: number }) {
  const a = useArt();
  return <Count to={to} from={from} d={d} dur={dur} style={[bigText, { color: a.ink }]} />;
}
const bigText = { ...textStyles.numberNarrow, fontSize: 40, lineHeight: 38, letterSpacing: 0 } as const;
export function BigText({ children }: { children: string }) {
  const a = useArt();
  return (
    <T k="num" size={40} lh={38} color={a.ink}>
      {children}
    </T>
  );
}

/** `.tz-bars` : une ligne = libellé (60 px), barre (`a-bar`), valeur (40 px). */
export function Bars({ rows }: { rows: { name: string; value: string; width: number; d: number }[] }) {
  const a = useArt();
  return (
    <View style={styles.bars}>
      {rows.map((r) => (
        <View key={r.name} style={styles.barRow}>
          <T k="b" size={11.5} lh={14} color={a.muted} style={styles.barName}>
            {r.name}
          </T>
          <View style={styles.grow}>
            <BarLine w={r.width} d={r.d} />
          </View>
          <T k="b" size={11.5} lh={14} color={a.ink} style={styles.barValue}>
            {r.value}
          </T>
        </View>
      ))}
    </View>
  );
}

function BarLine({ w, d }: { w: number; d: number }) {
  const a = useArt();
  const { p, reduced } = useKey(d, 0.9);
  const fill = useAnimatedStyle(() => {
    "worklet";
    return { width: `${w * (reduced ? 1 : p.value)}%` };
  });
  return (
    <View style={[styles.barTrack, { backgroundColor: a.line }]}>
      <Animated.View style={[styles.barFill, { backgroundColor: a.accent }, fill]} />
    </View>
  );
}

/**
 * `.ta-flip` : « En attente » bascule (rotateX 90°) et « Retenue » arrive en basculant (`flipOut` à `out` s,
 * `flipIn` à `inAt` s). `late` : « En attente » n'apparaît qu'aux trois quarts (`tzLateW`, média).
 */
export function Flip({
  before,
  after,
  out,
  inAt,
  big,
  late,
}: {
  before: string;
  after: string;
  out: number;
  inAt: number;
  big?: boolean;
  late?: boolean;
}) {
  const h = big ? 44 : 24;
  const size = big ? 18 : 11;
  const w = useKey(late ? 0 : out, late ? 3.3 : 0.3, Easing.linear);
  const r = useKey(inAt, 0.5);
  const outStyle = useAnimatedStyle(() => {
    "worklet";
    const k = w.reduced ? 1 : w.p.value;
    if (late) {
      const o = k < 0.72 ? 0 : k < 0.76 ? (k - 0.72) / 0.04 : k < 0.92 ? 1 : 1 - (k - 0.92) / 0.08;
      const rot = k < 0.92 ? 0 : ((k - 0.92) / 0.08) * 90;
      return { opacity: o, transform: [{ perspective: 600 }, { rotateX: `${rot}deg` }] };
    }
    return { opacity: 1 - k, transform: [{ perspective: 600 }, { rotateX: `${k * 90}deg` }] };
  });
  const inStyle = useAnimatedStyle(() => {
    "worklet";
    const k = r.reduced ? 1 : r.p.value;
    return {
      opacity: k * (r.reduced ? r.fade.value : 1),
      transform: [{ perspective: 600 }, { rotateX: `${(1 - k) * -90}deg` }],
    };
  });
  return (
    <View style={styles.flip}>
      {/* Réduction des animations : seul l'état final existe (« Retenue »), sans « En attente » caché. */}
      {w.reduced ? null : (
        <Animated.View style={[styles.flipLayer, outStyle]} aria-hidden>
          <Tag kind="line" height={h} size={size}>
            {before}
          </Tag>
        </Animated.View>
      )}
      <Animated.View style={inStyle}>
        <Tag kind="acc" height={h} size={size}>
          {after}
        </Tag>
      </Animated.View>
    </View>
  );
}

/** `a-ring` : un liseré moutarde de 2 px qui s'allume autour de son parent à `d` secondes. */
export function Ring({ d, radius = 12 }: { d: number; radius?: number }) {
  const a = useArt();
  return (
    <A k="fade" d={d} dur={0.35} style={[FILL, styles.ring]}>
      <View style={[FILL, { borderRadius: radius, boxShadow: `0 0 0 2px ${a.accent}, ${a.shadowLg}` }]} />
    </A>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 230, borderRadius: 24, overflow: "hidden" },
  fly: { position: "absolute", left: 0, top: 0, overflow: "hidden", zIndex: 4 },
  tz: { ...FILL, padding: 18, justifyContent: "center" },
  card: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 8, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  sb: { justifyContent: "space-between" },
  grow: { flex: 1, minWidth: 0 },
  it: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    minWidth: 0,
  },
  center: { textAlign: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 12,
  },
  big: { flexDirection: "row", alignItems: "baseline" },
  bigSmall: { marginLeft: 5 },
  bars: { gap: 7 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barName: { width: 60 },
  barValue: { width: 40, textAlign: "right" },
  barTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  flip: { alignItems: "center" },
  flipLayer: { position: "absolute" },
  ring: { pointerEvents: "none" },
});
