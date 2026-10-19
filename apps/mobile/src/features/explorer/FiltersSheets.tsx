// Filtres des pros de l'Explorer en feuille : activité, département, rayon. On règle dans un brouillon, « Appliquer » le
// valide : la liste ne se recharge pas à chaque choix. Les filtres des événements sont repliés sous l'en-tête
// (Explorer v2, lot 44 : Format, Quand, Selon mes goûts).
import { Button, SelectField, Text, tokens, useTheme } from "@orasso/design-system/native";
import { departments, explorerLabels, proActivities, proActivityLabels } from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppSheet } from "@/ui/AppSheet";
import { emptyProFilters, type ProFilters, RADII } from "./queries";

const { space2, space3 } = tokens.spacing;

const departmentOptions = [
  { value: "", label: explorerLabels.filterAll },
  ...departments.map((d) => ({ value: d, label: d })),
];
const radiusOptions = [
  { value: "", label: explorerLabels.filterAll },
  ...RADII.map((r) => ({ value: String(r), label: `${r} km` })),
];

export function ProFiltersSheet({
  visible,
  value,
  onClose,
  onApply,
}: {
  visible: boolean;
  value: ProFilters;
  onClose: () => void;
  onApply: (next: ProFilters) => void;
}) {
  const { t } = useTheme();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={explorerLabels.filters} maxHeight={0.9}>
      <Text variant="title" color={t.color.ink}>
        {explorerLabels.filters}
      </Text>
      <SelectField
        label={explorerLabels.filterActivity}
        value={draft.activity}
        onValueChange={(v) => setDraft((d) => ({ ...d, activity: v }))}
        options={[
          { value: "", label: explorerLabels.filterAllFeminine },
          ...proActivities.map((a) => ({ value: a, label: proActivityLabels[a] })),
        ]}
      />
      <SelectField
        label={explorerLabels.filterDepartment}
        value={draft.department}
        onValueChange={(v) => setDraft((d) => ({ ...d, department: v }))}
        options={departmentOptions}
      />
      <SelectField
        label={explorerLabels.filterRadius}
        value={draft.radiusKm ? String(draft.radiusKm) : ""}
        onValueChange={(v) => setDraft((d) => ({ ...d, radiusKm: v ? Number(v) : null }))}
        options={radiusOptions}
      />
      <View style={styles.actions}>
        <Button
          variant="secondary"
          icon="check"
          onPress={() => {
            onApply(draft);
            onClose();
          }}
          fullWidth
        >
          {explorerLabels.filtersApply}
        </Button>
        <Button variant="plate" icon="undo" onPress={() => setDraft(emptyProFilters)} fullWidth>
          {explorerLabels.filtersReset}
        </Button>
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space2, paddingTop: space3 },
});
