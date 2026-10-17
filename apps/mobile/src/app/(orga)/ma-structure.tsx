// Casquette Organisateur, « Ma structure » (lot 35a). Hors de la barre d'onglets (`href: null`), ouvert depuis l'Équipe.
import { orgaManageLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { StructureScreen } from "@/features/orga/structure/StructureScreen";

export default function MaStructure() {
  return (
    <OrgaGate title={orgaManageLabels.structureTitle}>
      <StructureScreen />
    </OrgaGate>
  );
}
