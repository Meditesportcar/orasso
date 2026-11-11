// La croix d'une feuille des commentaires (même gabarit que celle des menus du Fil).
import { Icon, useTheme } from "@orasso/design-system/native";
import { feedCommentScreenLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet } from "react-native";

export function SheetClose({ onPress, testID }: { onPress: () => void; testID?: string }) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={L.close}
      onPress={onPress}
      hitSlop={6}
      style={[styles.closex, { backgroundColor: t.color.surface }]}
      testID={testID}
    >
      <Icon name="close" size={20} color={t.color.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
