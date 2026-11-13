// Les chips de gestion de la Page du propriétaire (lot R9b, maquette R9.3 `r9gest`) : sous l'en-tête, visibles de lui seul, les
// portes vers les écrans de réglage de sa casquette (« Équipe », « Réglages de la structure », « Modifier ma fiche »…). Des puces
// compactes (40 px, contour fin, l'icône puis le libellé en casse normale), jamais le bouton principal de l'écran ; la rangée passe à
// la ligne quand la police du téléphone est agrandie, rien ne se coupe.
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { pagesLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

const { space2, space3 } = tokens.spacing;
const CHIP_HEIGHT = 40;

export type GestItem = { id: string; icon: IconName; label: string; onPress: () => void };

export function PageGest({ items }: { items: readonly GestItem[] }) {
  const { t } = useTheme();
  const c = t.color;
  if (items.length === 0) return null;
  return (
    <View style={styles.row} accessibilityLabel={L.gestGroup} testID="page-gest">
      {items.map((i) => (
        <Pressable
          key={i.id}
          accessibilityRole="button"
          accessibilityLabel={i.label}
          onPress={i.onPress}
          hitSlop={4}
          testID={`page-gest-${i.id}`}
          style={({ pressed }) => [
            styles.chip,
            { backgroundColor: c.surface, borderColor: c.line },
            pressed && styles.pressed,
          ]}
        >
          <Icon name={i.icon} size={16} color={c.ink} />
          <Text variant="bodyStrong" color={c.ink} style={styles.label}>
            {i.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  chip: {
    minHeight: CHIP_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    paddingHorizontal: space3,
    paddingVertical: space2,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1.5,
  },
  // Le libellé passe à la ligne au lieu de se couper.
  label: { flexShrink: 1, fontSize: 13, lineHeight: 17 },
  pressed: { opacity: 0.7 },
});
