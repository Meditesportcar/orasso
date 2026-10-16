// Casquette Organisateur, Staff : présences, relances, rôles, membres de la structure (lot 22 ; la gestion fine : lot 24).
import { orgaLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { StaffScreen } from "@/features/orga/Staff";

export default function Staff() {
  return (
    <OrgaGate title={orgaLabels.staffTitle}>
      <StaffScreen />
    </OrgaGate>
  );
}
