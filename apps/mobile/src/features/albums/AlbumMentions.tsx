// Où vivent les photos où je suis identifié (lot R9f, T42, maquette R9.7) : la fiche de la voiture (« Vu au <événement> · N photos »), la sortie
// passée (« Photos de ma voiture · N · <média> »), le souvenir (« N photos de ta <voiture> · <média> » et « Revoir mes photos »). Une mention
// = un album : six vignettes au plus, le nom du média en pastille, et « Voir les N photos » (« Tes photos » si c'est ma voiture, sinon
// l'album). Ces photos ne sont jamais des publications. Rien tant qu'aucune identification n'est visible (l'API ne sert pas le champ).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumMention, albumTagLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { SmallButton } from "@/features/sorties/bits";
import { useOnTicketPoster } from "@/features/sorties/Ticket";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { AlbumPhoto } from "./AlbumPhoto";

const { space1, space2 } = tokens.spacing;

const albumPath = (m: AlbumMention, mine: boolean) => (mine ? `/album/${m.albumId}/mes-photos` : `/album/${m.albumId}`);

/** Le rail de vignettes d'une mention, chaque photo avec le nom du média en pastille. */
function Rail({ mention, mine }: { mention: AlbumMention; mine: boolean }) {
  const { t } = useTheme();
  const router = useRouter();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      testID="album-mention-rail"
    >
      {mention.photos.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="link"
          accessibilityLabel={`${L.seeCountPhotos(mention.count)} · ${mention.mediaName}`}
          onPress={() => router.push(albumPath(mention, mine) as never)}
          style={[styles.thumb, { backgroundColor: t.color.surfaceRaised }]}
          testID="album-mention-thumb"
        >
          <AlbumPhoto photo={p} style={styles.img} cover />
          <View style={[styles.pill, { backgroundColor: t.color.night }]}>
            <Text variant="credit" color={t.color.nightInk}>
              {mention.mediaName}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * `outing` : sous « Mon souvenir » d'une sortie passée, « Photos de ma voiture » (toujours à moi) ; sinon la fiche de la voiture, « Vu au
 * <événement> » (`mine` : c'est ma voiture, « Voir les N photos » ouvre « Tes photos »).
 */
export function AlbumMentionsBlock({
  mentions,
  mine,
  outing = false,
}: {
  mentions: readonly AlbumMention[] | undefined;
  mine: boolean;
  outing?: boolean;
}) {
  const { t } = useTheme();
  const router = useRouter();
  // Posé sur le ticket d'une sortie (affiche), le texte prend l'encre de l'affiche.
  const onPoster = useOnTicketPoster();
  const ink = onPoster ? t.color.posterInk : t.color.ink;
  const muted = onPoster ? t.color.posterMuted : t.color.inkMuted;
  if (!mentions || mentions.length === 0) return null;
  return (
    <View style={styles.col} testID={outing ? "outing-album-photos" : "vehicle-album-mentions"}>
      {mentions.map((m) => (
        <View key={m.albumId} style={styles.col} testID="album-mention">
          <View style={styles.head}>
            <Icon name="camera" size={16} color={ink} />
            <Text variant="bodyStrong" color={ink} style={styles.grow} testID="album-mention-title">
              {outing ? L.photosOfMyCar : L.seenAt(m.eventTitle)}
            </Text>
            <Text variant="caption" color={muted} testID="album-mention-count">
              {outing ? `${m.count} · ${m.mediaName}` : L.screens.seenAtCount(m.count)}
            </Text>
          </View>
          <Rail mention={m} mine={mine || outing} />
          <SmallButton
            icon="next"
            onPress={() => router.push(albumPath(m, mine || outing) as never)}
            testID="album-mention-open"
          >
            {L.seeCountPhotos(m.count)}
          </SmallButton>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space2 },
  grow: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  rail: { gap: space2, paddingVertical: space1 },
  thumb: { width: 104, height: 104, borderRadius: tokens.radius.radiusSm, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  pill: {
    position: "absolute",
    left: space1,
    right: space1,
    bottom: space1,
    borderRadius: tokens.radius.radiusPill,
    paddingHorizontal: space2,
    paddingVertical: 1,
    alignItems: "center",
  },
});

/**
 * Ma voiture : « Vu au <événement> » lu sur `GET /vehicles/:id` (la fiche de mon garage est servie par une autre route qui n'a pas ce
 * champ). Rien tant que la lecture n'a pas répondu, ou sans identification : un échec ne montre rien (le bloc est un bonus de la fiche).
 */
export function OwnVehicleMentions({ vehicleId }: { vehicleId: string }) {
  const sheet = useApi(() => api.otherVehicle(vehicleId), [vehicleId]);
  return <AlbumMentionsBlock mentions={sheet.data?.albumMentions} mine />;
}
