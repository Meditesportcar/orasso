// Casquette Organisateur, Événements : liste par statut ; la page d'un événement est `evenement/[id]` (lot 22).
import { orgaLabels } from "@orasso/shared";

import { EventsScreen } from "@/features/orga/Events";
import { OrgaGate } from "@/features/orga/OrgaGate";

export default function Evenements() {
  return (
    <OrgaGate title={orgaLabels.eventsTitle}>
      <EventsScreen />
    </OrgaGate>
  );
}
