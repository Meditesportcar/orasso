// Field : champs de formulaire. Voir docs/design-system/components/Field.
// Dans une plaque graphite (Plate), champs et cases lisent les jetons plate-* comme sur le web.

import { type ReactNode, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, type TextInputProps, View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Icon } from "./Icon";
import { useInPlate } from "./Plate";
import { textStyles } from "./textStyles";
import { Text } from "./text";
import { radius, spacing, useTheme } from "./theme";
import { withAlpha } from "./color";

type Shell = {
  label: string;
  /** Aide sous le champ (`caption`). */
  help?: ReactNode;
  /** Message d'erreur : sous le champ, jamais une icône seule. */
  error?: ReactNode;
  /** Champ de 56 px (inscription express sur place) au lieu de 48 px. */
  tall?: boolean;
  style?: ViewStyle;
};

/** Les couleurs d'un champ selon son support (surface ou plaque). */
function useFieldColors() {
  const { t } = useTheme();
  const inPlate = useInPlate();
  const c = t.color;
  return {
    t,
    ink: inPlate ? c.plateInk : c.ink,
    muted: inPlate ? c.plateMuted : c.inkMuted,
    faint: c.inkFaint,
    background: inPlate ? c.surfaceRaised : c.surfaceField,
    line: inPlate ? c.plateLine : c.line,
  };
}

function FieldShell({ label, help, error, style, children }: Shell & { children: ReactNode }) {
  const f = useFieldColors();
  return (
    <View style={[styles.field, style]}>
      <Text variant="label" color={f.muted}>
        {label}
      </Text>
      {children}
      {help && !error ? (
        <Text variant="caption" color={f.muted}>
          {help}
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" color={f.t.color.winText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export type TextFieldProps = Shell &
  Omit<TextInputProps, "style" | "placeholderTextColor"> & {
    /** Mot de passe : l'œil pour afficher ou masquer la saisie. */
    revealable?: boolean;
  };

/** Champ de saisie : étiquette étroite au-dessus, champ de 48 px, aide en dessous. */
export function TextField({ label, help, error, tall, style, revealable, secureTextEntry, onFocus, onBlur, ...input }: TextFieldProps) {
  const f = useFieldColors();
  const c = f.t.color;
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isPassword = Boolean(secureTextEntry);
  const border = error ? c.winText : focused ? c.accentText : f.line;
  return (
    <FieldShell label={label} help={help} error={error} style={style}>
      <View style={styles.control}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={f.faint}
          selectionColor={c.accent}
          secureTextEntry={isPassword && !revealed}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            textStyles.body,
            {
              height: tall ? 56 : spacing.touch,
              color: f.ink,
              backgroundColor: f.background,
              borderColor: border,
              boxShadow: focused && !error ? f.t.shadow.neonAccentSoft : undefined,
              paddingRight: isPassword && revealable ? spacing.touch : 14,
            },
            styles.noOutline,
          ]}
          {...input}
        />
        {isPassword && revealable && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            accessibilityState={{ selected: revealed }}
            onPress={() => setRevealed((v) => !v)}
            style={styles.reveal}
          >
            <Icon name={revealed ? "eyeOff" : "eye"} size={20} color={f.ink} />
          </Pressable>
        )}
      </View>
    </FieldShell>
  );
}

export type SelectOption = { value: string; label: string };

export type SelectFieldProps = Shell & {
  /** Sélection fermée (marque, modèle, génération, catégories) : « Autre » toujours en dernier, aucune saisie libre. */
  options: readonly SelectOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
};

/** Sélection fermée : même forme que le champ de saisie. L'option « Autre » est toujours la dernière. */
export function SelectField({ label, help, error, tall, style, options, value, onValueChange, placeholder }: SelectFieldProps) {
  const f = useFieldColors();
  const c = f.t.color;
  const [open, setOpen] = useState(false);
  const ordered = [...options].sort((a, b) => Number(a.label === "Autre") - Number(b.label === "Autre"));
  const current = ordered.find((o) => o.value === value);
  return (
    <FieldShell label={label} help={help} error={error} style={style}>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={[
          styles.input,
          styles.select,
          {
            height: tall ? 56 : spacing.touch,
            backgroundColor: f.background,
            borderColor: error ? c.winText : open ? c.accentText : f.line,
          },
        ]}
      >
        <Text variant="body" color={current ? f.ink : f.faint} style={styles.selectText}>
          {current?.label ?? placeholder ?? ""}
        </Text>
        <Svg width={12} height={12} viewBox="0 0 12 12">
          <Path d="M2 4l4 4 4-4" fill="none" stroke={f.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.veil, { backgroundColor: withAlpha(c.night, 0.8) }]} onPress={() => setOpen(false)}>
          <View style={[styles.list, { backgroundColor: c.surface }]}>
            <ScrollView>
              {ordered.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: option.value === value }}
                  onPress={() => {
                    onValueChange?.(option.value);
                    setOpen(false);
                  }}
                  style={[styles.option, { borderBottomColor: c.line }]}
                >
                  <Text variant="body" color={c.ink} style={styles.selectText}>
                    {option.label}
                  </Text>
                  {option.value === value && <Icon name="check" size={18} color={c.accentText} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </FieldShell>
  );
}

export type CheckboxFieldProps = {
  /** La phrase complète à côté de la case (« Suivre MéditeSportCar — … »), pas un libellé d'un mot. */
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
};

/** Case à cocher : 24 px, `radius-sm`, cochée en moutarde. La zone cliquable est toute la ligne. */
export function CheckboxField({ label, checked, onChange, disabled, style }: CheckboxFieldProps) {
  const f = useFieldColors();
  const c = f.t.color;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.check, disabled && styles.disabled, style]}
    >
      <View
        style={[
          styles.box,
          checked ? { borderColor: c.accent, backgroundColor: c.accent } : { borderColor: f.ink },
        ]}
      >
        {checked && <Icon name="check" size={16} strokeWidth={3} color={c.accentInk} />}
      </View>
      <Text variant="body" color={f.ink} style={styles.checkLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  control: { position: "relative" },
  input: {
    width: "100%",
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderRadius: radius.radiusMd,
  },
  noOutline: { outlineStyle: "none" } as unknown as ViewStyle,
  reveal: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: spacing.touch,
    alignItems: "center",
    justifyContent: "center",
  },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  selectText: { flex: 1 },
  veil: { flex: 1, justifyContent: "center", padding: spacing.space6 },
  list: { maxHeight: "70%", borderRadius: radius.radiusLg, overflow: "hidden" },
  option: {
    minHeight: spacing.touch,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  check: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  disabled: { opacity: 0.4 },
  box: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: radius.radiusSm,
  },
  checkLabel: { flex: 1, minWidth: 0 },
});
