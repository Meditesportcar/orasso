// Casquette Organisateur, Tri : tri par glissement des candidatures (lot 23). En attendant : écran d'attente (lot 22).
import { orgaLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { Soon } from "@/ui/Soon";

export default function Tri() {
  return (
    <OrgaGate title="Tri">
      <Soon title="Tri">{orgaLabels.sortSoonBody}</Soon>
    </OrgaGate>
  );
}
