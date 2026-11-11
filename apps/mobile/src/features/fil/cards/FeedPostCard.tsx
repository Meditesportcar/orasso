// Carte « publication » : photo(s) au format de la publication (4:5, 1:1, paysage), légende, auteur (son pseudo ouvre son
// profil), voiture et événement, flamme avec son compteur, « ⋯ ». Le bandeau « Collaboration commerciale » (lot R7m2)
// est en tête de la carte, avant l'en-tête.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedPostView, feedScreenLabels as L, shareLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { FoldedCaption } from "@/features/publications/FoldedCaption";
import { ShareSheet } from "@/features/share/ShareSheet";
import { api } from "@/lib/api";
import { Avatar } from "@/ui/Avatar";
import { FeedPhotos } from "../FeedPhotos";
import { CardShell } from "./CardShell";
import { CommercialBadge } from "./CommercialBadge";
import { reasonLine } from "./parts";
import type { CardProps } from "./types";

export function FeedPostCard({ card, onMenu, faded }: CardProps<"feed_post">) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const post: FeedPostView = card.payload.post;
  // Flamme : la réponse de l'API fait foi ; en attendant, le compteur bouge tout de suite (annulé si l'envoi échoue).
  const [fire, setFire] = useState({ count: post.reactionsCount, on: post.reactedByMe });
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => setFire({ count: post.reactionsCount, on: post.reactedByMe }),
    [post.reactionsCount, post.reactedByMe],
  );

  async function toggle() {
    if (busy) return;
    const before = fire;
    const on = !before.on;
    setBusy(true);
    setFire({ count: Math.max(0, before.count + (on ? 1 : -1)), on });
    try {
      const res = await api.fireFeedPost(post.id, on);
      if (mounted.current) setFire({ count: res.reactionsCount, on: res.reactedByMe });
    } catch {
      if (mounted.current) setFire(before);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <CardShell
      card={card}
      head={<Avatar url={post.author.avatarUrl} pseudo={post.author.pseudo} size={38} />}
      title={post.author.pseudo}
      reason={reasonLine(card)}
      onMenu={onMenu}
      onTitle={post.mine ? undefined : () => router.push(`/u/${encodeURIComponent(post.author.pseudo)}`)}
      faded={faded}
      banner={<CommercialBadge partner={post.commercialPartner} />}
      testID="feed-card-feed_post"
      actions={
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: fire.on, disabled: busy }}
            accessibilityLabel={L.fireLabel(fire.count, fire.on)}
            onPress={toggle}
            style={[styles.fire, { backgroundColor: fire.on ? c.accentSoft : c.ground }]}
            testID="feed-post-fire"
          >
            <Icon name="fire" size={17} color={fire.on ? c.accentText : c.ink} />
            <Text variant="bodyStrong" color={c.ink} style={styles.fireText} testID="feed-post-fire-count">
              {String(fire.count)}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shareLabels.title}
            onPress={() => setSharing(true)}
            style={[styles.fire, { backgroundColor: c.ground }]}
            testID="feed-post-share"
          >
            <Icon name="share" size={17} color={c.ink} />
          </Pressable>
        </>
      }
    >
      <ShareSheet visible={sharing} onClose={() => setSharing(false)} target={{ type: "feed_post", id: post.id }} />
      <FeedPhotos post={post} />
      {post.caption ? <FoldedCaption text={post.caption} style={styles.text} testID="feed-post-caption" /> : null}
      {post.vehicle || post.event ? (
        <View style={styles.pills}>
          {post.vehicle ? (
            <View style={[styles.pill, { backgroundColor: c.ground }]} testID="feed-post-vehicle">
              <Icon name="vehicle" size={14} color={c.inkMuted} />
              <Text variant="caption" color={c.ink} style={styles.pillText}>
                {post.vehicle.label}
              </Text>
            </View>
          ) : null}
          {post.event ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={post.event.title}
              onPress={() => router.push(`/e/${post.event?.slug}`)}
              style={[styles.pill, { backgroundColor: c.ground }]}
              testID="feed-post-event"
            >
              <Icon name="calendar" size={14} color={c.inkMuted} />
              <Text variant="caption" color={c.ink} style={styles.pillText}>
                {post.event.title}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </CardShell>
  );
}

const { space1, space3 } = tokens.spacing;
const styles = StyleSheet.create({
  text: { fontSize: 14, lineHeight: 20 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space1 + 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.radiusPill,
    maxWidth: "100%",
  },
  pillText: { fontFamily: "Archivo-ExtraBold", flexShrink: 1 },
  fire: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: space3,
    borderRadius: tokens.radius.radiusPill,
  },
  fireText: { fontSize: 13 },
});
