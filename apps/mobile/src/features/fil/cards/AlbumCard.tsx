// Carte « album » du Fil (lot R9e, maquette R9.5 `albCard`) : l'en-tête est la page du média (logo, nom, « Média · il y a 1 h »), la ligne
// « présent au <événement> » (`AttachLine`, rôle `on_site` déduit de l'accréditation), le corps « Les photos du <événement> · 48 photos » et la
// mosaïque, « Voir l'album » en pied. **Sans flamme ni commentaire** : un album n'est pas une publication (T33). L'API ne sert cette carte
// qu'à un client qui envoie `?cards=album`.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumCardView, feedAgo, albumLabels as L } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { AlbumCover } from "@/features/albums/AlbumCover";
import { pageHrefOf } from "@/features/pages/pageLinks";
import { now } from "@/lib/clock";
import { SmButton } from "@/ui/Kit";
import { useCardRouter } from "../openFromCard";
import { AttachLine } from "./AttachLine";
import { CardShell } from "./CardShell";
import { OrgLogo } from "./parts";
import type { CardProps } from "./types";

const { space2 } = tokens.spacing;

/** Le corps de la carte : la ligne de l'événement, le titre et le nombre de photos, la mosaïque. Sert aussi à « Ce que verront les autres ». */
export function AlbumCardBody({ album }: { album: AlbumCardView }) {
  const { t } = useTheme();
  return (
    <View style={styles.body}>
      <AttachLine attach={album.attach} />
      <Text variant="body" color={t.color.ink} testID="feed-album-title">
        <Text variant="bodyStrong">{album.title}</Text>
        {` · ${L.photosCount(album.photosCount)}`}
      </Text>
      <AlbumCover photos={album.cover} height={150} label={L.coverAlt(album.title)} testID="feed-album-cover" />
    </View>
  );
}

export function AlbumCard({ card, onMenu, faded }: CardProps<"album">) {
  const router = useCardRouter();
  const album = card.payload.album;
  return (
    <CardShell
      card={card}
      head={<OrgLogo url={album.author.avatarUrl} name={album.author.name} />}
      title={album.author.name}
      reason={`${L.mediaTag} · ${feedAgo(card.at, now())}`}
      onMenu={onMenu}
      onTitle={() => {
        const href = pageHrefOf(album.author.key, { pseudo: album.author.pseudo });
        if (href) router.push(href as never);
      }}
      faded={faded}
      testID="feed-card-album"
      actions={
        <>
          <View style={styles.grow} />
          <SmButton
            kind="s"
            icon="next"
            onPress={() => router.push(`/album/${album.id}` as never)}
            testID="feed-album-open"
            accessibilityLabel={`${L.seeAlbum} : ${album.title}`}
          >
            {L.seeAlbum}
          </SmButton>
        </>
      }
    >
      <AlbumCardBody album={album} />
    </CardShell>
  );
}

const styles = StyleSheet.create({
  body: { gap: space2 },
  grow: { flex: 1 },
});
