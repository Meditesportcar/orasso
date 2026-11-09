// « Publier » du Fil (lot R7f3, maquette R7.23 pour les deux lignes) : une feuille qui demande où publier, « En story » (une
// photo en 9:16, visible 24 h : `/story/publier`) ou « Dans le Fil » (une publication en 4:5, qui reste : `/fil/publier`).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { storyPublishLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Option } from "@/features/stories/publish/parts";
import { AppSheet } from "@/ui/AppSheet";

const { space2 } = tokens.spacing;

export function PublishChoice({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  const go = (path: "/story/publier" | "/fil/publier") => {
    onClose();
    router.push(path);
  };
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.chooseTitle}>
      <Text variant="title" color={t.color.ink}>
        {L.chooseTitle}
      </Text>
      <View style={styles.list}>
        <Option
          icon="camera"
          title={L.chooseStory}
          hint={L.chooseStoryHint}
          selected={false}
          role="button"
          onPress={() => go("/story/publier")}
          testID="fil-publish-choose-story"
        />
        <Option
          icon="feed"
          title={L.choosePost}
          hint={L.choosePostHint}
          selected={false}
          role="button"
          onPress={() => go("/fil/publier")}
          testID="fil-publish-choose-post"
        />
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({ list: { gap: space2 } });
