// Segments d'un écran d'onglet (prototype `seg`) : deux ou trois puces qui se partagent la largeur, une seule allumée.
// Les puces du système de design, sans composant nouveau.
import { Chip, tokens } from "@orasso/design-system/native";
import { StyleSheet, View } from "react-native";

const { space2 } = tokens.spacing;

export function Segments<T extends string>({
  items,
  value,
  onChange,
  testID,
}: {
  items: readonly { id: T; label: string; testID?: string }[];
  value: T;
  onChange: (id: T) => void;
  testID?: string;
}) {
  return (
    <View style={styles.row} testID={testID} accessibilityRole="tablist">
      {items.map((s) => (
        <Chip key={s.id} selected={value === s.id} onPress={() => onChange(s.id)}>
          {s.label}
        </Chip>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", flexWrap: "wrap", gap: space2 } });
