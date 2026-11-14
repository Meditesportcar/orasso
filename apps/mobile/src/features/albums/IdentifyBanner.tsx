// L'emplacement laissé par R9e sous les tags de l'album ouvert (lot R9f, maquette R9.6) : pour le média auteur et l'organisateur,
// « Identifier les voitures · N sur M photos identifiées · Continuer » (« Continuer » ouvre la première photo sans identification) ; pour
// une personne identifiée sur l'album, « Voir mes photos » (« Tes photos »). Aucune règle ici : les nombres et les droits viennent de l'API.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { albumTagLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { SmallButton } from "@/features/sorties/bits";

const { space2, space3 } = tokens.spacing;

export function IdentifyBanner({
  identified,
  total,
  canIdentify,
  hasMine,
  onContinue,
  onMine,
}: {
  identified: number;
  total: number;
  canIdentify: boolean;
  /** Je suis identifié sur au moins une photo de cet album. */
  hasMine: boolean;
  onContinue: () => void;
  onMine: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const done = identified >= total;
  return (
    <View style={styles.block} testID="album-identify-slot">
      {canIdentify && total > 0 ? (
        <View style={[styles.banner, { backgroundColor: c.surface, borderColor: c.line }]} testID="identify-banner">
          <Icon name="vehicle" size={22} color={c.ink} />
          <View style={styles.grow}>
            <Text variant="bodyStrong" color={c.ink}>
              {L.identifyCars}
            </Text>
            <Text variant="caption" color={c.inkMuted} testID="identify-banner-count">
              {L.photosIdentified(identified, total)}
            </Text>
          </View>
          {done ? null : (
            <SmallButton icon="next" onPress={onContinue} testID="identify-banner-continue">
              {L.continue}
            </SmallButton>
          )}
        </View>
      ) : null}
      {hasMine ? (
        <Pressable
          accessibilityRole="link"
          onPress={onMine}
          style={[styles.banner, { backgroundColor: c.surface, borderColor: c.accent }]}
          testID="album-my-photos-link"
        >
          <Icon name="camera" size={22} color={c.ink} />
          <Text variant="bodyStrong" color={c.ink} style={styles.grow}>
            {L.seeMyPhotos}
          </Text>
          <Icon name="next" size={18} color={c.inkMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  grow: { flex: 1 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderWidth: 1,
    borderRadius: tokens.radius.radiusMd,
  },
});
