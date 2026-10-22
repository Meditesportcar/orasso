// Casquette Organisateur, « Créer un événement » (lot 35b, D20) : l'assistant, depuis l'onglet Événements. Hors de la
// barre d'onglets : flux plein écran, hors du groupe (lot C4a). Même adresse que la page du site (`/orga/<structure>/nouvel-evenement`).
// Les écrans des onglets restent montés : l'assistant n'est rendu qu'à l'écran (sa saisie est gardée sur le téléphone
// et reprise au retour), pour ne jamais rouvrir sur un état périmé après un enregistrement.
import { eventEditorLabels } from "@orasso/shared";
import { useIsFocused } from "expo-router";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { EventWizard } from "@/features/orga/wizard/EventWizard";

export default function NouvelEvenement() {
  const focused = useIsFocused();
  return <OrgaGate title={eventEditorLabels.newTitle}>{focused ? <EventWizard /> : null}</OrgaGate>;
}
