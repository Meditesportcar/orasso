// Segments d'un écran d'onglet (prototype `seg`) : deux ou trois puces qui se partagent la largeur, une seule allumée.
// Les puces du système de design, sans composant nouveau. Chaque segment est un onglet (`tab`, `selected`) dont la zone
// tactile fait au moins le jeton `touch` : la puce reste petite à l'œil, la cible, elle, tient au doigt.
import { Chip, tokens } from "@orasso/design-system/native";
import { Pressable, StyleSheet, View } from "react-native";

const { space2 } = tokens.spacing;
const STAFF_TOUCH = 56;

export function Segments<T extends string>({
  items,
  value,
  onChange,
  testID,
  tall = false,
}: {
  items: readonly { id: T; label: string; testID?: string }[];
  value: T;
  onChange: (id: T) => void;
  testID?: string;
  /** Mode staff (gants, soleil) : cible de 56 px au lieu du jeton `touch`. */
  tall?: boolean;
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
          style={[styles.tab, tall && styles.tall]}
        >
          <Chip selected={value === s.id}>{s.label}</Chip>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // flexShrink : dans une rangée qui passe à la ligne, les segments rétrécissent et passent à la ligne (360 dp).
  row: { flexDirection: "row", flexWrap: "wrap", flexShrink: 1, gap: space2 },
  tab: { minHeight: tokens.spacing.touch, minWidth: tokens.spacing.touch, justifyContent: "center" },
  tall: { minHeight: STAFF_TOUCH },
});
