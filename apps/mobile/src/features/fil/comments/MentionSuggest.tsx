// La liste des personnes proposées après « @ » (maquette R8.3 `.r8sugg`) : avatar, pseudo, et la raison. Toucher insère `@pseudo `.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedCommentScreenLabels as L, type MentionSuggestion } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/ui/Avatar";

export function MentionSuggest({
  items,
  onPick,
}: {
  items: readonly MentionSuggestion[];
  onPick: (pseudo: string) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  if (items.length === 0) return null;
  return (
    <View
      style={[styles.list, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      accessibilityLabel={L.mentionList}
      testID="feed-mention-suggestions"
    >
      {items.map((s, i) => (
        <Pressable
          key={s.pseudo}
          accessibilityRole="button"
          accessibilityLabel={`${s.pseudo}, ${L.mentionWhy[s.why]}`}
          onPress={() => onPick(s.pseudo)}
          style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}
          testID="feed-mention-suggestion"
        >
          <Avatar url={s.avatarUrl} pseudo={s.pseudo} size={28} />
          <View style={styles.text}>
            <Text variant="bodyStrong" color={c.ink} style={styles.pseudo}>
              {s.pseudo}
            </Text>
            <Text variant="caption" color={c.inkMuted} style={styles.why}>
              {L.mentionWhy[s.why]}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: 14, overflow: "hidden" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  text: { flex: 1, minWidth: 0 },
  pseudo: { fontSize: 14 },
  why: { fontSize: 12 },
});
