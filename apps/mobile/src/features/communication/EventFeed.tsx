// Fil de l'événement (lot 20) : annonces de l'organisateur, consignes (retenus), changements de statut. Lecture seule
// (S19). Le texte s'affiche comme du texte, jamais interprété.
import { Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type AnnouncementView, announcementKindLabels, communicationLabels } from "@orasso/shared";
import { Image, StyleSheet, View } from "react-native";

import { ReportButton } from "@/features/ReportSheet";
import { formatDayHour } from "@/lib/format";
import { mediaSource } from "@/lib/media";

const { space1, space2, space3 } = tokens.spacing;

export function FeedEntry({ item, reportable = false }: { item: AnnouncementView; reportable?: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[styles.item, { borderTopColor: c.plateLine }]} testID="feed-item">
      <View style={styles.head}>
        <Text variant="meta" color={c.plateMuted}>
          {announcementKindLabels[item.kind]} · {formatDayHour(item.publishedAt)}
        </Text>
        {item.pinned ? (
          <Chip surface="plate" variant="accent">
            {communicationLabels.feedPinned}
          </Chip>
        ) : null}
      </View>
      <Text variant="body" color={c.plateInk}>
        {item.body}
      </Text>
      {item.image ? (
        <Image
          source={mediaSource(item.image.url)}
          style={[
            styles.image,
            { aspectRatio: item.image.width && item.image.height ? item.image.width / item.image.height : 4 / 3 },
          ]}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {reportable && (item.kind === "announcement" || item.kind === "instructions") ? (
        <ReportButton look="link" onPlate type="announcement" id={item.id} />
      ) : null}
    </View>
  );
}

/** Bloc « Fil de l'événement » de la page événement. `reportable` : « Signaler » sous chaque annonce (lot 32). */
export function EventFeed({ items, reportable = false }: { items: AnnouncementView[]; reportable?: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Plate style={styles.block} testID="event-feed">
      <Text variant="label" color={c.plateMuted}>
        {communicationLabels.feed}
      </Text>
      {items.length === 0 ? (
        <Text variant="body" color={c.plateMuted}>
          {communicationLabels.feedEmpty}
        </Text>
      ) : (
        items.map((item) => <FeedEntry key={item.id} item={item} reportable={reportable} />)
      )}
    </Plate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space1, padding: space3 },
  item: { gap: space1, paddingTop: space2, marginTop: space1, borderTopWidth: 1 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space2 },
  image: { width: "100%", borderRadius: tokens.radius.radiusSm },
});
