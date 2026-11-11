// La bascule des deux vues d'une liste de publications (maquette R8.6 `.r8vt`) : deux icônes dans un cadre arrondi, la vue active
// en encre pleine. Noms accessibles « Affichage » (le groupe), « Grille de deux » et « Une par une » ; cibles de 44 px.
import { Icon, tokens, useTheme } from "@orasso/design-system/native";
import { publicationsLabels as L, type PublicationsViewMode } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

const { radiusMd } = tokens.radius;

export function ViewToggle({
  value,
  onChange,
}: {
  value: PublicationsViewMode;
  onChange: (mode: PublicationsViewMode) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const item = (mode: PublicationsViewMode, icon: "grid" | "list", label: string) => {
    const on = value === mode;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        aria-pressed={on}
        onPress={() => onChange(mode)}
        style={[styles.btn, on && { backgroundColor: c.ink }]}
        testID={`publications-view-${mode}`}
      >
        <Icon name={icon} size={18} color={on ? c.ground : c.inkMuted} />
      </Pressable>
    );
  };
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={L.viewGroup}
      style={[styles.group, { backgroundColor: c.surfaceRaised }]}
      testID="publications-view-toggle"
    >
      {item("grid", "grid", L.viewGrid)}
      {item("one", "list", L.viewOne)}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: "row", gap: 2, padding: 3, borderRadius: radiusMd + 2 },
  btn: { width: 44, height: 38, borderRadius: radiusMd - 1, alignItems: "center", justifyContent: "center" },
});
