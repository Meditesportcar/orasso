// Grande tuile du mode staff (lot 48, artefact `s-staff`, classes `.stf-t` et `.stf-t.big`, lot C4a) : pictogramme,
// titre italique, ligne d'aide ; la tuile « big » (Scanner) prend toute la largeur, en moutarde pleine.
import { Icon, type IconName, Text, useTheme } from "@orasso/design-system/native";
import { Pressable, StyleSheet } from "react-native";

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
  // Artefact `.stf-t` : carte, icône 28 px moutarde lisible, titre italique large ; `.stf-t.big` (Scanner) : moutarde pleine.
  const ink = big ? c.accentInk : c.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${hint}`}
      testID={testID}
      style={({ pressed }) => [
        styles.tile,
        big ? styles.big : styles.half,
        {
          backgroundColor: big ? c.accent : c.surface,
          opacity: pressed ? 0.85 : 1,
          boxShadow: big ? t.shadow.shadowPoster : t.shadow.shadowCard,
        },
      ]}
    >
      <Icon name={icon} size={28} color={big ? c.accentInk : c.accentText} />
      <Text variant="posterS" color={ink} style={styles.title}>
        {title}
      </Text>
      <Text variant="caption" color={big ? c.accentInk : c.inkMuted} style={styles.hint}>
        {hint}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 18, padding: 14, gap: 6, minHeight: 118 },
  big: { width: "100%", minHeight: 104 },
  half: { flexBasis: "47%", flexGrow: 1 },
  title: { fontSize: 15, lineHeight: 16, textTransform: "uppercase", marginTop: 4 },
  hint: { fontSize: 12 },
});
