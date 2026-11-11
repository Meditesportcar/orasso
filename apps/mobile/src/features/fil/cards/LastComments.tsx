// Les deux derniers commentaires sous la carte d'une publication, puis « Voir les N commentaires » (lot R8k2, maquette R8.3 `cmPrev`,
// gabarit `.r8cmts`). Aucun commentaire : rien (pas d'invitation). Prend `post` et `onChange(post)` comme `PostActions`.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedPostView, feedAgo, lastCommentsLine } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { postLive, usePostLive } from "../comments/live";

export function LastComments({
  post: server,
  onChange,
}: {
  post: FeedPostView;
  onChange?: (post: FeedPostView) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const { post } = usePostLive(server, onChange);
  if (postLive.isGone(post.id) || (post.commentsCount <= 0 && post.lastComments.length === 0)) return null;
  const now = new Date();
  return (
    <View style={styles.wrap} testID="feed-post-last-comments">
      {post.lastComments.map((m) => (
        <Text key={m.id} variant="body" color={c.ink} style={styles.line} testID="feed-post-last-comment">
          <Text variant="bodyStrong" color={c.ink} style={styles.line}>
            {m.author.pseudo}
          </Text>
          {` ${m.text}`}
          <Text variant="caption" color={c.inkMuted} style={styles.age}>
            {`  ${feedAgo(m.createdAt, now)}`}
          </Text>
        </Text>
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => postLive.open(post.id, false)}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={styles.more}
        testID="feed-post-comments-open"
      >
        <Text variant="bodyStrong" color={c.accentText} style={styles.moreText}>
          {lastCommentsLine(post.commentsCount)}
        </Text>
        <Icon name="next" size={14} color={c.accentText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  line: { fontSize: 13, lineHeight: 17.5 },
  age: { fontSize: 11.5 },
  more: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 28, alignSelf: "flex-start" },
  moreText: { fontSize: 12.5 },
});
