// Petites pièces de l'ajout de véhicule (lot 51 ; lot M1 d'après les maquettes 1.1 à 1.7 et l'artefact `s-vadd`) :
// en-tête d'étape (`.vs-h`), ligne de choix de la liste Orasso (`.vg`, « Autre » en pointillés), bouton de type
// (`.vtype`), pastille (`.vstyles`, choisie en moutarde, refusée barrée), année (`.vyears`), fil d'Ariane (`.vcrumb`),
// note (`.vnote`), bouton carré « ‹ » du pied, et l'ancienne ligne à coche (`ChoiceRow`, étape Plaque et floutage).
import { FitTitle, Icon, type IconName, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

const { space1, space2, space3 } = tokens.spacing;
const R = tokens.radius;

export function StepHead({ title, text }: { title: string; text: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.head}>
      {/* Lot R3a : titre mesuré, jamais coupé (Android). */}
      <FitTitle title={title} variant="posterL" color={t.color.ink} header testID="vehicle-step-title" />
      <Text variant="body" color={t.color.inkMuted}>
        {text}
      </Text>
    </View>
  );
}

/** Une ligne de la liste Orasso (`.vg`) : pictogramme, nom, précision ; choisie = cerclée et cochée ; « Autre » en pointillés. */
export function SelectRow({
  title,
  detail,
  selected,
  icon,
  other = false,
  onPress,
  testID,
}: {
  title: string;
  detail?: string | null;
  selected: boolean;
  icon: IconName;
  other?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      onPress={onPress}
      testID={testID}
      style={[
        styles.vg,
        other
          ? { backgroundColor: "transparent", borderColor: c.line, borderStyle: "dashed" }
          : { backgroundColor: selected ? c.ground : c.surface, borderColor: selected ? c.accent : c.line },
        selected ? { borderWidth: 2, borderStyle: "solid", borderColor: c.accent } : null,
      ]}
    >
      <Icon name={icon} size={22} color={selected ? c.accentText : c.inkMuted} />
      <View style={styles.vgText}>
        <Text variant="bodyStrong" color={c.ink}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" color={c.inkMuted}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={[styles.check, { backgroundColor: selected ? c.accent : "transparent" }]}>
        {selected ? <Icon name="check" size={16} strokeWidth={3} color={c.accentInk} /> : null}
      </View>
    </Pressable>
  );
}

/** Bouton de type (`.vtype`) : grande icône au-dessus du nom. */
export function TypeButton({
  label,
  icon,
  selected,
  onPress,
  testID,
}: {
  label: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={[
        styles.vtype,
        selected
          ? { backgroundColor: c.accent, borderColor: c.accent }
          : { backgroundColor: c.surface, borderColor: c.line },
      ]}
    >
      <Icon name={icon} size={24} color={selected ? c.accentInk : c.inkMuted} />
      <Text variant="bodyStrong" color={selected ? c.accentInk : c.inkMuted} style={styles.small}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Pastille à choisir (`.vstyles`) : moutarde quand elle est choisie ; refusée : barrée, grisée, inactive. */
export function Pill({
  label,
  icon,
  selected,
  off = false,
  onPress,
  hint,
  testID,
}: {
  label: string;
  icon?: IconName;
  selected: boolean;
  off?: boolean;
  onPress: () => void;
  /** Raison d'une pastille refusée (lecteurs d'écran). */
  hint?: string | null;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const ink = selected ? c.accentInk : c.ink;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: off }}
      aria-checked={selected}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      disabled={off}
      onPress={onPress}
      testID={testID}
      style={[
        styles.pill,
        selected
          ? { backgroundColor: c.accent, borderColor: c.accent }
          : { backgroundColor: c.surface, borderColor: c.line },
        off ? styles.off : null,
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={ink} /> : null}
      <Text variant="bodyStrong" color={ink} style={[styles.small, off ? styles.strike : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Une année de la rangée qui défile (`.vyears`). */
export function YearChip({ year, selected, onPress }: { year: number; selected: boolean; onPress: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={String(year)}
      onPress={onPress}
      testID={`vehicle-year-${year}`}
      style={[
        styles.year,
        selected
          ? { backgroundColor: c.accent, borderColor: c.accent }
          : { backgroundColor: c.surface, borderColor: c.line },
      ]}
    >
      <Text variant="numberNarrow" color={selected ? c.accentInk : c.inkMuted} style={styles.yearText}>
        {String(year)}
      </Text>
    </Pressable>
  );
}

/** Fil d'Ariane du choix (`.vcrumb`) : « TOYOTA › SUPRA › GÉNÉRATION », étiquettes inclinées, sans néon. */
export function Crumb({
  items,
  next,
}: {
  items: { label: string; onPress: () => void; a11y: string }[];
  next: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.crumb}>
      {items.map((it) => (
        <View key={it.label} style={styles.crumbItem}>
          <Pressable accessibilityRole="button" accessibilityLabel={it.a11y} onPress={it.onPress} hitSlop={8}>
            <Tag tone="acc">{it.label}</Tag>
          </Pressable>
          <Icon name="next" size={14} color={c.inkMuted} />
        </View>
      ))}
      <Text variant="label" color={c.inkMuted}>
        {next}
      </Text>
    </View>
  );
}

/** Bouton carré du pied (« ‹ » étape précédente, ✕ fermer) : icône seule, nom pour les lecteurs d'écran. */
export function SquareButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={[styles.square, { backgroundColor: c.plate, borderColor: c.plateLine }]}
    >
      <Icon name={icon} size={20} color={c.plateInk} />
    </Pressable>
  );
}

/** Une ligne de la liste Orasso (ancienne forme, gardée par l'étape Plaque et le floutage après coup). */
export function ChoiceRow({
  title,
  detail,
  selected,
  icon = "vehicle",
  onPress,
  testID,
}: {
  title: string;
  detail?: string | null;
  selected: boolean;
  icon?: IconName;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      onPress={onPress}
      testID={testID}
      style={[
        styles.row,
        { backgroundColor: c.surfaceRaised, borderColor: selected ? c.accent : c.line },
        selected ? styles.rowOn : null,
      ]}
    >
      <Icon name={icon} size={22} color={selected ? c.accentText : c.inkMuted} />
      <View style={styles.vgText}>
        <Text variant="bodyStrong" color={c.ink}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" color={c.inkMuted}>
            {detail}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={20} color={c.accentText} /> : null}
    </Pressable>
  );
}

/** Note en petit avec un pictogramme (`.vnote` : « La plaque est masquée toute seule… »). */
export function StepNote({ icon, children, testID }: { icon: IconName; children: ReactNode; testID?: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.note} testID={testID}>
      <Icon name={icon} size={16} color={t.color.inkMuted} />
      <Text variant="caption" color={t.color.inkMuted} style={styles.noteText}>
        {children}
      </Text>
    </View>
  );
}

/** Intitulé de section dans une étape (`.t-label` : « Motorisation », « Style · plusieurs choix »). */
export function FieldLabel({ children, aside }: { children: string; aside?: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={styles.label}>
      <Text variant="label" color={t.color.inkMuted}>
        {children}
      </Text>
      {aside}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: space1 + 2 },
  vg: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: space3,
    paddingHorizontal: space3 + 2,
    borderRadius: R.radiusMd,
    borderWidth: 1.5,
  },
  vgText: { flex: 1, minWidth: 0, gap: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: tokens.radius.radiusPill,
    alignItems: "center",
    justifyContent: "center",
  },
  vtype: {
    flex: 1,
    height: 64,
    borderRadius: R.radiusMd,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: space1,
  },
  small: { fontSize: tokens.type.caption.fontSize, lineHeight: tokens.type.caption.lineHeight },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space1 + 2,
    height: 40,
    paddingHorizontal: space3 + 2,
    borderRadius: R.radiusPill,
    borderWidth: 1.5,
  },
  off: { opacity: 0.35 },
  strike: { textDecorationLine: "line-through" },
  year: {
    height: 44,
    minWidth: 64,
    paddingHorizontal: space3,
    borderRadius: R.radiusMd,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  yearText: { fontSize: tokens.type.title.fontSize, lineHeight: tokens.type.title.lineHeight },
  crumb: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space1 + 2 },
  crumbItem: { flexDirection: "row", alignItems: "center", gap: space1 + 2 },
  square: {
    width: 52,
    height: 52,
    borderRadius: R.radiusMd,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: space3,
    paddingHorizontal: space3,
    borderRadius: R.radiusMd,
    borderWidth: 1.5,
  },
  rowOn: { borderWidth: 2 },
  note: { flexDirection: "row", gap: space2, alignItems: "flex-start" },
  noteText: { flex: 1 },
  label: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
});
