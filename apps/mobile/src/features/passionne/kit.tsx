// Petites pièces de l'artefact DA v2 reproduites pour les écrans du passionné (lot C2b) : `.card`, `.tag`, `.seg`,
// `.btn.sm`, `.nudge`, `.check`, `.cr-mini`, `.orglogo`, `.t-num`. Le socle (lot C1) prépare les mêmes composants
// dans `packages/design-system` ; ces versions locales s'y rangeront à la fusion (consigné au journal des choix).
// Valeurs relevées dans `.claude/prototype-v2/index.html` (feuille de style principale).
import { Icon, type IconName, Monogram, Text, tokens, useTheme } from "@orasso/design-system/native";
import type { ReactNode } from "react";
import { Pressable, type StyleProp, StyleSheet, type TextStyle, View, type ViewStyle } from "react-native";

const { space1, space2, space3 } = tokens.spacing;
const { radiusSm, radiusMd, radiusLg, radiusPill } = tokens.radius;

/** `.card` : fond `--card` (surface), rayon 18, ombre de carte. `padded` = `.card.p` (16 px). */
export function Card({
  children,
  style,
  padded = true,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard },
        padded && styles.cardPad,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** `.poster` : la pièce mise en avant, crème en Béton et nuit en Sable (`--poster`). */
export function PosterSurface({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: t.color.poster, boxShadow: t.shadow.shadowPoster }, style]}
    >
      {children}
    </View>
  );
}

export type TagKind = "ink" | "acc" | "line" | "win";

/** `.tag` : étiquette inclinée de −8°, Archivo étroite 800 11 px en capitales. */
export function Tag({ kind = "ink", children, onPoster }: { kind?: TagKind; children: string; onPoster?: boolean }) {
  const { t } = useTheme();
  const ink = onPoster ? t.color.posterInk : t.color.ink;
  const bg = onPoster ? t.color.poster : t.color.ground;
  const look: Record<TagKind, { box: ViewStyle; color: string }> = {
    ink: { box: { backgroundColor: ink }, color: bg },
    acc: { box: { backgroundColor: t.color.accent }, color: t.color.accentInk },
    line: { box: { borderWidth: 1.5, borderColor: ink }, color: ink },
    win: { box: { backgroundColor: t.color.win }, color: t.color.winInk },
  };
  return (
    <View style={[styles.tag, look[kind].box]}>
      <Text variant="label" color={look[kind].color} style={styles.tagText}>
        {children}
      </Text>
    </View>
  );
}

/** `.pill-o` : pastille moutarde inclinée avec le O (« Validée », « Pro validé »). */
export function PillO({ children }: { children: string }) {
  const { t } = useTheme();
  return (
    <View style={[styles.pillO, { backgroundColor: t.color.accent }]}>
      <View style={styles.unskew}>
        <Monogram size={20} tone="dark" />
      </View>
      <Text variant="label" color={t.color.accentInk} style={styles.pillOText}>
        {children}
      </Text>
    </View>
  );
}

/** `.seg` : segments en bloc, fond `--card-2`, segment actif à l'encre. */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: { value: T; label: string; lead?: ReactNode; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: t.color.surfaceRaised }]} accessibilityRole="tablist" testID={testID}>
      {options.map((o) => {
        const on = o.value === value;
        const color = on ? t.color.ground : t.color.inkMuted;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segBtn, on && { backgroundColor: t.color.ink }]}
            testID={testID ? `${testID}-${o.value}` : undefined}
          >
            {o.lead}
            {o.icon ? <Icon name={o.icon} size={16} color={color} /> : null}
            <Text variant="bodyStrong" color={color} style={styles.segText} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type SmKind = "p" | "s" | "k" | "g";

/** `.btn.sm` (40 px, rayon 10, 12 px) et ses tons : `p` moutarde, `s` carte bordée, `k` encre, `g` sans fond. */
export function SmButton({
  kind = "s",
  icon,
  children,
  onPress,
  wide,
  big,
  disabled,
  testID,
  accessibilityLabel,
  style,
}: {
  kind?: SmKind;
  icon: IconName;
  children?: string;
  onPress?: () => void;
  /** `.btn-w` : pleine largeur. */
  wide?: boolean;
  /** `.btn` normal (50 px, 14 px) au lieu de `.sm`. */
  big?: boolean;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTheme();
  const look: Record<SmKind, { box: ViewStyle; color: string }> = {
    p: { box: { backgroundColor: t.color.accent, boxShadow: t.shadow.neonAccent }, color: t.color.accentInk },
    s: { box: { backgroundColor: t.color.surface, borderWidth: 1.5, borderColor: t.color.line }, color: t.color.ink },
    k: { box: { backgroundColor: t.color.ink }, color: t.color.ground },
    g: { box: { paddingHorizontal: space1 + 2 }, color: t.color.ink },
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.sm,
        big && styles.big,
        look[kind].box,
        wide && styles.wide,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Icon name={icon} size={big ? 20 : 16} color={look[kind].color} />
      {children ? (
        <Text variant="button" color={look[kind].color} style={big ? styles.bigText : styles.smText} numberOfLines={2}>
          {children}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** `.nudge` : carte pressable d'invitation (passeport, crew), contenu à gauche, accessoire à droite. */
export function Nudge({
  children,
  trailing,
  onPress,
  testID,
  accessibilityLabel,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.nudge,
        { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.nudgeBody}>{children}</View>
      {trailing ?? <Icon name="next" size={20} color={t.color.ink} />}
    </Pressable>
  );
}

/** `.check` : case 26 px, rayon 8, moutarde cochée. */
export function CheckBox({ on }: { on: boolean }) {
  const { t } = useTheme();
  return (
    <View
      style={[
        styles.check,
        { borderColor: on ? t.color.accent : t.color.line },
        on && { backgroundColor: t.color.accent },
      ]}
    >
      {on ? <Icon name="check" size={16} strokeWidth={3} color={t.color.accentInk} /> : null}
    </View>
  );
}

/** `.cr-mini` / `.cr-logo` : rond moutarde du crew avec ses initiales. */
export function CrewDot({ initials, size = 40 }: { initials: string; size?: number }) {
  const { t } = useTheme();
  return (
    <View style={[styles.dot, { width: size, height: size, backgroundColor: t.color.accent }]}>
      <Text variant="posterS" color={t.color.accentInk} style={{ fontSize: Math.round(size * 0.36) }}>
        {initials}
      </Text>
    </View>
  );
}

/** `.orglogo` (repli sans image) : 36 px, rayon 10, fond encre, initiales moutarde. */
export function OrgInitials({ name, size = 36 }: { name: string; size?: number }) {
  const { t } = useTheme();
  return (
    <View style={[styles.org, { width: size, height: size, backgroundColor: t.color.ink }]}>
      <Text variant="label" color={t.color.accent} style={styles.orgText}>
        {initialsOf(name, 3)}
      </Text>
    </View>
  );
}

/** `.t-num` : chiffres étroits 800 (62 % dans l'artefact ; instance la plus étroite embarquée en attendant le C1). */
export function Num({
  children,
  size,
  color,
  style,
}: {
  children: string;
  size: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const { t } = useTheme();
  return (
    <Text
      variant="numberNarrow"
      color={color ?? t.color.ink}
      style={[{ fontSize: size, lineHeight: Math.round(size * 0.92) }, style]}
    >
      {children}
    </Text>
  );
}

/** Initiales (capitales, sans accents de liaison) : « MéditeSportCar » → « MSC », « Têt Nights » → « TN ». */
export function initialsOf(name: string, max: number): string {
  const words = name.split(/[\s_\-·]+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, max)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase();
  }
  const caps = name.match(/\p{Lu}/gu) ?? [];
  if (caps.length >= 2) return caps.slice(0, max).join("");
  return name.slice(0, 2).toUpperCase();
}

const styles = StyleSheet.create({
  card: { position: "relative", borderRadius: radiusLg },
  cardPad: { padding: space3 + 4 },
  tag: {
    alignSelf: "flex-start",
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 4,
    justifyContent: "center",
    transform: [{ skewX: tokens.geometry.skew }],
  },
  tagText: { transform: [{ skewX: "8deg" }], letterSpacing: 0.66 },
  pillO: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space1 + 2,
    height: 26,
    paddingLeft: 3,
    paddingRight: space2 + 2,
    borderRadius: radiusPill,
    transform: [{ skewX: tokens.geometry.skew }],
  },
  unskew: { transform: [{ skewX: "8deg" }] },
  pillOText: { transform: [{ skewX: "8deg" }], letterSpacing: 0.44 },
  seg: { flexDirection: "row", padding: 3, borderRadius: 14, gap: 2 },
  segBtn: {
    flex: 1,
    height: 38,
    borderRadius: 11,
    paddingHorizontal: space2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space1 + 2,
  },
  segText: { fontSize: 13 },
  sm: {
    minHeight: 40,
    paddingHorizontal: space3,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space2,
    alignSelf: "flex-start",
  },
  big: { minHeight: 50, paddingHorizontal: space3 + 6, borderRadius: radiusMd },
  wide: { alignSelf: "stretch" },
  smText: { fontSize: 12, lineHeight: 14, textAlign: "center", flexShrink: 1 },
  bigText: { fontSize: 14, lineHeight: 16, textAlign: "center", flexShrink: 1 },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.97 }] },
  nudge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space3,
    padding: space3 + 2,
    borderRadius: radiusLg,
  },
  nudgeBody: { flex: 1, minWidth: 0 },
  check: {
    width: 26,
    height: 26,
    borderRadius: radiusSm,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { borderRadius: radiusPill, alignItems: "center", justifyContent: "center" },
  org: { borderRadius: 10, alignItems: "center", justifyContent: "center" },
  orgText: { fontSize: 13, letterSpacing: 0.26 },
});
