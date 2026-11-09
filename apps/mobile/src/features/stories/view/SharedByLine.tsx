// « Story de Kenji_66, ajoutée par Roues Libres 66 » (maquette R7.7 `.r7cred`) : le crédit d'une copie. Minimal dans le lot
// R7f2 (une ligne de texte) ; RÉSERVÉ au lot R7h, qui le complète (avatar de l'auteur d'origine, partage de l'organisateur).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { storyViewerLabels as L, type StoryView } from "@orasso/shared";
import { StyleSheet } from "react-native";

export function SharedByLine({ story, authorName }: { story: StoryView; authorName: string }) {
  const { t } = useTheme();
  if (!story.sharedFrom) return null;
  return (
    <Text
      variant="caption"
      color={t.color.nightInk}
      style={styles.line}
      accessibilityLabel={L.sharedBy(story.sharedFrom.authorPseudo, authorName)}
      testID="story-shared-by"
    >
      {L.sharedBy(story.sharedFrom.authorPseudo, authorName)}
    </Text>
  );
}

const styles = StyleSheet.create({ line: { paddingHorizontal: tokens.spacing.space1, opacity: 0.9 } });
