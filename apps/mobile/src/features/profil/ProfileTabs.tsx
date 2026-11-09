// Les deux onglets internes du Profil (lot R7b1, maquette R7.12 `.seg.r6seg`) : Garage · Sorties. Deux segments qui se
// partagent la largeur, le segment actif en encre ; chaque segment est un onglet (`tab`, `selected`), zone tactile
// d'au moins le jeton `touch` ; le libellé ne se coupe jamais (police agrandie : il passe à la ligne).
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { profileTabsLabels as L, type ProfileTab } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

const { space1, space2 } = tokens.spacing;

const ITEMS: { id: ProfileTab; label: string; icon: IconName }[] = [
  { id: "garage", label: L.garage, icon: "vehicle" },
  { id: "sorties", label: L.outings, icon: "stamp" },
];

export function ProfileTabs({
  value,
  onChange,
  /** Les onglets proposés (un compte privé vu d'un inconnu n'en a pas : la page ne monte pas ce composant). */
  items = ITEMS.map((i) => i.id),
}: {
  value: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  items?: readonly ProfileTab[];
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.line }]}
      accessibilityRole="tablist"
      accessibilityLabel={L.group}
      testID="profil-tabs"
    >
      {ITEMS.filter((i) => items.includes(i.id)).map((item) => {
        const on = value === item.id;
        const ink = on ? c.ground : c.inkMuted;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: on }}
            aria-selected={on}
            onPress={() => onChange(item.id)}
            testID={`profil-tab-${item.id}`}
            style={[styles.tab, on && { backgroundColor: c.ink }]}
          >
            <Icon name={item.icon} size={16} color={ink} />
            <Text variant="bodyStrong" color={ink} style={styles.label}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space1, padding: space1, borderRadius: 16, borderWidth: 1 },
  tab: {
    flex: 1,
    minHeight: tokens.spacing.touch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space2 - 2,
    paddingHorizontal: space2,
    borderRadius: 12,
  },
  // Un libellé ne se coupe jamais : sous une police très grande, il passe à la ligne.
  label: { flexShrink: 1, textAlign: "center" },
});
