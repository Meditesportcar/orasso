// Carte liée d'une story (lot R7f4) : la carte posée sur le fond fait partie de l'image ; ce bouton la rend touchable (« Voir
// l'événement », « Voir la voiture », « Voir le classement »…). `story.linked` est refiltré par l'API à chaque lecture : un
// contenu supprimé ou devenu privé donne `null`, la carte est alors inerte et rien ne s'affiche ici.
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import type { StoryView } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

const ICON: Record<string, IconName> = {
  event: "ticket",
  vehicle: "vehicle",
  feed_post: "feed",
  memory: "stamp",
  vote_result: "trophy",
};

export function LinkedCard({ story }: { story: StoryView }) {
  const { t } = useTheme();
  const router = useRouter();
  const l = story.linked;
  if (!l) return null;
  const mine = story.viewsCount !== null;
  const open = () => {
    if (l.type === "event" && l.slug) router.push(`/e/${l.slug}`);
    else if (l.type === "vehicle") router.push(mine ? `/vehicule/${l.id}` : `/v/${l.id}`);
    else if (l.type === "vote_result" && l.eventId)
      router.push({ pathname: "/vote/[id]", params: { id: l.eventId, vote: l.id, titre: l.title ?? "" } });
    else if (l.type === "memory" && l.eventId) router.push(`/souvenir/${l.eventId}`);
    else if (l.type === "feed_post") router.push("/fil");
  };
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={l.label}
        style={[styles.pill, { backgroundColor: t.color.nightInk }]}
        testID="story-linked"
      >
        <Icon name={ICON[l.type] ?? "next"} size={16} color={t.color.night} />
        <Text variant="bodyStrong" color={t.color.night}>
          {l.label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginBottom: tokens.spacing.space2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.space2,
    paddingHorizontal: tokens.spacing.space3,
    paddingVertical: 10,
    borderRadius: 999,
  },
});
