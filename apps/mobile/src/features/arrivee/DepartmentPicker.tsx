// Le choix des départements (lot 41) : la carte de France, son crédit CC BY 4.0, puis « Choisir dans une liste » qui ouvre
// la liste des 101 départements en cases à cocher accessibles (outre-mer compris). Même règle partout : le premier choisi
// est le favori, 20 au plus. Ce n'est pas une barre de recherche (retirée en v16).
import {
  Button,
  DepartmentChecklist,
  FranceMap,
  FranceMapCredit,
  Text,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { arriveeLabels } from "@orasso/shared";
import { type ReactNode, useState } from "react";
import { StyleSheet, View } from "react-native";

import { departmentLimitReached } from "./model";

const { space2, space3 } = tokens.spacing;

export function DepartmentPicker({
  selected,
  onToggle,
  summary,
  surface = "surface",
}: {
  selected: readonly string[];
  onToggle: (code: string) => void;
  /** Sous le crédit : la puce du favori et « +N ». */
  summary?: ReactNode;
  surface?: "surface" | "plate";
}) {
  const { t } = useTheme();
  const [listOpen, setListOpen] = useState(false);
  const [limit, setLimit] = useState(false);

  const toggle = (code: string) => {
    if (departmentLimitReached(selected, code)) {
      setLimit(true);
      return;
    }
    setLimit(false);
    onToggle(code);
  };

  return (
    <View style={styles.box}>
      <FranceMap selected={selected} favorite={selected[0] ?? null} onToggle={toggle} />
      <FranceMapCredit onPlate={surface === "plate"} />
      {summary}
      <Button
        variant="plate"
        icon={listOpen ? "up" : "list"}
        onPress={() => setListOpen((v) => !v)}
        accessibilityState={{ expanded: listOpen }}
        testID="department-list-toggle"
        fullWidth
      >
        {listOpen ? arriveeLabels.list.close : arriveeLabels.list.open}
      </Button>
      {listOpen ? <DepartmentChecklist selected={selected} onToggle={toggle} surface={surface} /> : null}
      {limit ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert" testID="department-limit">
          {arriveeLabels.errors.tooMany}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space2, marginTop: space3 } });
