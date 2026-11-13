// Les chips de gestion de la Page du propriétaire (lot R9b, maquette R9.3 `r9gest`) : sous l'en-tête, visibles de lui seul, les
// portes vers les écrans de réglage de sa casquette (« Équipe », « Réglages de la structure », « Modifier ma fiche »…). Des boutons
// secondaires compacts, chacun avec son icône, jamais le bouton principal de l'écran ; la rangée passe à la ligne quand la police
// du téléphone est agrandie, rien ne se coupe.
import { type IconName, tokens } from "@orasso/design-system/native";
import { pagesLabels as L } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { SmButton } from "@/ui/Kit";

const { space2 } = tokens.spacing;

export type GestItem = { id: string; icon: IconName; label: string; onPress: () => void };

export function PageGest({ items }: { items: readonly GestItem[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.row} accessibilityLabel={L.gestGroup} testID="page-gest">
      {items.map((i) => (
        <SmButton key={i.id} kind="s" icon={i.icon} onPress={i.onPress} testID={`page-gest-${i.id}`}>
          {i.label}
        </SmButton>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
