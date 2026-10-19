// Sous la carte : la puce du favori (« 66 · favori ») et la pastille « +N » des autres départements (prototype v17).
// Aucune barre de recherche (v16) : la carte est le seul moyen de choisir.
import { Chip, tokens } from "@orasso/design-system/native";
import { arriveeLabels, departmentFirstTag, type MainProfile } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { Muted } from "@/ui/Muted";

const { space2 } = tokens.spacing;

export function DepartmentSummary({ selected, profile }: { selected: readonly string[]; profile: MainProfile }) {
  const [first, ...others] = selected;
  if (!first) return <Muted variant="caption">{arriveeLabels.department.empty}</Muted>;
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Chip variant="accent" selected accessibilityLabel={`Département ${departmentFirstTag[profile]} ${first}`}>
        {`${first} · ${departmentFirstTag[profile]}`}
      </Chip>
      {others.length > 0 ? (
        <Chip accessibilityLabel={`${others.length} ${arriveeLabels.department.more}`}>{`+${others.length}`}</Chip>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: space2 } });
