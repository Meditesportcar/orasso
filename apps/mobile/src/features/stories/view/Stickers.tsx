// Légende, lieu, voiture, événement et identifiés d'une story (maquette R7.7 `.r7svc2`) : la légende sur une pastille sombre,
// des autocollants crème arrondis. La voiture est une carte masquée (sa photo n'est jamais montrée ici, `vehicle.photoUrl`
// vient de l'API déjà masquée) touchable vers sa fiche ; l'événement mène à sa fiche ; un identifié (`@pseudo`) à son profil.
// Les noms ne se coupent jamais : l'autocollant passe à la ligne plutôt que de tronquer un nom de véhicule.
import { Icon, type IconName, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { storyViewerLabels as L, type StoryTagView, type StoryView } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

const { space1, space2 } = tokens.spacing;

function Sticker({
  icon,
  label,
  onPress,
  accessibilityLabel,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const body = (
    <>
      <Icon name={icon} size={15} color={c.night} />
      <Text variant="bodyStrong" color={c.night} style={styles.stickerText}>
        {label}
      </Text>
    </>
  );
  const style = [styles.sticker, { backgroundColor: c.nightInk }];
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={4}
      style={style}
      testID={testID}
    >
      {body}
    </Pressable>
  ) : (
    <View style={style} testID={testID}>
      {body}
    </View>
  );
}

export function Stickers({
  story,
  onVehicle,
  onEvent,
  onTag,
}: {
  story: StoryView;
  onVehicle: (id: string) => void;
  onEvent: (slug: string) => void;
  onTag: (tag: StoryTagView) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.wrap} pointerEvents="box-none" testID="story-stickers">
      {story.caption ? (
        <View style={[styles.caption, { backgroundColor: withAlpha(c.night, 0.72) }]} pointerEvents="none">
          <Text variant="bodyStrong" color={c.nightInk} style={styles.captionText} testID="story-caption">
            {story.caption}
          </Text>
        </View>
      ) : null}
      <View style={styles.row} pointerEvents="box-none">
        {story.vehicle ? (
          <Sticker
            icon="vehicle"
            label={story.vehicle.label}
            onPress={() => story.vehicle && onVehicle(story.vehicle.id)}
            accessibilityLabel={L.car(story.vehicle.label)}
            testID="story-sticker-vehicle"
          />
        ) : null}
        {story.event ? (
          <Sticker
            icon="ticket"
            label={story.event.title}
            onPress={() => story.event && onEvent(story.event.slug)}
            accessibilityLabel={L.event(story.event.title)}
            testID="story-sticker-event"
          />
        ) : null}
        {story.placeLabel ? <Sticker icon="place" label={story.placeLabel} testID="story-sticker-place" /> : null}
        {story.tags.map((tag) => (
          <Sticker
            key={`${tag.kind}:${tag.id}`}
            icon="profile"
            label={`@${tag.name}`}
            onPress={() => onTag(tag)}
            accessibilityLabel={L.tagged(tag.name)}
            testID={`story-tag-${tag.name}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "flex-start", gap: space2 },
  caption: {
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  captionText: { fontFamily: "Archivo-ExtraBold", fontSize: 16, lineHeight: 21 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2, alignItems: "flex-start" },
  sticker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 30,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: space1 / 2,
    borderRadius: 999,
  },
  stickerText: { flexShrink: 1, fontFamily: "Archivo-ExtraBold", fontSize: 12.5, lineHeight: 16 },
});
