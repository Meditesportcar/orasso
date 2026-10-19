// Une tuile du choix du profil (prototype `.prof`) : pictogramme, nom, sous-titre ; coche moutarde quand elle est choisie.
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type MainProfile, mainProfileTiles } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

const { space1, space2, space3 } = tokens.spacing;
const { radiusMd, radiusPill } = tokens.radius;

/** Pictogramme de chaque profil (jeu d'icônes du système : pas d'ajout pour ce lot, consigné au journal). */
export const profileIcon: Record<MainProfile, IconName> = {
  exhibitor: "vehicle",
  visitor: "eye",
  pro: "plate",
  organizer: "flag",
  provider: "briefcase",
  media: "press",
};

export function ProfileTile({
  profile,
  selected,
  onPress,
}: {
  profile: MainProfile;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const { title, subtitle } = mainProfileTiles[profile];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      aria-checked={selected}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${subtitle}`}
      testID={`profile-${profile}`}
      style={[
        styles.tile,
        {
          backgroundColor: c.surface,
          borderColor: selected ? c.accentText : c.line,
          borderWidth: selected ? 2 : 1.5,
        },
      ]}
    >
      {selected ? (
        <View style={[styles.tick, { backgroundColor: c.accent }]}>
          <Icon name="check" size={12} strokeWidth={2.4} color={c.accentInk} />
        </View>
      ) : null}
      <Icon name={profileIcon[profile]} size={26} strokeWidth={1.8} color={selected ? c.accentText : c.ink} />
      <Text variant="bodyStrong" color={c.ink}>
        {title}
      </Text>
      <Text variant="caption" color={c.inkMuted}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: "30%",
    flexGrow: 1,
    minWidth: 96,
    borderRadius: radiusMd,
    padding: space2,
    paddingTop: space3,
    gap: space1,
    alignItems: "flex-start",
  },
  tick: {
    position: "absolute",
    top: space1,
    right: space1,
    width: 20,
    height: 20,
    borderRadius: radiusPill,
    alignItems: "center",
    justifyContent: "center",
  },
});
