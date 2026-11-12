// Carte « publication » : photo(s) au format de la publication (4:5, 1:1, paysage), légende, auteur (son pseudo ouvre son
// profil), voiture et événement, flamme avec son compteur, « ⋯ ». Le bandeau « Collaboration commerciale » (lot R7m2)
// est en tête de la carte, avant l'en-tête.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import type { FeedPostView } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { FoldedCaption } from "@/features/publications/FoldedCaption";
import { Avatar } from "@/ui/Avatar";
import { CoAuthorSignature, collaborationLine, InviteStatusLine, TwoAvatars } from "../CoAuthorHead";
import { FeedPhotos } from "../FeedPhotos";
import { useFilOffline } from "../offlineContext";
import { noteSeen } from "../seenTracker";
import { AttachLine, AttachSeeButton } from "./AttachLine";
import { CardShell } from "./CardShell";
import { CommercialBadge } from "./CommercialBadge";
import { LastComments } from "./LastComments";
import { PostActions } from "./PostActions";
import { reasonLine } from "./parts";
import type { CardProps } from "./types";

export function FeedPostCard({ card, onMenu, faded }: CardProps<"feed_post">) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const post: FeedPostView = card.payload.post;
  // Collaboration (R8o) : acceptée, la carte est signée des deux (« Kenji_66 et Wrap 66 »), sous la ligne « Collaboration ».
  const co = post.coAuthor;
  const offline = useFilOffline();
  return (
    <CardShell
      card={card}
      head={
        co ? (
          <TwoAvatars author={post.author} coAuthor={co} />
        ) : (
          <Avatar url={post.author.avatarUrl} pseudo={post.author.pseudo} size={38} />
        )
      }
      title={co ? `${post.author.name} et ${co.name}` : post.author.pseudo}
      titleNode={co ? <CoAuthorSignature author={post.author} coAuthor={co} /> : undefined}
      reason={co ? collaborationLine(card) : reasonLine(card)}
      onMenu={onMenu}
      onTitle={post.mine ? undefined : () => router.push(`/u/${encodeURIComponent(post.author.pseudo)}`)}
      faded={faded}
      banner={<CommercialBadge partner={post.commercialPartner} />}
      testID="feed-card-feed_post"
      actions={
        <>
          <PostActions
            post={post}
            offline={offline}
            onShared={() => noteSeen(card.id, "share")}
            onOpened={() => noteSeen(card.id, "open")}
          />
          {post.attach ? <AttachSeeButton attach={post.attach} /> : null}
        </>
      }
    >
      {/* Lot R8c2 : l'événement rattaché est la deuxième ligne de la carte, sous l'auteur ; toute la ligne ouvre la fiche. */}
      {post.attach ? <AttachLine attach={post.attach} /> : null}
      {post.coAuthorInvite ? <InviteStatusLine invite={post.coAuthorInvite} /> : null}
      <FeedPhotos post={post} />
      {post.caption ? <FoldedCaption text={post.caption} style={styles.text} testID="feed-post-caption" /> : null}
      {post.vehicle || (post.event && !post.attach) ? (
        <View style={styles.pills}>
          {post.vehicle ? (
            <View style={[styles.pill, { backgroundColor: c.ground }]} testID="feed-post-vehicle">
              <Icon name="vehicle" size={14} color={c.inkMuted} />
              <Text variant="caption" color={c.ink} style={styles.pillText}>
                {post.vehicle.label}
              </Text>
            </View>
          ) : null}
          {post.event && !post.attach ? (
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
      <LastComments post={post} />
    </CardShell>
  );
}

const { space1 } = tokens.spacing;
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
});
