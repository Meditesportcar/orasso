// Une ligne de la feuille des commentaires (maquette R8.3 `cmRow`, gabarit `.r8cm`) : avatar, pseudo, âge, texte, flamme du commentaire
// avec son nombre, « Répondre » (premier niveau seulement : un seul niveau de réponses) et « … ».
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedCommentView, feedAgo, feedCommentScreenLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/ui/Avatar";
import { MentionText } from "./MentionText";

const { space2 } = tokens.spacing;

export function CommentRow({
  comment,
  reply = false,
  onFire,
  onReply,
  onMenu,
}: {
  comment: FeedCommentView;
  /** Une réponse : pas de bouton « Répondre » (elle répond au commentaire de premier niveau, jamais à une réponse). */
  reply?: boolean;
  onFire: (c: FeedCommentView) => void;
  onReply?: (c: FeedCommentView) => void;
  onMenu: (c: FeedCommentView) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const now = new Date();
  return (
    <View style={styles.row} testID="feed-comment">
      <Avatar url={comment.author.avatarUrl} pseudo={comment.author.pseudo} size={28} />
      <View style={styles.body}>
        <Text variant="body" color={c.ink} style={styles.head}>
          <Text variant="bodyStrong" color={c.ink} style={styles.pseudo}>
            {comment.author.pseudo}
          </Text>
          <Text variant="caption" color={c.inkMuted} style={styles.age}>
            {`  ${feedAgo(comment.createdAt, now)}`}
          </Text>
        </Text>
        <MentionText text={comment.text} mentions={comment.mentions} />
        <View style={styles.acts}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={L.fireOnComment}
            accessibilityState={{ selected: comment.reactedByMe }}
            onPress={() => onFire(comment)}
            style={[
              styles.fire,
              comment.reactedByMe ? { backgroundColor: c.accentSoft } : { borderWidth: 1.5, borderColor: c.line },
            ]}
            testID="feed-comment-fire"
          >
            <Icon name="fire" size={15} color={comment.reactedByMe ? c.accentText : c.ink} />
            <Text variant="bodyStrong" color={c.ink} style={styles.fireText} testID="feed-comment-fire-count">
              {String(comment.reactionsCount)}
            </Text>
          </Pressable>
          {reply ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={() => onReply?.(comment)}
              hitSlop={6}
              style={styles.replyBtn}
              testID="feed-comment-reply"
            >
              <Icon name="chat" size={15} color={c.inkMuted} />
              <Text variant="bodyStrong" color={c.inkMuted} style={styles.replyText}>
                {L.reply}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={L.more}
        onPress={() => onMenu(comment)}
        hitSlop={6}
        style={styles.dots}
        testID="feed-comment-more"
      >
        <Icon name="more" size={20} color={c.inkMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  head: { fontSize: 13.5, lineHeight: 18 },
  pseudo: { fontSize: 13.5 },
  age: { fontSize: 11.5 },
  acts: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  fire: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: tokens.radius.radiusPill,
  },
  fireText: { fontSize: 12 },
  replyBtn: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 30 },
  replyText: { fontSize: 12 },
  dots: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -space2,
  },
});
