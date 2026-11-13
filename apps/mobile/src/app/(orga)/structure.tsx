// Casquette Organisateur, onglet Structure (ex-« Ma structure » masquée sous l'Équipe, lot 35a ; onglet depuis le lot 40).
import { orgaManageLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { StructureScreen } from "@/features/orga/structure/StructureScreen";
import { useBackToPage } from "@/features/pages/useBackToPage";

export default function Structure() {
  useBackToPage("/(orga)/page"); // Lot R9b : le retour système ramène à la Page
  return (
    <OrgaGate title={orgaManageLabels.structureTitle}>
      <StructureScreen />
    </OrgaGate>
  );
}
