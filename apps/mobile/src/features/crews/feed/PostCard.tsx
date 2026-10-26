// Une entrée du fil du crew (lot R5c1, maquette R5.7 `.r5post` et `.r5auto`) : publication (auteur, photos au format
// d'origine, texte, véhicule, sortie, sondage, flamme et commentaires) ou événement automatique (un membre arrive, le
// crew est retenu à un événement).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type CrewFeedItem, type CrewPostView, crewFeedLabels, crewFeedWhen, gradeLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { now } from "@/lib/clock";
import { formatDay } from "@/lib/format";
import { Avatar } from "@/ui/Avatar";

import { PollBlock } from "./PollBlock";
import { PostPhotos } from "./PostPhotos";

const { space1, space2, space3 } = tokens.spacing;

export const whenOf = (iso: string) => crewFeedWhen(new Date(iso), now(), formatDay(iso));

export function PostCard({
  post,
  busy,
  onFire,
  onComments,
  onMenu,
  onVote,
}: {
  post: CrewPostView;
  busy: boolean;
  onFire: () => void;
  onComments: () => void;
  onMenu: () => void;
  onVote: (optionId: string) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const pseudo = post.author?.pseudo ?? crewFeedLabels.deletedAccount;
  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      testID="crew-post"
      accessibilityLabel={post.kind === "poll" ? crewFeedLabels.pollBy(pseudo) : pseudo}
    >
      <View style={styles.head}>
        <Avatar url={post.author?.avatarUrl} pseudo={pseudo} size={38} />
        <View style={styles.grow}>
          <Text variant="bodyStrong" color={c.ink} style={styles.pseudo}>
            {pseudo}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {whenOf(post.createdAt)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={crewFeedLabels.more}
          onPress={onMenu}
          hitSlop={6}
          style={styles.dots}
          testID="crew-post-more"
        >
          <Icon name="more" size={20} color={c.inkMuted} />
        </Pressable>
      </View>

      {post.photos.length ? <PostPhotos photos={post.photos} pseudo={pseudo} /> : null}
      {post.text ? (
        <Text variant="body" color={c.ink} style={styles.text} testID="crew-post-text">
          {post.text}
        </Text>
      ) : null}
      {post.poll ? <PollBlock poll={post.poll} busy={busy} onVote={onVote} /> : null}
      {post.vehicle || post.event ? (
        <View style={styles.pills}>
          {post.vehicle ? (
            <View style={[styles.pill, { backgroundColor: c.ground }]} testID="crew-post-vehicle">
              <Icon name={post.vehicle.vehicleType === "moto" ? "moto" : "vehicle"} size={14} color={c.inkMuted} />
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
            >
              <Icon name="calendar" size={14} color={c.inkMuted} />
              <Text variant="caption" color={c.ink} style={styles.pillText}>
                {post.event.title}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.rx}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: post.firedByMe, disabled: busy }}
          accessibilityLabel={
            post.firedByMe ? crewFeedLabels.fireOn(post.firesCount) : crewFeedLabels.fireOff(post.firesCount)
          }
          onPress={onFire}
          disabled={busy}
          style={[styles.rxBtn, { backgroundColor: post.firedByMe ? c.accent : c.ground }]}
          testID="crew-post-fire"
        >
          <Icon name="fire" size={17} color={post.firedByMe ? c.accentInk : c.ink} />
          <Text variant="bodyStrong" color={post.firedByMe ? c.accentInk : c.ink} style={styles.rxText}>
            {String(post.firesCount)}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={crewFeedLabels.openComments(post.commentsCount)}
          onPress={onComments}
          style={[styles.rxBtn, { backgroundColor: c.ground }]}
          testID="crew-post-comments"
        >
          <Icon name="chat" size={17} color={c.ink} />
          <Text variant="bodyStrong" color={c.ink} style={styles.rxText}>
            {String(post.commentsCount)}
          </Text>
        </Pressable>
        <Text variant="caption" color={c.inkMuted} style={styles.rxCap}>
          {crewFeedLabels.commentsCount(post.commentsCount)}
        </Text>
      </View>
    </View>
  );
}

/** Événement automatique : un membre arrive, le crew est retenu à un événement. */
export function AutoCard({ item }: { item: Exclude<CrewFeedItem, { type: "post" }> }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const body =
    item.type === "member_joined" ? (
      <>
        <Text variant="bodyStrong" color={c.ink} style={styles.autoTitle}>
          {crewFeedLabels.autoJoined(item.person.pseudo)}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {[item.vehicleLabel, `grade ${gradeLabels[item.person.grade]}`, whenOf(item.at)].filter(Boolean).join(" · ")}
        </Text>
      </>
    ) : (
      <>
        <Text variant="bodyStrong" color={c.ink} style={styles.autoTitle}>
          {crewFeedLabels.autoAccepted(item.event.title)}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {[crewFeedLabels.autoAcceptedMembers(item.members), formatDay(item.event.startsAt)].join(" · ")}
        </Text>
      </>
    );
  const icon = item.type === "member_joined" ? "crew" : "ticket";
  const content = (
    <>
      <View style={[styles.autoIcon, { backgroundColor: c.surfaceSunken }]}>
        <Icon name={icon} size={20} color={c.accentText} />
      </View>
      <View style={styles.grow}>{body}</View>
    </>
  );
  const box = [styles.auto, { backgroundColor: c.surface, borderColor: c.line }];
  if (item.type === "crew_accepted") {
    return (
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(`/e/${item.event.slug}`)}
        style={box}
        testID="crew-auto"
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={box} testID="crew-auto">
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space2 + 2, padding: space3, borderRadius: tokens.radius.radiusLg },
  head: { flexDirection: "row", alignItems: "center", gap: space2 + 2 },
  grow: { flex: 1, minWidth: 0 },
  pseudo: { fontSize: 14, lineHeight: 17 },
  dots: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
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
  rx: { flexDirection: "row", alignItems: "center", gap: 6 },
  rxBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: space3,
    borderRadius: tokens.radius.radiusPill,
  },
  rxText: { fontSize: 13 },
  rxCap: { marginLeft: "auto" },
  auto: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderRadius: tokens.radius.radiusLg - 2,
    borderWidth: 1.5,
  },
  autoIcon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.radiusMd,
    alignItems: "center",
    justifyContent: "center",
  },
  autoTitle: { fontSize: 13.5, lineHeight: 17 },
});
