// Casquette Organisateur, onglet Structure (ex-« Ma structure » masquée sous l'Équipe, lot 35a ; onglet depuis le lot 40).
import { orgaManageLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { StructureScreen } from "@/features/orga/structure/StructureScreen";

export default function Structure() {
  return (
    <OrgaGate title={orgaManageLabels.structureTitle}>
      <StructureScreen />
    </OrgaGate>
  );
}
