// Segments d'un écran d'onglet (prototype `seg`) : deux ou trois puces qui se partagent la largeur, une seule allumée.
// Les puces du système de design, sans composant nouveau. Chaque segment est un onglet (`tab`, `selected`) dont la zone
// tactile fait au moins le jeton `touch` : la puce reste petite à l'œil, la cible, elle, tient au doigt.
import { Chip, tokens } from "@orasso/design-system/native";
import { Pressable, StyleSheet, View } from "react-native";

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
        <Pressable
          key={s.id}
          onPress={() => onChange(s.id)}
          accessibilityRole="tab"
          aria-selected={value === s.id}
          accessibilityLabel={s.label}
          testID={s.testID}
          style={styles.tab}
        >
          <Chip selected={value === s.id}>{s.label}</Chip>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  tab: { minHeight: tokens.spacing.touch, minWidth: tokens.spacing.touch, justifyContent: "center" },
});
