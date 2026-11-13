// La section « Photos » de la fiche d'un événement (lot R9g, maquette R9.8 `e-photos`, `photosH`) : les albums publiés des médias
// accrédités, l'album officiel en tête (T43 : dès qu'un album publié existe, même pendant l'événement ; sinon rien). Par album :
// la mosaïque, le titre (jamais tronqué), « <média> · N photos », le tag « Album officiel », « Voir l'album » ; pour l'organisateur
// de l'événement, le « … » qui ouvre la feuille « officiel ». Sans session la section se voit (T34), sans aucune action.
import { Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumSummary, albumsOrder, eventPhotosLabels as L, showPhotosSection } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AlbumCover } from "@/features/albums/AlbumCover";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SecHead } from "@/ui/SecHead";
import { AlbumSheet } from "./AlbumSheet";

const { space1, space2, space3, space6, space12 } = tokens.spacing;

export function PhotosSection({
  slug,
  signedIn,
  ownStructure,
  onSectionY,
}: {
  slug: string;
  signedIn: boolean;
  /** La casquette courante est l'organisateur de cet événement : le « … » de chaque album. */
  ownStructure: boolean;
  /** Où la section se pose dans la page (lien profond « Photos » : l'écran y défile une fois). */
  onSectionY?: (y: number) => void;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const list = useApi(() => api.eventAlbums(slug, signedIn), [slug, signedIn]);
  const [menu, setMenu] = useState<AlbumSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const albums = albumsOrder(list.data?.items ?? []);
  if (!showPhotosSection(albums)) return null;
  return (
    <View
      style={styles.block}
      testID="event-photos"
      onLayout={onSectionY ? (e) => onSectionY(e.nativeEvent.layout.y) : undefined}
    >
      <SecHead title={L.title} hint={L.albumsCount(albums.length)} testID="event-photos-title" />
      {albums.map((a) => (
        <Plate key={a.id} style={styles.card}>
          <View style={styles.head}>
            <View style={styles.mosaic}>
              <AlbumCover photos={a.cover} height={space12 + space6} label={a.title} testID="event-photos-cover" />
            </View>
            <View style={styles.text}>
              <Text variant="bodyStrong" color={t.color.plateInk} testID="event-photos-album-title">
                {a.title}
              </Text>
              <Text variant="meta" color={t.color.plateMuted}>
                {L.mediaLine(a.media.name, a.photosCount)}
              </Text>
              {a.official ? (
                <View style={[styles.tag, { backgroundColor: t.color.accent, borderColor: t.color.accent }]}>
                  <Text variant="caption" color={t.color.accentInk} testID="event-photos-official">
                    {L.officialAlbum}
                  </Text>
                </View>
              ) : null}
            </View>
            {ownStructure ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={L.albumMenu}
                onPress={() => setMenu(a)}
                hitSlop={8}
                testID="event-photos-more"
              >
                <Icon name="more" size={22} color={t.color.plateInk} />
              </Pressable>
            ) : null}
          </View>
          <SmButton
            kind="s"
            icon="next"
            onPress={() => {
              // R9e : « voir les vues » ne disparaît pas : une vue à chaque ouverture de l'album depuis la fiche (un échec est sans suite).
              void api.viewMediaContent(a.id).catch(() => undefined);
              router.push(`/album/${a.id}` as never);
            }}
            testID="event-photos-open"
            accessibilityLabel={`${L.seeAlbum} : ${a.title}`}
          >
            {L.seeAlbum}
          </SmButton>
        </Plate>
      ))}
      {notice ? <Notice testID="event-photos-notice">{notice}</Notice> : null}
      <Muted variant="caption">{L.footnote}</Muted>
      <AlbumSheet
        album={menu}
        onClose={() => setMenu(null)}
        onChanged={(message) => {
          setNotice(message);
          void list.reload();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  card: { gap: space3, padding: space3 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space3 },
  mosaic: { width: space12 * 2 },
  text: { flex: 1, gap: space1 },
  tag: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: tokens.radius.radiusPill,
    paddingHorizontal: space3,
    paddingVertical: space1,
  },
});
