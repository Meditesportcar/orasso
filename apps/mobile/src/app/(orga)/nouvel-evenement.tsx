// Casquette Organisateur, « Créer un événement » (lot 35b, D20) : l'assistant, depuis l'onglet Événements. Hors de la
// barre d'onglets (`href: null`). Même adresse que la page du site (`/orga/<structure>/nouvel-evenement`).
import { eventEditorLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { EventWizard } from "@/features/orga/wizard/EventWizard";

export default function NouvelEvenement() {
  return (
    <OrgaGate title={eventEditorLabels.newTitle}>
      <EventWizard />
    </OrgaGate>
  );
}
