// Casquette Organisateur, Équipe (ex-onglet Staff, renommé au lot 40) : demandes pour devenir staff, membres,
// invitations, présences, relances, rôles des événements (lot 22 ; gestion complète : lot 35a).
import { orgaManageLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { StaffScreen } from "@/features/orga/Staff";

export default function Equipe() {
  return (
    <OrgaGate title={orgaManageLabels.teamTitle}>
      <StaffScreen />
    </OrgaGate>
  );
}
