// Casquette Organisateur, « Ma story » (lot R7h) : les stories de la structure, avec « Retirer ».
import { storyShareLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { MyStoryScreen } from "@/features/orga/stories/MyStory";

export default function MaStory() {
  return (
    <OrgaGate page title={storyShareLabels.mine}>
      <MyStoryScreen />
    </OrgaGate>
  );
}
