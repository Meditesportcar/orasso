// Grande tuile du mode staff v2 (lot 48, prototype `s-staff`) : pictogramme, titre, ligne d'aide ; une tuile « big »
// prend toute la largeur (Scanner). Sur plaque : lisible en plein soleil comme de nuit.
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { Pressable, StyleSheet, View } from "react-native";

const { space1, space2, space3 } = tokens.spacing;

export function StaffTile({
  icon,
  title,
  hint,
  onPress,
  big,
  testID,
}: {
  icon: IconName;
  title: string;
  hint: string;
  onPress: () => void;
  big?: boolean;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${hint}`}
      testID={testID}
      style={({ pressed }) => [
        styles.tile,
        big ? styles.big : styles.half,
        { backgroundColor: c.plate, opacity: pressed ? 0.85 : 1, boxShadow: t.shadow.shadowCard },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: big ? c.accent : c.plateLine }]}>
        <Icon name={icon} size={22} color={big ? c.accentInk : c.plateInk} />
      </View>
      <Text variant={big ? "posterM" : "bodyStrong"} color={c.plateInk}>
        {title}
      </Text>
      <Text variant="caption" color={c.plateMuted}>
        {hint}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: tokens.radius.radiusLg, padding: space3, gap: space1, minHeight: 112 },
  big: { width: "100%" },
  half: { flexBasis: "47%", flexGrow: 1 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.radiusMd,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space2,
  },
});
