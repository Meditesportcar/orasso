// « Story de Kenji_66, ajoutée par Roues Libres 66 » (maquette R7.7 `.r7cred`) : le crédit d'une copie. Toucher le nom de
// l'auteur d'origine ouvre son profil (lot R7h) ; la ligne reste lisible sans le geste (texte seul).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { storyViewerLabels as L, type StoryView } from "@orasso/shared";
import { Pressable, StyleSheet } from "react-native";

export function SharedByLine({
  story,
  authorName,
  onProfile,
}: {
  story: StoryView;
  authorName: string;
  onProfile?: (pseudo: string) => void;
}) {
  const { t } = useTheme();
  if (!story.sharedFrom) return null;
  const pseudo = story.sharedFrom.authorPseudo;
  const text = L.sharedBy(pseudo, authorName);
  return (
    <Pressable
      onPress={onProfile && pseudo ? () => onProfile(pseudo) : undefined}
      disabled={!onProfile || !pseudo}
      accessibilityRole={onProfile && pseudo ? "link" : "text"}
      accessibilityLabel={text}
      hitSlop={8}
      style={styles.line}
      testID="story-shared-by"
    >
      <Text variant="caption" color={t.color.nightInk} style={styles.text}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: { paddingHorizontal: tokens.spacing.space1 },
  text: { opacity: 0.9 },
});
