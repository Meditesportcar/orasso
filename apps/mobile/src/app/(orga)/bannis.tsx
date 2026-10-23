// Casquette Organisateur, bannissements de la structure (lot 35a). Hors de la barre d'onglets, ouvert depuis l'Équipe.
import { orgaManageLabels } from "@orasso/shared";

import { BansScreen } from "@/features/orga/Bans";
import { OrgaGate } from "@/features/orga/OrgaGate";

export default function Bannis() {
  return (
    <OrgaGate page title={orgaManageLabels.bansTitle}>
      <BansScreen />
    </OrgaGate>
  );
}
