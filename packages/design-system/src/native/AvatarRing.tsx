// Anneau d'avatar (lot R7b1, maquette R7 `.r7ring`) : une photo ronde (ou l'initiale) entourée d'un anneau qui dit ce
// que la personne a à montrer. Pas de texte dans l'anneau.
//   - `followers` : story pour ses abonnés, anneau d'encre ; `crew` : story du crew, anneau rouge brique (`win`) ;
//   - `live` : en direct (story de l'organisateur « En cours »), anneau moutarde, le seul néon permis quand il est là ;
//   - `seen` : story déjà vue, anneau fin et discret ; `null` : pas d'anneau (la place reste réservée, rien ne bouge).
// Tailles : sm 40, md 56, lg 64, profile 72 (lot R8b1, haut du Profil compact), xl 88 px. Un appui ouvre les stories, seulement si `onPress` est fourni.

import { type ImageSourcePropType, Pressable, StyleSheet, View } from "react-native";
import { Photo } from "./Photo";
import { Text } from "./text";
import { useTheme } from "./theme";

export type AvatarRingState = "followers" | "crew" | "live" | "seen" | null;
export type AvatarRingSize = "sm" | "md" | "lg" | "xl" | "profile";

/** Dimensions : `box` = diamètre total, `ring` = épaisseur de l'anneau, `gap` = espace entre l'anneau et la photo. */
export const avatarRingSizes: Record<AvatarRingSize, { box: number; ring: number; gap: number; font: number }> = {
  sm: { box: 40, ring: 2, gap: 2, font: 12 },
  md: { box: 56, ring: 2.5, gap: 3, font: 16 },
  lg: { box: 64, ring: 2.5, gap: 3, font: 18 },
  xl: { box: 88, ring: 3, gap: 4, font: 26 },
  profile: { box: 72, ring: 2.5, gap: 2, font: 22 },
};

export type AvatarRingProps = {
  ring?: AvatarRingState;
  size?: AvatarRingSize;
  /** La photo ; sans elle, l'initiale de `name` sur fond rouge. */
  source?: ImageSourcePropType;
  name: string;
  /** Fourni : l'anneau est un bouton (ouvre les stories). */
  onPress?: () => void;
  /** Lot R7f2 : `false` retire le néon d'un anneau `live` (un seul néon moutarde par écran : les autres gardent la bordure pleine). */
  neon?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

export function AvatarRing({
  ring = null,
  size = "lg",
  source,
  name,
  onPress,
  neon = true,
  accessibilityLabel,
  testID,
}: AvatarRingProps) {
  const { t } = useTheme();
  const d = avatarRingSizes[size];
  const c = t.color;
  const color =
    ring === "followers"
      ? c.ink
      : ring === "crew"
        ? c.win
        : ring === "live"
          ? c.accent
          : ring === "seen"
            ? c.line
            : null;
  // « seen » : anneau fin ; l'écart gagné est rendu à l'espace avec la photo (taille totale et photo ne bougent pas).
  const width = ring === "seen" ? 1.5 : d.ring;
  const inner = d.box - 2 * (d.ring + d.gap);
  const body = (
    <View
      style={[
        styles.ring,
        {
          width: d.box,
          height: d.box,
          borderRadius: d.box / 2,
          borderWidth: width,
          // Sans anneau, la bordure reste (transparente) : la photo ne change pas de place.
          borderColor: color ?? "transparent",
          padding: d.gap + d.ring - width,
        },
        ring === "live" && neon && { boxShadow: t.shadow.neonAccentSoft },
      ]}
    >
      <View style={[styles.face, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: c.win }]}>
        {source ? (
          <Photo source={source} style={{ width: inner, height: inner }} />
        ) : (
          <Text variant="posterL" color={c.winInk} style={{ fontSize: d.font, lineHeight: d.font + 2 }}>
            {name.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
    </View>
  );
  if (!onPress) {
    return (
      <View accessibilityElementsHidden={!accessibilityLabel} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={4}
      testID={testID}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: "center", justifyContent: "center" },
  face: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.8 },
});
