// Filtres de l'Explorer en feuille : format, catégorie, département, dates, rayon (événements) ; activité, département,
// rayon (pros). On règle dans un brouillon, « Appliquer » le valide : la liste ne se recharge pas à chaque choix.
import { Button, SelectField, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  type Category,
  departments,
  eventFormatLabels,
  eventFormats,
  explorerLabels,
  proActivities,
  proActivityLabels,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppSheet } from "@/ui/AppSheet";
import { type EventFilters, emptyEventFilters, emptyProFilters, type ProFilters, RADII } from "./queries";

const { space2, space3 } = tokens.spacing;

const departmentOptions = [
  { value: "", label: explorerLabels.filterAll },
  ...departments.map((d) => ({ value: d, label: d })),
];
const radiusOptions = [
  { value: "", label: explorerLabels.filterAll },
  ...RADII.map((r) => ({ value: String(r), label: `${r} km` })),
];

function Actions({ onApply, onReset }: { onApply: () => void; onReset: () => void }) {
  return (
    <View style={styles.actions}>
      <Button variant="secondary" icon="check" onPress={onApply} fullWidth>
        {explorerLabels.filtersApply}
      </Button>
      <Button variant="plate" icon="undo" onPress={onReset} fullWidth>
        {explorerLabels.filtersReset}
      </Button>
    </View>
  );
}

export function EventFiltersSheet({
  visible,
  value,
  categories,
  onClose,
  onApply,
}: {
  visible: boolean;
  value: EventFilters;
  categories: Category[];
  onClose: () => void;
  onApply: (next: EventFilters) => void;
}) {
  const { t } = useTheme();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);
  const set = <K extends keyof EventFilters>(key: K, v: EventFilters[K]) => setDraft((d) => ({ ...d, [key]: v }));
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={explorerLabels.filters} maxHeight={0.9}>
      <Text variant="title" color={t.color.ink}>
        {explorerLabels.filters}
      </Text>
      <SelectField
        label={explorerLabels.filterFormat}
        value={draft.format}
        onValueChange={(v) => set("format", v)}
        options={[
          { value: "", label: explorerLabels.filterAll },
          ...eventFormats.map((f) => ({ value: f, label: eventFormatLabels[f] })),
        ]}
      />
      <SelectField
        label={explorerLabels.filterCategory}
        value={draft.categoryId}
        onValueChange={(v) => set("categoryId", v)}
        options={[
          { value: "", label: explorerLabels.filterAllFeminine },
          ...categories.map((c) => ({ value: c.id, label: c.label })),
        ]}
      />
      <SelectField
        label={explorerLabels.filterDepartment}
        value={draft.department}
        onValueChange={(v) => set("department", v)}
        options={departmentOptions}
      />
      <TextField
        label={explorerLabels.filterFrom}
        value={draft.from}
        onChangeText={(v) => set("from", v)}
        placeholder="AAAA-MM-JJ"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        testID="filter-from"
      />
      <TextField
        label={explorerLabels.filterTo}
        value={draft.to}
        onChangeText={(v) => set("to", v)}
        placeholder="AAAA-MM-JJ"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        testID="filter-to"
      />
      <SelectField
        label={explorerLabels.filterRadius}
        value={draft.radiusKm ? String(draft.radiusKm) : ""}
        onValueChange={(v) => set("radiusKm", v ? Number(v) : null)}
        options={radiusOptions}
      />
      <Actions
        onApply={() => {
          onApply(draft);
          onClose();
        }}
        onReset={() => setDraft(emptyEventFilters)}
      />
    </AppSheet>
  );
}

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
      <Actions
        onApply={() => {
          onApply(draft);
          onClose();
        }}
        onReset={() => setDraft(emptyProFilters)}
      />
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space2, paddingTop: space3 },
});
