// Lot R3d (retour réel du 24/10) : jamais de bouton principal grisé sans explication. Sous le bouton, une ligne courte dit
// ce qui manque (la première chose), dans l'esprit de l'ajout de véhicule ; des départements manquants mènent à Ton coin.
import { arriveeLabels, type SignupMissing } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { T, useArt } from "@/features/tuto/art";
import { ArtIcon } from "@/features/tuto/icons";

export function MissingLine({ missing, onDepartments }: { missing: SignupMissing | null; onDepartments?: () => void }) {
  const a = useArt();
  if (!missing) return null;
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <T k="cap" color={a.muted} style={styles.text} testID="arrivee-missing">
        {missing.text}
      </T>
      {missing.field === "departments" && onDepartments ? (
        <Pressable
          onPress={onDepartments}
          accessibilityRole="link"
          testID="arrivee-missing-departments"
          hitSlop={6}
          style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
        >
          <ArtIcon name="chl" size={16} color={a.ink} />
          <T k="btn" size={12} lh={14} color={a.ink}>
            {arriveeLabels.missing.departmentsLink}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 4, marginTop: -2 },
  text: { textAlign: "center" },
  link: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 6 },
  pressed: { transform: [{ scale: 0.97 }] },
});
