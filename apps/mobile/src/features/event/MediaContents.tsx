// Contenus des médias accrédités sur la fiche événement (lot 55, `s-event`) : visibles de tous les profils. Les contenus
// mis en avant par l'organisation d'abord (l'API les envoie dans cet ordre), puis les plus récents. Un lien s'ouvre dans le
// navigateur et compte une vue (`POST /media-contents/:id/view`, une par session et par heure, jamais pour le média
// lui-même). Lot R9g : les galeries sont des albums, servis par la section « Photos » (`PhotosSection`) : ici ne restent que les liens.
// Rien ne s'affiche tant qu'aucun média n'a publié de lien.
import { Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { mediaAppLabels as L, type MediaContentView } from "@orasso/shared";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { contentCaption } from "@/features/media/model";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";

const { space1, space2, space3 } = tokens.spacing;

export function MediaContents({ slug }: { slug: string }) {
  const { t } = useTheme();
  const list = useApi(() => api.eventMediaContents(slug), [slug]);
  const items = (list.data ?? []).filter((c) => c.kind !== "gallery");
  if (items.length === 0) return null;

  const view = (c: MediaContentView) => void api.viewMediaContent(c.id).catch(() => undefined);
  const show = (c: MediaContentView) => {
    view(c);
    if (c.url) void Linking.openURL(c.url).catch(() => undefined);
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
          </Plate>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2 },
  card: { gap: space2, padding: space3 },
  top: { flexDirection: "row", alignItems: "center", gap: space2 },
  text: { flex: 1, gap: space1 },
});
