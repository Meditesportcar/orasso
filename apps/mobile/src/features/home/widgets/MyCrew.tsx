// Bloc « Mon crew » de l'Accueil (lot R7a2, maquette R7.4) : un raccourci vers l'onglet Crew. Le crew le plus récemment
// actif : son nom, ses membres, ses messages non lus ; la dernière publication de son fil (le texte, ou « Photo », jamais
// l'image) ; sa prochaine sortie ; la Discussion. Toucher la carte ouvre l'onglet Crew.
import { Icon, initialsOf, Text, tokens, useTheme } from "@orasso/design-system/native";
import { BUSINESS_TIMEZONE, type HomeMyCrew, homeBlockLabels } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/ui/Avatar";
import { CrewDot, SmButton } from "@/ui/Kit";
import { agoLabel } from "../ago";
import { SecH } from "../fanBlocks";

const { space2, space3 } = tokens.spacing;

const OUTING_DAY = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: BUSINESS_TIMEZONE,
});

export function MyCrew({
  data,
  now,
  onOpenTab,
  onDiscussion,
}: {
  data: HomeMyCrew;
  now: Date;
  onOpenTab: () => void;
  onDiscussion: (conversationId: string) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const { crew, lastPost, nextOuting } = data;
  const sub = [
    homeBlockLabels.crewMembers(crew.membersCount),
    data.unread > 0 ? homeBlockLabels.crewUnread(data.unread) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={styles.wrap} testID="home-my-crew">
      <SecH title={homeBlockLabels.crewTitle} link={homeBlockLabels.crewLink} onLink={onOpenTab} />
      <Pressable
        onPress={onOpenTab}
        accessibilityRole="link"
        accessibilityLabel={`${crew.name}, ${sub}. Ouvrir l'onglet Crew`}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard },
          pressed && styles.pressed,
        ]}
        testID="home-my-crew-card"
      >
        <View style={styles.head}>
          <CrewDot initials={initialsOf(crew.name).slice(0, 2)} size={44} />
          <View style={styles.fill}>
            <Text variant="bodyStrong" color={c.ink} style={styles.name}>
              {crew.name}
            </Text>
            <Text variant="caption" color={c.inkMuted}>
              {sub}
            </Text>
          </View>
        </View>
        {lastPost ? (
          <View style={[styles.post, { backgroundColor: c.surfaceSunken }]} testID="home-my-crew-post">
            <View style={styles.postHead}>
              <Avatar url={lastPost.author.avatarUrl} pseudo={lastPost.author.pseudo} size={30} />
              <Text variant="bodyStrong" color={c.ink} style={styles.fill}>
                {lastPost.author.pseudo}
              </Text>
            </View>
            <Text variant="body" color={c.ink} style={styles.postText}>
              {lastPost.text ?? homeBlockLabels.crewPhoto}
            </Text>
            <Text variant="caption" color={c.inkMuted}>
              {`${agoLabel(lastPost.createdAt, now)} · ${homeBlockLabels.crewReplies(lastPost.replies)}`}
            </Text>
          </View>
        ) : null}
        {nextOuting ? (
          <View style={styles.outing} testID="home-my-crew-outing">
            <Icon name="calendar" size={18} color={c.accentText} />
            <Text variant="caption" color={c.ink} style={styles.fill}>
              <Text variant="bodyStrong" color={c.ink} style={styles.outingLead}>
                {`${homeBlockLabels.crewNextOuting} : `}
              </Text>
              {`${OUTING_DAY.format(new Date(nextOuting.startsAt))}, ${nextOuting.title} · ${homeBlockLabels.crewGoing(nextOuting.going)}`}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {data.conversationId ? (
        <SmButton
          kind="s"
          icon="chat"
          wide
          onPress={() => data.conversationId && onDiscussion(data.conversationId)}
          testID="home-my-crew-discussion"
        >
          {homeBlockLabels.crewDiscussion}
        </SmButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 },
  fill: { flex: 1, minWidth: 0 },
  card: { borderRadius: 18, padding: 14, gap: space3 },
  pressed: { opacity: 0.9 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  name: { fontSize: 16, lineHeight: 20 },
  post: { borderRadius: 14, padding: 12, gap: 6 },
  postHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  postText: { fontSize: 14.5, lineHeight: 20 },
  outing: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  outingLead: { fontSize: 13, lineHeight: 18 },
});
