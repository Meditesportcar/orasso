// Liste des départements en cases à cocher (lot 41) : le chemin accessible de la carte. Chaque ligne est une case
// (rôle `checkbox`, état coché, libellé « 66 · Pyrénées-Orientales »), l'outre-mer compris. Ce n'est pas une barre de
// recherche (retirée en v16) : c'est la liste entière, qui défile.

import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { Icon } from "../native/Icon";
import { Text } from "../native/text";
import { radius, spacing, useTheme } from "../native/theme";
import { departmentChoices, departmentLabel } from "./choices";

export type DepartmentChecklistProps = {
  selected: readonly string[];
  onToggle: (code: string) => void;
  /** `plate` : posée sur une plaque graphite. */
  surface?: "surface" | "plate";
  style?: ViewStyle;
};

function DepartmentChecklistBase({ selected, onToggle, surface = "surface", style }: DepartmentChecklistProps) {
  const { t } = useTheme();
  const c = t.color;
  const onPlate = surface === "plate";
  const ink = onPlate ? c.plateInk : c.ink;
  const line = onPlate ? c.plateLine : c.line;
  const chosen = new Set(selected);
  return (
    <ScrollView
      nestedScrollEnabled
      style={[styles.list, { borderColor: line }, style]}
      accessibilityLabel="Liste des départements"
      testID="department-list"
    >
      {departmentChoices.map((d) => {
        const on = chosen.has(d.code);
        return (
          <Pressable
            key={d.code}
            onPress={() => onToggle(d.code)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={departmentLabel(d)}
            testID={`deptrow-${d.code}`}
            style={[styles.row, { borderBottomColor: line }]}
          >
            <View
              style={[
                styles.box,
                { borderColor: on ? c.accent : line, backgroundColor: on ? c.accent : "transparent" },
              ]}
            >
              {on ? <Icon name="check" size={14} strokeWidth={2.6} color={c.accentInk} /> : null}
            </View>
            <Text variant="body" color={ink}>
              {departmentLabel(d)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const DepartmentChecklist = memo(DepartmentChecklistBase);

const styles = StyleSheet.create({
  list: { maxHeight: 340, borderWidth: 1, borderRadius: radius.radiusMd },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.space3,
    minHeight: 44,
    paddingHorizontal: spacing.space3,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
