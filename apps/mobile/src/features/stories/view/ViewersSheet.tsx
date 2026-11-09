// « Vues · 12 » : la liste de ceux qui ont vu ma story (`GET /me/stories/:id/viewers`), pour moi seul, avec ceux que j'ai
// identifiés. Une panne n'est jamais une liste vide : message et « Réessayer ». Les avatars viennent de l'API (publics).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  feedAgo,
  storyViewerLabels as L,
  STORY_VIEWERS_MAX,
  type StoryView,
  viewersListPartial,
  viewersTotal,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import type { StoryViewers } from "@/lib/api/stories";
import { now } from "@/lib/clock";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";

const { space2, space3 } = tokens.spacing;

export function ViewersSheet({
  story,
  onClose,
  onProfile,
}: {
  /** `null` : fermée. */
  story: StoryView | null;
  onClose: () => void;
  onProfile: (pseudo: string) => void;
}) {
  const { t } = useTheme();
  const [data, setData] = useState<StoryViewers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const id = story?.id ?? null;
  const total = viewersTotal(story?.viewsCount, data?.viewers.length);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` relance la lecture (Réessayer).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .storyViewers(id)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e) || L.viewsError);
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  return (
    <AppSheet visible={Boolean(story)} onClose={onClose} accessibilityLabel={L.viewsTitle}>
      <View style={styles.head}>
        <Text variant="posterM" color={t.color.ink} style={styles.title} accessibilityRole="header">
          {L.views(total)}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={L.close}
          hitSlop={6}
          style={[styles.closex, { backgroundColor: t.color.surface }]}
          testID="story-viewers-close"
        >
          <Icon name="close" size={20} color={t.color.ink} />
        </Pressable>
      </View>
      {viewersListPartial(total) ? (
        <Text variant="caption" color={t.color.inkMuted} testID="story-viewers-partial">
          {L.viewsPartial(STORY_VIEWERS_MAX)}
        </Text>
      ) : null}
      {error ? (
        <View style={styles.state} testID="story-viewers-error">
          <Text variant="body" color={t.color.ink}>
            {error}
          </Text>
          <SmButton kind="s" icon="undo" onPress={() => setAttempt((n) => n + 1)}>
            {L.retry}
          </SmButton>
        </View>
      ) : data && data.viewers.length === 0 ? (
        <Text variant="body" color={t.color.inkMuted} testID="story-viewers-empty">
          {L.viewsEmpty}
        </Text>
      ) : (
        <View style={styles.list} testID="story-viewers">
          {(data?.viewers ?? []).map((v) => (
            <Pressable
              key={v.userId}
              onPress={() => onProfile(v.pseudo)}
              accessibilityRole="button"
              accessibilityLabel={`${v.pseudo}, ${feedAgo(v.viewedAt, now())}`}
              style={styles.row}
              testID={`story-viewer-${v.pseudo}`}
            >
              <Avatar url={v.avatarUrl} pseudo={v.pseudo} size={36} />
              <Text variant="bodyStrong" color={t.color.ink} style={styles.name}>
                {v.pseudo}
              </Text>
              <Text variant="caption" color={t.color.inkMuted}>
                {feedAgo(v.viewedAt, now())}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {story && story.tags.length > 0 ? (
        <View style={styles.tags} testID="story-viewers-tags">
          <Text variant="label" color={t.color.inkMuted}>
            {L.tags}
          </Text>
          <View style={styles.tagRow}>
            {story.tags.map((tag) => (
              <Text key={`${tag.kind}:${tag.id}`} variant="bodyStrong" color={t.color.ink}>
                @{tag.name}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: space2 },
  title: { flex: 1, fontSize: 20, lineHeight: 22 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  state: { gap: space3 },
  list: { gap: space2 },
  row: { flexDirection: "row", alignItems: "center", gap: space3, minHeight: 44 },
  name: { flex: 1 },
  tags: { gap: space2 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: space3 },
});
