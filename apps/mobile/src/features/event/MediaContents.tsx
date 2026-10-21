// Contenus des médias accrédités sur la fiche événement (lot 55, `s-event`) : visibles de tous les profils. Les contenus
// mis en avant par l'organisation d'abord (l'API les envoie dans cet ordre), puis les plus récents. Un lien s'ouvre dans le
// navigateur et compte une vue (`POST /media-contents/:id/view`, une par session et par heure, jamais pour le média
// lui-même) ; une galerie s'ouvre en plein écran. Rien ne s'affiche tant qu'aucun média n'a publié.
import { Button, Chip, Photo, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { mediaAppLabels as L, type MediaContentView } from "@orasso/shared";
import { useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { contentCaption } from "@/features/media/model";
import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";

const { space1, space2, space3, space6, space12 } = tokens.spacing;

export function MediaContents({ slug }: { slug: string }) {
  const { t } = useTheme();
  const list = useApi(() => api.eventMediaContents(slug), [slug]);
  const [open, setOpen] = useState<MediaContentView | null>(null);
  const items = list.data ?? [];
  if (items.length === 0) return null;

  const view = (c: MediaContentView) => void api.viewMediaContent(c.id).catch(() => undefined);
  const show = (c: MediaContentView) => {
    view(c);
    if (c.kind === "gallery") setOpen(c);
    else if (c.url) void Linking.openURL(c.url).catch(() => undefined);
  };

  return (
    <View style={styles.block} testID="event-media-contents">
      <Text variant="title" color={t.color.ink} accessibilityRole="header">
        {L.eventContents}
      </Text>
      <Muted variant="caption">{L.eventContentsCaption}</Muted>
      {items.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`${L.kindOf(c)}, ${c.title}, ${L.by(c.media.name)}`}
          onPress={() => show(c)}
          testID="event-media-content"
        >
          <Plate style={styles.card}>
            <View style={styles.top}>
              <View style={styles.text}>
                <Text variant="bodyStrong" color={t.color.plateInk}>
                  {`${L.kindOf(c)} · ${c.title}`}
                </Text>
                <Text variant="meta" color={t.color.plateMuted}>
                  {`${L.by(c.media.name)} · ${contentCaption(c)}`}
                </Text>
              </View>
              {c.featured ? (
                <Chip surface="plate" selected>
                  {L.eventFeatured}
                </Chip>
              ) : null}
            </View>
            {c.kind === "gallery" && c.photos.length > 0 ? (
              <View style={styles.thumbs}>
                {c.photos.slice(0, 3).map((p) => (
                  <Photo key={p.key} source={mediaSource(p.url)} style={styles.thumb} />
                ))}
              </View>
            ) : null}
          </Plate>
        </Pressable>
      ))}
      <Gallery item={open} onClose={() => setOpen(null)} />
    </View>
  );
}

/** Galerie plein écran : les photos en pages, glissées de côté. */
function Gallery({ item, onClose }: { item: MediaContentView | null; onClose: () => void }) {
  const { t } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={item !== null} animationType="fade" onRequestClose={onClose} transparent={false}>
      <View
        style={[styles.gallery, { backgroundColor: t.color.night, paddingTop: insets.top + space2 }]}
        testID="media-gallery"
      >
        <View style={styles.galleryHead}>
          <Text variant="bodyStrong" color={t.color.nightInk} style={styles.text}>
            {item ? `${item.title} · ${L.by(item.media.name)}` : ""}
          </Text>
          <Button variant="close" label={L.eventGalleryClose} onPress={onClose} />
        </View>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.pages}>
          {(item?.photos ?? []).map((p, i, all) => (
            <View key={p.key} style={{ width, height: height * 0.7, justifyContent: "center" }}>
              <Image
                source={{ uri: p.url }}
                style={styles.photo}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
                accessibilityLabel={`${item?.title ?? ""} ${i + 1} sur ${all.length}`}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  card: { gap: space2, padding: space3 },
  top: { flexDirection: "row", alignItems: "center", gap: space2 },
  text: { flex: 1, gap: space1 },
  thumbs: { flexDirection: "row", gap: space2 },
  thumb: { width: space12 + space6, height: space12, borderRadius: tokens.radius.radiusSm },
  gallery: { flex: 1, gap: space3 },
  galleryHead: { flexDirection: "row", alignItems: "center", gap: space2, paddingHorizontal: space3 },
  pages: { flex: 1 },
  photo: { width: "100%", height: "100%" },
});
