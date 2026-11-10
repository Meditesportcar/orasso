// Casquette Organisateur, une mention : « Ajouter à ma story » (lot R7h).
import { storyShareLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { MentionStoryScreen } from "@/features/orga/stories/MentionStory";

export default function MentionStory() {
  return (
    <OrgaGate page title={storyShareLabels.mentions}>
      <MentionStoryScreen />
    </OrgaGate>
  );
}
