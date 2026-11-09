// « Mes publications » : `GET /me/feed-posts` (curseur), une ligne par publication (miniature, mot, date, flammes), et
// « Supprimer » (confirmé). Les photos viennent de la route privée (`FeedPhotos`). Une erreur n'est jamais une liste vide.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedPostView, feedAgo, feedScreenLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { confirmRemove } from "@/features/crews/feed/confirm";
import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";
import { Waiting } from "@/ui/Waiting";
import { FeedPhotos } from "./FeedPhotos";
import { forgetMyPublished, markFeedDirty } from "./feedSignal";

export function MyPostsScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<FeedPostView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const gate = useRef(createRequestGate(cacheScope)).current;

  const load = useCallback(async () => {
    const ticket = gate.start();
    try {
      const page = await api.myFeedPosts(null);
      if (!ticket.current()) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      if (ticket.current()) setError(errorMessage(e));
    }
  }, [gate]);
  useEffect(() => {
    void load();
  }, [load]);

  async function more() {
    if (!cursor) return;
    const ticket = gate.follow();
    try {
      const page = await api.myFeedPosts(cursor);
      if (!ticket.current()) return;
      setItems((list) => {
        const seen = new Set((list ?? []).map((p) => p.id));
        return [...(list ?? []), ...page.items.filter((p) => !seen.has(p.id))];
      });
      setCursor(page.nextCursor);
    } catch (e) {
      if (ticket.current()) setError(errorMessage(e));
    }
  }

  async function remove(post: FeedPostView) {
    if (!(await confirmRemove(L.removeConfirm))) return;
    try {
      await api.removeFeedPost(post.id);
      // La copie gardée en tête du Fil part aussi, et le Fil se relit à son retour : la carte n'y revient pas.
      forgetMyPublished(`feed_post:${post.id}`);
      markFeedDirty();
      setItems((list) => (list ?? []).filter((p) => p.id !== post.id));
      setNotice(L.removeDone);
    } catch (e) {
      setNotice(errorMessage(e));
    }
  }

  return (
    <FlowScreen
      title={L.mineTitle}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/reglages"))}
      onRefresh={load}
    >
      {items === null && !error ? <Waiting blocks={[260, 260]} testID="fil-mine-waiting" /> : null}
      {error && !items?.length ? <LoadError message={error} onRetry={() => void load()} /> : null}
      {items && items.length === 0 && !error ? (
        <View style={styles.empty} testID="fil-mine-empty">
          <Text variant="posterM" color={t.color.ink}>
            {L.mineEmpty}
          </Text>
          <Muted variant="body">{L.mineEmptyText}</Muted>
          <SmButton kind="p" big wide icon="camera" onPress={() => router.replace("/fil/publier")}>
            {L.publish}
          </SmButton>
        </View>
      ) : null}
      {notice ? (
        <Muted variant="caption" accessibilityRole="alert" testID="fil-mine-notice">
          {notice}
        </Muted>
      ) : null}
      {items?.map((post) => (
        <View
          key={post.id}
          style={[styles.card, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}
          testID="fil-mine-post"
        >
          <FeedPhotos post={post} />
          {post.caption ? (
            <Text variant="body" color={t.color.ink}>
              {post.caption}
            </Text>
          ) : null}
          <View style={styles.meta}>
            <Icon name="fire" size={16} color={t.color.inkMuted} />
            <Text variant="caption" color={t.color.inkMuted} style={styles.grow}>
              {post.reactionsCount} · {feedAgo(post.createdAt, now())}
            </Text>
            <SmButton kind="s" icon="trash" onPress={() => void remove(post)} testID="fil-mine-remove">
              {L.removePost}
            </SmButton>
          </View>
        </View>
      ))}
      {cursor ? (
        <SmButton kind="s" wide icon="down" onPress={() => void more()} testID="fil-mine-more">
          {L.loadMore}
        </SmButton>
      ) : null}
      {items?.length ? <Muted variant="caption">{L.mineNote}</Muted> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  empty: { gap: tokens.spacing.space3 },
  card: { gap: tokens.spacing.space2, padding: tokens.spacing.space3, borderRadius: tokens.radius.radiusLg },
  meta: { flexDirection: "row", alignItems: "center", gap: tokens.spacing.space2 },
  grow: { flex: 1 },
});
