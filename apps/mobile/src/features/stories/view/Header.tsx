// L'en-tête de la visionneuse (maquette R7.7 `.r7svh`) : avatar rond cerclé, nom, « il y a 3 h · pour ses abonnés » ou le
// bandeau rouge brique « Mon crew · Roussillon Drift » (story de crew), « ⋯ » et ✕. Toucher l'avatar ou le nom ouvre le
// profil d'une personne. Toujours sur fond sombre : texte `nightInk`, quel que soit le thème.
import { Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedAgo, storyViewerLabels as L, type StoryView } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { now } from "@/lib/clock";
import { mediaSource } from "@/lib/media";

const { space1, space2 } = tokens.spacing;

export function Header({
  story,
  name,
  avatarUrl,
  mine,
  live = false,
  onProfile,
  onMore,
  onClose,
}: {
  story: StoryView;
  name: string;
  avatarUrl: string | null;
  mine: boolean;
  /** Lot R7h : l'organisateur d'un événement en cours porte l'étiquette « EN COURS » (maquette `.r7lvs`). */
  live?: boolean;
  /** Ouvre le profil de l'auteur (une personne) ; absent pour une structure ou un pro. */
  onProfile?: () => void;
  onMore: () => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const crew = story.audience === "crew";
  const source = mediaSource(avatarUrl);
  const ago = feedAgo(story.createdAt, now());
  const audience = story.audience === "public" ? L.forPublic : mine ? L.forFollowersMine : L.forFollowers;
  const who = (
    <>
      <View style={[styles.ring, { borderColor: crew ? c.win : c.nightInk }]}>
        <View style={[styles.face, { backgroundColor: c.win }]}>
          {source ? (
            <Photo source={source} style={styles.img} />
          ) : (
            <Text variant="posterL" color={c.winInk} style={styles.initial}>
              {name.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong" color={c.nightInk} style={styles.name} testID="story-author">
          {name}
        </Text>
        <View style={styles.sub}>
          {live ? (
            <View style={[styles.live, { backgroundColor: c.accent }]} testID="story-live-badge">
              <Text variant="meta" color={c.accentInk} style={styles.liveText}>
                {L.live}
              </Text>
            </View>
          ) : null}
          {crew ? (
            <View style={[styles.crew, { backgroundColor: c.win }]} testID="story-crew-badge">
              <Icon name="shield" size={13} color={c.winInk} />
              <Text variant="caption" color={c.winInk} style={styles.crewText}>
                {L.crewBadge(story.crewName ?? "")}
              </Text>
            </View>
          ) : null}
          <Text variant="caption" color={c.nightInk} style={styles.when} testID="story-when">
            {crew ? ago : `${ago} · ${audience}`}
          </Text>
        </View>
      </View>
    </>
  );
  return (
    <View style={styles.row}>
      {onProfile ? (
        <Pressable
          onPress={onProfile}
          accessibilityRole="button"
          accessibilityLabel={L.tagged(name)}
          style={styles.who}
          testID="story-author-open"
        >
          {who}
        </Pressable>
      ) : (
        <View style={styles.who}>{who}</View>
      )}
      <Pressable
        onPress={onMore}
        accessibilityRole="button"
        accessibilityLabel={L.more}
        hitSlop={6}
        style={styles.btn}
        testID="story-more"
      >
        <Icon name="more" size={22} color={c.nightInk} />
      </Pressable>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={L.close}
        hitSlop={6}
        style={styles.btn}
        testID="story-close"
      >
        <Icon name="close" size={22} color={c.nightInk} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space2 },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: space2 },
  ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, padding: 2 },
  face: { flex: 1, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  img: { width: 34, height: 34 },
  initial: { fontSize: 12, lineHeight: 14 },
  text: { flex: 1, gap: 1 },
  name: { fontSize: 14, lineHeight: 17 },
  sub: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2 },
  when: { fontSize: 12, lineHeight: 15, opacity: 0.85 },
  crew: {
    flexDirection: "row",
    alignItems: "center",
    gap: space1,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  live: { height: 17, paddingHorizontal: 6, borderRadius: 4, justifyContent: "center" },
  liveText: { fontSize: 9.5, lineHeight: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  crewText: { fontFamily: "Archivo-ExtraBold", fontSize: 11.5, lineHeight: 14 },
  btn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
