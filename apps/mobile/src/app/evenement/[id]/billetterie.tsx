// Casquette Organisateur, billetterie d'un événement (lot 35c). Hors de la barre d'onglets (`href: null`).
import { ticketingAppLabels } from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { Ticketing } from "@/features/orga/Ticketing";

export default function BilletterieOrga() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OrgaGate title={ticketingAppLabels.title}>
      <Ticketing key={id} eventId={id} />
    </OrgaGate>
  );
}
