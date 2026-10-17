// Casquette Organisateur, Direct : arrivés et attendus par catégorie, alertes, main courante, rapport des scans (lot 22).
import { orgaLabels } from "@orasso/shared";

import { DirectScreen } from "@/features/orga/Direct";
import { OrgaGate } from "@/features/orga/OrgaGate";

export default function Direct() {
  return (
    <OrgaGate title={orgaLabels.directTitle}>
      <DirectScreen />
    </OrgaGate>
  );
}
