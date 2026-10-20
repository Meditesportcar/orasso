// Tuiles à icône (prototype `acts-g`) : les activités d'une fiche pro, les métiers et les besoins d'une vitrine. Deux
// colonnes ; en lecture, une tuile par fait ; en modification (« touche pour cocher »), la tuile cochée prend le fond
// moutarde, comme une puce sélectionnée. Le libellé passe à la ligne, il n'est jamais coupé.
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { Pressable, StyleSheet, View } from "react-native";

const { space2, space3 } = tokens.spacing;

export type IconTile = { key: string; label: string; icon: IconName; checked?: boolean };

export function IconTiles({
  items,
  onToggle,
  testID,
}: {
  items: readonly IconTile[];
  /** Fourni : les tuiles se cochent (modification). Absent : lecture seule. */
  onToggle?: (key: string) => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.grid} testID={testID}>
      {items.map((item) => {
        const on = Boolean(item.checked);
        const ink = on ? c.accentInk : c.ink;
        const body = (
          <View
            style={[
              styles.tile,
              {
                backgroundColor: on ? c.accent : c.surface,
                borderColor: on ? c.accent : c.line,
                borderRadius: tokens.radius.radiusMd,
              },
            ]}
          >
            <Icon name={item.icon} size={20} color={ink} />
            <Text variant="bodyStrong" color={ink} style={styles.label}>
              {item.label}
            </Text>
          </View>
        );
        return (
          <View key={item.key} style={styles.cell}>
            {onToggle ? (
              <Pressable
                onPress={() => onToggle(item.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={item.label}
              >
                {body}
              </Pressable>
            ) : (
              body
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  cell: { width: "48.5%", flexGrow: 1 },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    minHeight: 52,
    paddingVertical: space2,
    paddingHorizontal: space3,
    borderWidth: 1.5,
  },
  label: { flex: 1, minWidth: 0 },
});
