// Une ligne de l'Activité (lot R7c2, maquette R7.2 `.r7act`) : à gauche les avatars (un seul grand, ou jusqu'à trois
// empilés pour une ligne regroupée), sinon une pastille d'icône ; au milieu la phrase (« Kenji_66 et 4 autres ont aimé ta
// story », les noms en gras) et le moment ; une pastille moutarde tant que la ligne n'est pas lue. Les lignes d'une
// période sont posées dans une seule carte, séparées d'un trait.
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type ActivityItem, activityWhen, groupedTitle } from "@orasso/shared";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { now } from "@/lib/clock";
import { Avatar } from "@/ui/Avatar";

const { space2, space3 } = tokens.spacing;

/** L'icône d'une ligne sans personne (une notification du système, d'un événement, d'un vote…). */
export function iconOfType(type: string): IconName {
  if (type.startsWith("vote_")) return "trophy";
  if (type.startsWith("partner")) return "briefcase";
  if (type.startsWith("spot_meetup")) return "place";
  if (type === "schedule_change" || type === "event_updated" || type === "event_cancelled") return "calendar";
  if (type === "presence_validated" || type === "application_accepted") return "check";
  if (type.includes("stamp")) return "stamp";
  if (type === "memory") return "spark";
  return "bell";
}

/** Avatars empilés (`.tz-avs`) : trois au plus, chacun chevauche le précédent. */
function Avatars({ item }: { item: ActivityItem }) {
  const { t } = useTheme();
  const c = t.color;
  const actors = item.actors;
  if (actors.length === 0) {
    return (
      <View style={[styles.icon, { backgroundColor: c.surfaceRaised }]}>
        <Icon name={iconOfType(item.type)} size={20} color={c.ink} />
      </View>
    );
  }
  if (actors.length === 1 || item.count <= 1) {
    const a = actors[0];
    return <Avatar url={a?.avatarUrl} pseudo={a?.pseudo} size={40} />;
  }
  return (
    <View style={[styles.stack, { width: 40 + (actors.length - 1) * 14 }]} accessibilityElementsHidden>
      {actors.map((a, i) => (
        <View
          key={a.pseudo}
          style={[styles.stacked, { left: i * 14, zIndex: actors.length - i, borderColor: c.surface }]}
        >
          <Avatar url={a.avatarUrl} pseudo={a.pseudo} size={30} />
        </View>
      ))}
    </View>
  );
}

/**
 * La ligne. `actions` : boutons sous la phrase (la ligne d'une identification de story y pose « Retirer » et
 * « Repartager », lot R7h : `rows/StoryMention.tsx`). Toucher la ligne la marque lue et ouvre son lien, s'il y en a un.
 */
export function ActivityLine({
  item,
  day,
  onPress,
  actions,
  testID = "activity-row",
}: {
  item: ActivityItem;
  day: "today" | "week" | "earlier";
  onPress?: () => void;
  actions?: ReactNode;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const { names, rest } = groupedTitle(item.title, item.actors, item.count);
  // Une ligne avec des personnes : la phrase seule (le corps répète le titre). Sans personne : titre en gras, puis le corps.
  const phrase = names ? (
    <Text variant="body" color={c.ink}>
      <Text variant="bodyStrong" color={c.ink}>
        {names}
      </Text>
      {rest}
    </Text>
  ) : (
    <Text variant="body" color={c.ink}>
      <Text variant="bodyStrong" color={c.ink}>
        {item.title}
      </Text>
      {item.body ? ` · ${item.body}` : ""}
    </Text>
  );
  const when = activityWhen(new Date(item.latestAt), now(), day);
  return (
    <View testID={testID}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? "link" : undefined}
        accessibilityLabel={`${names ? `${names}${rest}` : item.title}, ${when}${item.read ? "" : ", non lu"}`}
        style={styles.row}
      >
        <Avatars item={item} />
        <View style={styles.text}>
          {phrase}
          <Text variant="caption" color={c.inkMuted}>
            {when}
          </Text>
        </View>
        {item.read ? null : (
          <View
            style={[styles.dot, { backgroundColor: c.accent }]}
            testID="activity-unread"
            accessibilityElementsHidden
          />
        )}
      </Pressable>
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space3, paddingVertical: space3, paddingHorizontal: space3 },
  text: { flex: 1, gap: 2 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stack: { height: 40, justifyContent: "center" },
  stacked: { position: "absolute", borderWidth: 2, borderRadius: 16, top: 5 },
  dot: { width: 10, height: 10, borderRadius: 5, marginLeft: space2 },
});
