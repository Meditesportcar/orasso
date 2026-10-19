// Petites pièces de l'ajout de véhicule (lot 51) : en-tête d'étape, ligne de choix (marque, modèle, génération,
// motorisation), grille de boutons (type, années, couleurs, styles).
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

const { space1, space2, space3 } = tokens.spacing;

export function StepHead({ title, text }: { title: string; text: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.head}>
      <Text variant="posterM" color={t.color.ink} accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" color={t.color.inkMuted}>
        {text}
      </Text>
    </View>
  );
}

/** Une ligne de la liste Orasso : pictogramme, nom, précision, coche quand elle est choisie. */
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
      <View style={styles.rowText}>
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

/** Bouton d'une grille (type, année, couleur, style) ; grisé : la raison est dite en dessous, il ne se choisit pas. */
export function GridButton({
  label,
  selected,
  disabled = false,
  reason,
  icon,
  onPress,
  testID,
  wide = false,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  reason?: string | null;
  icon?: IconName;
  onPress: () => void;
  testID?: string;
  wide?: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      accessibilityLabel={reason ? `${label}, ${reason}` : label}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[
        styles.cell,
        wide ? styles.cellWide : null,
        {
          backgroundColor: selected ? c.accent : c.surfaceRaised,
          borderColor: selected ? c.accent : c.line,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={20} color={selected ? c.accentInk : c.inkMuted} /> : null}
      <Text variant="bodyStrong" color={selected ? c.accentInk : c.ink} style={styles.center}>
        {label}
      </Text>
      {reason ? (
        <Text variant="caption" color={c.inkMuted} style={styles.center}>
          {reason}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Grid({ children, columns = 3 }: { children: ReactNode; columns?: 3 | 4 }) {
  return <View style={[styles.grid, columns === 4 ? styles.grid4 : null]}>{children}</View>;
}

/** Note en petit avec un pictogramme (« La plaque est floutée toute seule… »). */
export function StepNote({ icon, children }: { icon: IconName; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={styles.note}>
      <Icon name={icon} size={16} color={t.color.inkMuted} />
      <Text variant="caption" color={t.color.inkMuted} style={styles.noteText}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: space1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: space3,
    paddingHorizontal: space3,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1.5,
  },
  rowOn: { borderWidth: 2 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  grid4: {},
  cell: {
    flexGrow: 1,
    flexBasis: "30%",
    minHeight: 56,
    paddingVertical: space2,
    paddingHorizontal: space2,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: space1,
  },
  cellWide: { flexBasis: "45%" },
  center: { textAlign: "center" },
  note: { flexDirection: "row", gap: space2, alignItems: "flex-start" },
  noteText: { flex: 1 },
});
