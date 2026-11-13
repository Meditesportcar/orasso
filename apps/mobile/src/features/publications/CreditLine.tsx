// Le crédit d'une photo reprise d'un album dans le journal de l'événement (lot R9g, T45, maquette R9.8 `r9cr` et `r9ph`) : « Photo : <média> »
// en surimpression de la photo, et le pied « repartagée, crédit non retirable · Voir l'album » (l'album d'origine ; caché s'il n'est plus
// visible). Il ne se retire pas : aucune action ici.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { creditAlbumId, creditLine, type FeedPhotoCredit, eventPhotosLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { SmButton } from "@/ui/Kit";

const { space1, space2, space3 } = tokens.spacing;

/** « Photo : <média> » posé sur le bas de la photo (le parent est positionné). */
export function CreditOverlay({ credit }: { credit?: FeedPhotoCredit | null }) {
  const { t } = useTheme();
  const line = creditLine(credit);
  if (!line) return null;
  return (
    <View style={[styles.overlay, { backgroundColor: t.color.night }]} pointerEvents="none" testID="credit-overlay">
      <Text variant="caption" color={t.color.nightInk}>
        {line}
      </Text>
    </View>
  );
}

/** Le pied de la carte : « repartagée, crédit non retirable » et « Voir l'album ». */
export function CreditFoot({ credit }: { credit?: FeedPhotoCredit | null }) {
  const { t } = useTheme();
  const router = useRouter();
  if (!credit) return null;
  const albumId = creditAlbumId(credit);
  return (
    <View style={styles.foot} testID="credit-foot">
      <Icon name="camera" size={14} color={t.color.inkMuted} />
      <Text variant="caption" color={t.color.inkMuted} style={styles.grow}>
        {L.repostedFoot}
      </Text>
      {albumId ? (
        <SmButton
          kind="s"
          icon="next"
          onPress={() => router.push(`/album/${albumId}` as never)}
          testID="credit-album"
          accessibilityLabel={`${L.seeCreditAlbum} : ${credit.mediaName}`}
        >
          {L.seeCreditAlbum}
        </SmButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: space2,
    bottom: space2,
    paddingHorizontal: space3,
    paddingVertical: space1,
    borderRadius: tokens.radius.radiusPill,
    opacity: 0.85,
  },
  foot: { flexDirection: "row", alignItems: "center", gap: space2 },
  grow: { flex: 1 },
});
