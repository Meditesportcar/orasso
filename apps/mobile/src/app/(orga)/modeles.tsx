// Casquette Organisateur, modèles de message (lot 35a). Hors de la barre d'onglets, ouvert depuis l'Équipe.
import { orgaManageLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { TemplatesScreen } from "@/features/orga/Templates";

export default function Modeles() {
  return (
    <OrgaGate title={orgaManageLabels.templatesTitle}>
      <TemplatesScreen />
    </OrgaGate>
  );
}
