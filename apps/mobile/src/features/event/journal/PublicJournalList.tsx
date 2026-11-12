// Le journal d'un événement **sans session** (T4) : une lecture complète, sans interaction (légende entière, date, lieu, étiquettes ;
// ni flamme, ni commentaires, ni menu, ni vignette qui ouvre).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedPostView, tileMeta } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { JournalBadges } from "@/features/publications/JournalBadges";
import { now } from "@/lib/clock";
import { Muted } from "@/ui/Muted";

const { space2, space4 } = tokens.spacing;

export function PublicJournalList({ posts }: { posts: readonly FeedPostView[] }) {
  const { t } = useTheme();
  return (
    <View style={styles.list} testID="journal-public-list">
      {posts.map((post) => {
        const meta = tileMeta(post, now());
        const photo = post.photos[0];
        return (
          <View key={post.id} style={styles.item} testID="journal-public-item">
            <JournalBadges post={post} />
            {photo ? (
              <CrewPhotoImage
                url={photo.url}
                style={[styles.photo, { aspectRatio: photo.width / photo.height, backgroundColor: t.color.surface }]}
                resizeMode="cover"
              />
            ) : null}
            {post.caption ? (
              <Text variant="body" color={t.color.ink} testID="journal-public-caption">
                {post.caption}
              </Text>
            ) : null}
            <Muted variant="caption">{meta.place ? `${meta.date} · ${meta.place}` : meta.date}</Muted>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space4 },
  item: { gap: space2 },
  photo: { width: "100%", borderRadius: tokens.radius.radiusMd },
});
