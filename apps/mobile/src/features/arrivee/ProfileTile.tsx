// Une tuile du choix du profil (lot C3, artefact `.prof-grid .prof`) : carte de rayon 16, pictogramme dans un carré
// (`.pg`), nom en capitales italiques, sous-titre ; rond de sélection en haut à droite. Choisie : la tuile passe en
// affiche (crème en Béton, nuit en Sable), le carré moutarde, le rond coché, et elle se soulève de 3 px.
import { type MainProfile, mainProfileTiles } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { T, useArt } from "@/features/tuto/art";
import { ArtIcon, type ArtIconName } from "@/features/tuto/icons";

/** Pictogramme de chaque profil (symboles de l'artefact : `i-car`, `i-eye`, `i-wrench`, `i-flag`, `i-truck`, `i-camera`). */
export const profileIcon: Record<MainProfile, ArtIconName> = {
  exhibitor: "car",
  visitor: "eye",
  pro: "wrench",
  organizer: "flag",
  provider: "truck",
  media: "camera",
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
  const a = useArt();
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
        { backgroundColor: selected ? a.poster : a.card, boxShadow: a.shadow },
        selected ? styles.lifted : null,
      ]}
    >
      <View
        style={[styles.tick, selected ? { backgroundColor: a.accent, borderColor: a.accent } : { borderColor: a.line }]}
      >
        {selected ? <ArtIcon name="check" size={12} strokeWidth={3} color={a.accentInk} /> : null}
      </View>
      <View style={[styles.pg, { backgroundColor: selected ? a.accent : a.card2 }]}>
        <ArtIcon name={profileIcon[profile]} size={21} color={selected ? a.accentInk : a.ink} />
      </View>
      <View>
        <T k="label" size={12} lh={13} color={selected ? a.posterInk : a.ink} style={styles.title}>
          {title}
        </T>
        <T k="body" size={11} lh={21} color={selected ? a.posterMuted : a.muted}>
          {subtitle}
        </T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: "30%",
    flexGrow: 1,
    borderRadius: 16,
    paddingTop: 10,
    paddingHorizontal: 9,
    paddingBottom: 11,
    gap: 8,
    overflow: "hidden",
  },
  lifted: { transform: [{ translateY: -3 }] },
  tick: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pg: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  // `.prof-grid .prof b` : 11,5 px, 88 %, italique 900 en capitales. L'appli n'a l'italique qu'en 125 % (trop large :
  // « Organisateur » se coupait dans un tiers d'écran) : l'étroite des étiquettes, inclinée, tient sur une ligne.
  title: { fontStyle: "italic", letterSpacing: 0 },
});
