// Casquette Organisateur, mentions de la structure (lot R7h). Hors de la barre d'onglets, ouvert depuis le Direct.
import { storyShareLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { MentionsScreen } from "@/features/orga/stories/Mentions";

export default function Mentions() {
  return (
    <OrgaGate page title={storyShareLabels.mentions}>
      <MentionsScreen />
    </OrgaGate>
  );
}
