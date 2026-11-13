// Casquette Organisateur, Équipe (ex-onglet Staff, renommé au lot 40) : demandes pour devenir staff, membres,
// invitations, présences, relances, rôles des événements (lot 22 ; gestion complète : lot 35a).
import { orgaManageLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { TeamScreen } from "@/features/orga/team/TeamScreen";
import { useBackToPage } from "@/features/pages/useBackToPage";

export default function Equipe() {
  useBackToPage("/(orga)/page");
  return (
    <OrgaGate title={orgaManageLabels.teamTitle}>
      <TeamScreen />
    </OrgaGate>
  );
}
