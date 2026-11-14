// Ligne « <média> a publié 6 photos de ta Toyota GR Supra au <événement> » (lot R9f, maquette R9.7 `r9act`) : le logo du média, le
// titre (une notification par album, jamais une par photo), la bande de quatre vignettes et « Voir mes photos » → « Tes photos ».
// Les données (logo, vignettes) viennent de la notification ; aucune règle ici.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type ActivityItem, activityWhen, albumTagLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { AlbumPhoto } from "@/features/albums/AlbumPhoto";
import { now } from "@/lib/clock";
import { Avatar } from "@/ui/Avatar";

const { space1, space2, space3 } = tokens.spacing;

export function AlbumTaggedRow({
  item,
  day,
  onPress,
}: {
  item: ActivityItem;
  day: "today" | "week" | "earlier";
  onPress?: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const logo = typeof item.data.mediaLogoUrl === "string" ? item.data.mediaLogoUrl : null;
  const media = typeof item.data.mediaName === "string" ? item.data.mediaName : "";
  const thumbs = Array.isArray(item.data.thumbs)
    ? item.data.thumbs.filter((u): u is string => typeof u === "string").slice(0, 4)
    : [];
  const when = activityWhen(new Date(item.latestAt), now(), day);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${item.title}, ${when}${item.read ? "" : ", non lu"}`}
      style={styles.row}
      testID="activity-album-tagged"
    >
      <Avatar url={logo} pseudo={media} size={40} />
      <View style={styles.text}>
        <Text variant="bodyStrong" color={c.ink}>
          {item.title}
        </Text>
        {thumbs.length > 0 ? (
          <View style={styles.strip} testID="activity-album-strip">
            {thumbs.map((url) => (
              <View key={url} style={[styles.thumb, { backgroundColor: c.surfaceRaised }]}>
                <AlbumPhoto photo={{ url }} style={styles.img} cover />
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.go}>
          <Text variant="caption" color={c.accentText}>
            {L.seeMyPhotos}
          </Text>
          <Icon name="next" size={14} color={c.accentText} />
        </View>
        <Text variant="caption" color={c.inkMuted}>
          {when}
        </Text>
      </View>
      {item.read ? null : (
        <View
          style={[styles.dot, { backgroundColor: c.accent }]}
          testID="activity-unread"
          accessibilityElementsHidden
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space3,
    paddingVertical: space3,
    paddingHorizontal: space3,
  },
  text: { flex: 1, gap: space1 },
  strip: { flexDirection: "row", gap: space1 },
  thumb: { width: 56, height: 56, borderRadius: tokens.radius.radiusSm, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  go: { flexDirection: "row", alignItems: "center", gap: space1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginLeft: space2, marginTop: space2 },
});
