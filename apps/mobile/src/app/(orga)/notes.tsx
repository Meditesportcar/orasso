// Casquette Organisateur, notes internes de la structure (lot 35a). Hors de la barre d'onglets, ouvert depuis l'Équipe
// et depuis le bilan d'un événement.
import { orgaManageLabels } from "@orasso/shared";

import { NotesScreen } from "@/features/orga/Notes";
import { OrgaGate } from "@/features/orga/OrgaGate";

export default function Notes() {
  return (
    <OrgaGate page title={orgaManageLabels.notesScreenTitle}>
      <NotesScreen />
    </OrgaGate>
  );
}
