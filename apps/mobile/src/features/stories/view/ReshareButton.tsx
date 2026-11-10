// « Repartager dans ma story » (lot R7m2, maquette R7.21 côté pro) : le bouton principal de la visionneuse pour le pro cité en
// « Collaboration commerciale » (ou identifié). Reprend la story au nom de sa fiche : l'auteur est crédité et prévenu, la
// mention reste en tête. L'API décide de tout (`story.sharing`) : l'écran n'offre que ce qu'elle a dit possible.
import { partnershipLabels as L, storyShareLabels as S, type StoryView } from "@orasso/shared";
import { View } from "react-native";

import { SmButton } from "@/ui/Kit";

/** L'option « au nom de ma fiche pro » de la story, ou `undefined` (pas pro, pas cité, copie, story à moi). */
export const proShareOption = (story: StoryView) => story.sharing?.options.find((o) => o.as === "pro" && o.id);

export function ReshareButton({
  story,
  done,
  busy,
  onPress,
}: {
  story: StoryView;
  /** Repartagée pendant cette visite (la liste n'a pas encore été relue). */
  done: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const option = proShareOption(story);
  if (!option) return null;
  const already = done || Boolean(option.copyId);
  return (
    <View testID="story-reshare-box">
      <SmButton
        kind="p"
        big
        wide
        icon={already ? "check" : "share"}
        disabled={already || busy}
        onPress={onPress}
        testID="story-reshare"
      >
        {already ? S.resharedAlready : L.commercialReshare}
      </SmButton>
    </View>
  );
}
