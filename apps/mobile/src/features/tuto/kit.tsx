// Briques des illustrations des tutos (lot 42) : le cadre, les cartes, les étiquettes, les barres, les compteurs et les
// entrées animées. Toutes les couleurs, rayons et durées viennent des jetons ; aucune valeur en dur. Réduction des
// animations : chaque brique s'affiche dans son état final, sans mouvement. Une diapo = une seule illustration montée.
import {
  duration,
  easings,
  Icon,
  type IconName,
  Text,
  type TextProps,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const { space1, space2, space3 } = tokens.spacing;
const radius = tokens.radius;

export type EnterKind = "up" | "pop" | "fade" | "left" | "right";

/** Une entrée : de 0 à 1 après `delay` ms. Réduction des animations : 1 tout de suite. */
export function useEnterProgress(delay: number, dur: number = duration.base) {
  const { reducedMotion } = useTheme();
  const p = useSharedValue(reducedMotion ? 1 : 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `p` est stable
  useEffect(() => {
    if (reducedMotion) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration: dur, easing: easings.out }));
  }, [delay, dur, reducedMotion]);
  return p;
}

/** Arrive après `delay` ms : monte (up), saute (pop), apparaît (fade) ou glisse (left, right). */
export function Enter({
  kind = "up",
  delay = 0,
  style,
  children,
}: {
  kind?: EnterKind;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const p = useEnterProgress(delay);
  const animated = useAnimatedStyle(() => {
    "worklet";
    const k = p.value;
    if (kind === "pop") return { opacity: k, transform: [{ scale: interpolate(k, [0, 1], [0.6, 1]) }] };
    if (kind === "up") return { opacity: k, transform: [{ translateY: interpolate(k, [0, 1], [12, 0]) }] };
    if (kind === "left") return { opacity: k, transform: [{ translateX: interpolate(k, [0, 1], [-18, 0]) }] };
    if (kind === "right") return { opacity: k, transform: [{ translateX: interpolate(k, [0, 1], [18, 0]) }] };
    return { opacity: k };
  });
  return <Animated.View style={[animated, style]}>{children}</Animated.View>;
}

/** Montre `before` puis, après `delay` ms, `after` (« En attente » devient « Retenue »). Réduction : `after` d'emblée. */
export function Swap({ before, after, delay }: { before: ReactNode; after: ReactNode; delay: number }) {
  const { reducedMotion } = useTheme();
  const [done, setDone] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) {
      setDone(true);
      return;
    }
    setDone(false);
    const timer = setTimeout(() => setDone(true), delay);
    return () => clearTimeout(timer);
  }, [delay, reducedMotion]);
  return done ? <Enter kind="pop">{after}</Enter> : <View>{before}</View>;
}

/** Monte ses enfants après `delay` ms (un tampon qui ne doit tomber qu'à son heure). Réduction : tout de suite. */
export function Later({ delay, children }: { delay: number; children: ReactElement }) {
  const { reducedMotion } = useTheme();
  const [on, setOn] = useState(reducedMotion || delay === 0);
  useEffect(() => {
    if (reducedMotion || delay === 0) {
      setOn(true);
      return;
    }
    setOn(false);
    const timer = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(timer);
  }, [delay, reducedMotion]);
  return on ? children : null;
}

/** Un texte qui se tape lettre à lettre (le titre de l'événement). Réduction : le texte entier. */
export function Typed({
  text,
  delay = 0,
  perChar = 55,
  variant = "bodyStrong",
  color,
}: {
  text: string;
  delay?: number;
  perChar?: number;
  variant?: TextProps["variant"];
  color?: string;
}) {
  const { t, reducedMotion } = useTheme();
  const [n, setN] = useState(reducedMotion ? text.length : 0);
  useEffect(() => {
    if (reducedMotion) {
      setN(text.length);
      return;
    }
    setN(0);
    let timer: ReturnType<typeof setTimeout>;
    const tick = (i: number) => {
      setN(i);
      if (i < text.length) timer = setTimeout(() => tick(i + 1), perChar);
    };
    timer = setTimeout(() => tick(1), delay);
    return () => clearTimeout(timer);
  }, [text, delay, perChar, reducedMotion]);
  return (
    <Text variant={variant} color={color ?? t.color.plateInk}>
      {text.slice(0, n)}
    </Text>
  );
}

/** Un nombre qui compte de `from` à `to` (rendu en français : 1 284). */
export function Count({
  to,
  from = 0,
  delay = 0,
  dur = 900,
  variant = "number",
  color,
}: {
  to: number;
  from?: number;
  delay?: number;
  dur?: number;
  variant?: TextProps["variant"];
  color?: string;
}) {
  const { t, reducedMotion } = useTheme();
  const [value, setValue] = useState(reducedMotion ? to : from);
  const frame = useRef(0);
  useEffect(() => {
    if (reducedMotion) {
      setValue(to);
      return;
    }
    setValue(from);
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const k = Math.min(1, (now - start) / dur);
      setValue(Math.round(from + (to - from) * k));
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => {
      frame.current = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame.current);
    };
  }, [to, from, delay, dur, reducedMotion]);
  return (
    <Text variant={variant} color={color ?? t.color.plateInk}>
      {value.toLocaleString("fr-FR")}
    </Text>
  );
}

/** Le cadre d'une illustration : une plaque qui garde la place de l'écran, sans défilement. */
export function Art({ children, label, testID }: { children: ReactNode; label?: string; testID?: string }) {
  const { t } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityLabel={label}
      style={[
        styles.art,
        { backgroundColor: t.color.plate, borderColor: t.color.plateLine, borderRadius: radius.radiusLg },
      ]}
    >
      {children}
    </View>
  );
}

/** Une carte dans le cadre. */
export function Card({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const { t } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.color.surfaceRaised, borderRadius: radius.radiusMd }, style]}>
      {children}
    </View>
  );
}

export function Row({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Between({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, styles.between, style]}>{children}</View>;
}

/** Colonne de texte qui prend la place restante et passe à la ligne (jamais tronquée). */
export function Grow({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.grow, style]}>{children}</View>;
}

export function Lbl({ children }: { children: ReactNode }) {
  const { t } = useTheme();
  return (
    <Text variant="label" color={t.color.plateMuted}>
      {children}
    </Text>
  );
}

export function Nm({ children, accent }: { children: ReactNode; accent?: boolean }) {
  const { t } = useTheme();
  return (
    <Text variant="bodyStrong" color={accent ? t.color.accent : t.color.plateInk}>
      {children}
    </Text>
  );
}

export function Sm({ children, center }: { children: ReactNode; center?: boolean }) {
  const { t } = useTheme();
  return (
    <Text variant="caption" color={t.color.plateMuted} style={center ? styles.center : undefined}>
      {children}
    </Text>
  );
}

export type Tone = "accent" | "night" | "win" | "poster" | "waitlist";

/** Les couleurs d'un logo ou d'un avatar d'exemple : des jetons, pas des teintes libres. */
export function toneColors(c: ReturnType<typeof useTheme>["t"]["color"], tone: Tone) {
  switch (tone) {
    case "accent":
      return { bg: c.accent, ink: c.accentInk };
    case "win":
      return { bg: c.win, ink: c.winInk };
    case "poster":
      return { bg: c.poster, ink: c.posterInk };
    case "waitlist":
      return { bg: c.statusWaitlist, ink: c.night };
    default:
      return { bg: c.night, ink: c.nightInk };
  }
}

export function Logo({
  initials,
  tone = "night",
  round,
  size = 38,
}: {
  initials: string;
  tone?: Tone;
  round?: boolean;
  size?: number;
}) {
  const { t } = useTheme();
  const { bg, ink } = toneColors(t.color, tone);
  return (
    <View
      style={[
        styles.logo,
        { width: size, height: size, backgroundColor: bg, borderRadius: round ? size / 2 : radius.radiusSm },
      ]}
    >
      <Text variant="meta" color={ink}>
        {initials}
      </Text>
    </View>
  );
}

/** Une étiquette : contour (`line`), pleine moutarde (`acc`) ou bleue de la liste d'attente (`wait`). */
export function Tag({
  kind = "line",
  icon,
  children,
}: {
  kind?: "line" | "acc" | "wait";
  icon?: IconName;
  children: ReactNode;
}) {
  const { t } = useTheme();
  const c = t.color;
  const fill = kind === "acc" ? c.accent : "transparent";
  const border = kind === "acc" ? c.accent : kind === "wait" ? c.statusWaitlist : c.plateChip;
  const ink = kind === "acc" ? c.accentInk : kind === "wait" ? c.statusWaitlist : c.plateInk;
  return (
    <View style={[styles.tag, { backgroundColor: fill, borderColor: border }]}>
      {icon ? <Icon name={icon} size={14} color={ink} /> : null}
      <Text variant="meta" color={ink}>
        {children}
      </Text>
    </View>
  );
}

/** La souche de date d'un événement (jour de la semaine, jour, mois). */
export function DateStub({ weekday, day, month }: { weekday: string; day: string; month: string }) {
  const { t } = useTheme();
  return (
    <View style={[styles.stub, { borderColor: t.color.accent, borderRadius: radius.radiusSm }]}>
      <Text variant="meta" color={t.color.plateMuted}>
        {weekday}
      </Text>
      <Text variant="posterS" color={t.color.accent}>
        {day}
      </Text>
      <Text variant="meta" color={t.color.plateMuted}>
        {month}
      </Text>
    </View>
  );
}

/** Une photo d'exemple : un cadre sombre et le pictogramme du véhicule (les vraies photos sont celles de la personne). */
export function Ph({ icon = "vehicle", style, size = 44 }: { icon?: IconName; style?: ViewStyle; size?: number }) {
  const { t } = useTheme();
  return (
    <View
      style={[
        styles.ph,
        { backgroundColor: t.color.night, borderRadius: radius.radiusSm, width: size, height: size },
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={t.color.nightInk} />
    </View>
  );
}

/** Une barre qui se remplit de gauche à droite (`width` en pourcentage). */
export function BarFill({
  width,
  delay = 0,
  tone = "accent",
}: {
  width: number;
  delay?: number;
  tone?: "accent" | "poster";
}) {
  const { t } = useTheme();
  const p = useEnterProgress(delay, duration.poster);
  const animated = useAnimatedStyle(() => {
    "worklet";
    return { width: `${p.value * width}%` };
  });
  return (
    <View style={[styles.track, { backgroundColor: t.color.plateLine }]}>
      <Animated.View
        style={[styles.fillBar, { backgroundColor: tone === "accent" ? t.color.accent : t.color.poster }, animated]}
      />
    </View>
  );
}

/** Des lignes « nom · barre · valeur » (remises par grade, zones, statistiques). */
export function Bars({
  rows,
  delay = 0,
}: {
  rows: readonly { name: string; value: string; width: number }[];
  delay?: number;
}) {
  const { t } = useTheme();
  return (
    <View style={styles.bars}>
      {rows.map((r, i) => (
        <View key={r.name} style={styles.barRow}>
          <View style={styles.barName}>
            <Text variant="caption" color={t.color.plateMuted}>
              {r.name}
            </Text>
          </View>
          <View style={styles.grow}>
            <BarFill width={r.width} delay={delay + i * duration.stagger} />
          </View>
          <View style={styles.barValue}>
            <Text variant="caption" color={t.color.plateInk} style={styles.right}>
              {r.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Une pastille moutarde (point de présence, scan OK) ou grise (hors ligne). */
export function Dot({ on = true }: { on?: boolean }) {
  const { t } = useTheme();
  return <View style={[styles.dot, { backgroundColor: on ? t.color.accent : t.color.plateChip }]} />;
}

/** Une ligne de liste : pastille ou icône, deux lignes de texte, une étiquette. */
export function Item({
  lead,
  title,
  meta,
  trail,
  delay = 0,
}: {
  lead?: ReactNode;
  title: string;
  meta?: string;
  trail?: ReactNode;
  delay?: number;
}) {
  return (
    <Enter kind="right" delay={delay}>
      <Card style={styles.item}>
        <Row>
          {lead}
          <Grow>
            <Nm>{title}</Nm>
            {meta ? <Sm>{meta}</Sm> : null}
          </Grow>
          {trail}
        </Row>
      </Card>
    </Enter>
  );
}

/** Un bouton d'exemple (la diapo montre le geste : il ne fait rien). */
export function FakeButton({ icon, children, delay = 0 }: { icon: IconName; children: ReactNode; delay?: number }) {
  const { t, reducedMotion } = useTheme();
  const p = useSharedValue(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `p` est stable
  useEffect(() => {
    if (reducedMotion) {
      p.value = 1;
      return;
    }
    p.value = 1;
    p.value = withDelay(
      delay,
      withTiming(0.94, { duration: duration.fast, easing: easings.inout }, () => {
        p.value = withTiming(1, { duration: duration.fast, easing: easings.inout });
      }),
    );
  }, [delay, reducedMotion]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: p.value }] }));
  return (
    <Animated.View
      style={[animated, styles.button, { backgroundColor: t.color.accent, borderRadius: radius.radiusMd }]}
      accessibilityElementsHidden
    >
      <Icon name={icon} size={18} color={t.color.accentInk} />
      <Text variant="button" color={t.color.accentInk}>
        {children}
      </Text>
    </Animated.View>
  );
}

/** Une pièce qui s'envole de sa carte vers le haut (la candidature, la demande part) puis disparaît. */
export function Fly({ delay, dx, dy, children }: { delay: number; dx: number; dy: number; children: ReactNode }) {
  const { reducedMotion } = useTheme();
  const p = useEnterProgress(delay, duration.poster);
  const animated = useAnimatedStyle(() => {
    "worklet";
    const k = p.value;
    return {
      opacity: k === 0 || k === 1 ? 0 : 1 - k * 0.2,
      transform: [{ translateX: dx * k }, { translateY: dy * k }, { scale: interpolate(k, [0, 1], [1, 0.4]) }],
    };
  });
  if (reducedMotion) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.fly, animated]}>
      {children}
    </Animated.View>
  );
}

/** Les puces d'activités ou de faits (certaines allumées en moutarde). */
export function Chips({
  items,
  on = [],
  delay = 0,
}: {
  items: readonly string[];
  on?: readonly number[];
  delay?: number;
}) {
  const { t } = useTheme();
  return (
    <View style={styles.chips}>
      {items.map((label, i) => {
        const lit = on.includes(i);
        const fire = delay + on.indexOf(i) * duration.stagger;
        return (
          <Enter key={label} kind="pop" delay={lit ? fire : 0}>
            <View
              style={[
                styles.chip,
                {
                  borderColor: lit ? t.color.accent : t.color.plateChip,
                  backgroundColor: lit ? t.color.accent : "transparent",
                },
              ]}
            >
              <Text variant="meta" color={lit ? t.color.accentInk : t.color.plateInk}>
                {label}
              </Text>
            </View>
          </Enter>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { borderWidth: 1, padding: space3, gap: space2, overflow: "hidden", alignSelf: "stretch" },
  card: { padding: space2 + 2, gap: space1 },
  item: { paddingVertical: space2 },
  row: { flexDirection: "row", alignItems: "center", gap: space2 },
  between: { justifyContent: "space-between" },
  grow: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  right: { textAlign: "right" },
  logo: { alignItems: "center", justifyContent: "center" },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: space1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: radius.radiusPill,
    alignSelf: "flex-start",
  },
  stub: { alignItems: "center", borderWidth: 1, paddingVertical: 2, paddingHorizontal: 8, minWidth: 48 },
  ph: { alignItems: "center", justifyContent: "center" },
  track: { height: 8, borderRadius: radius.radiusPill, overflow: "hidden" },
  fillBar: { height: 8, borderRadius: radius.radiusPill },
  bars: { gap: space2 },
  barRow: { flexDirection: "row", alignItems: "center", gap: space2 },
  barName: { width: 64 },
  barValue: { width: 48 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space2,
    minHeight: 44,
    paddingHorizontal: space3,
    alignSelf: "stretch",
  },
  fly: { position: "absolute", left: space3, top: "40%" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  chip: { borderWidth: 1, borderRadius: radius.radiusPill, paddingVertical: 3, paddingHorizontal: 10 },
});
