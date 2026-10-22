// Petites pièces de l'artefact DA v2 reproduites pour les écrans du passionné (lot C2b) : `.card`, `.tag`, `.seg`,
// `.btn.sm`, `.nudge`, `.check`, `.cr-mini`, `.pill-o`, `.t-num`, et `.tag.win`. Depuis la fusion du socle C1,
// l'étiquette (`Tag`), le logo d'organisateur (`OrgLogo`), les initiales (`initialsOf`), `SecHead`, les icônes et les
// jetons viennent du socle ; ces pièces-ci n'y existent pas encore (consigné au journal des choix).
// Valeurs relevées dans `.claude/prototype-v2/index.html` (feuille de style principale).
import { claimNeon, Icon, type IconName, Monogram, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useIsFocused } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
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

/**
 * `.tag.win` : l'étiquette rouge (grade du profil, véhicule archivé). Le `Tag` du socle (lot C1) n'a que les tons
 * encre, moutarde et contour ; celui-ci le complète en attendant un `tone="win"` dans le socle.
 */
export function TagWin({ children }: { children: string }) {
  const { t } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: t.color.win }]}>
      <Text variant="label" color={t.color.winInk} style={styles.tagText}>
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

/** `.seg` : segments en bloc, fond `--card-2`, segment actif à l'encre. `cmode` : variante `.cmode` de la feuille de
 * candidature (fond carte, segment actif sur le fond de page avec ombre, 40 px). */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  testID,
  cmode,
}: {
  cmode?: boolean;
  options: { value: T; label: string; lead?: ReactNode; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <View
      style={[styles.seg, { backgroundColor: cmode ? t.color.surface : t.color.surfaceRaised }, cmode && styles.cmode]}
      accessibilityRole="tablist"
      testID={testID}
    >
      {options.map((o) => {
        const on = o.value === value;
        const color = on ? (cmode ? t.color.ink : t.color.ground) : t.color.inkMuted;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[
              styles.segBtn,
              cmode && styles.cmodeBtn,
              on &&
                (cmode
                  ? { backgroundColor: t.color.ground, boxShadow: t.shadow.shadowCard }
                  : { backgroundColor: t.color.ink }),
            ]}
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
/**
 * Un seul néon moutarde par écran (CLAUDE.md, README Motion) : le bouton principal demande le droit au néon tant que
 * son écran est affiché (`claimNeon`) ; sans le droit, il reste moutarde mais sans halo.
 */
function useNeonRight(wanted: boolean): boolean {
  const focused = useIsFocused();
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (!wanted || !focused) {
      setLit(false);
      return;
    }
    const release = claimNeon();
    setLit(release !== null);
    return () => release?.();
  }, [wanted, focused]);
  return lit;
}

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
  const neon = useNeonRight(kind === "p" && !disabled);
  const look: Record<SmKind, { box: ViewStyle; color: string }> = {
    p: {
      box: { backgroundColor: t.color.accent, boxShadow: neon ? t.shadow.neonAccent : t.shadow.shadowCard },
      color: t.color.accentInk,
    },
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
        <Text variant="button" color={look[kind].color} style={big ? styles.bigText : styles.smText}>
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
      <Text
        variant="numberNarrow"
        color={t.color.accentInk}
        style={{ fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.42) }}
      >
        {initials}
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
  cmode: { padding: 4, gap: 4 },
  cmodeBtn: { height: 40, borderRadius: 10 },
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
});
