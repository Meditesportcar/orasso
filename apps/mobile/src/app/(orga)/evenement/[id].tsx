// Casquette Organisateur, page d'un événement côté organisateur (lot 22). Hors de la barre d'onglets (`href: null`).
import { orgaLabels } from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";

import { EventPage } from "@/features/orga/EventPage";
import { OrgaGate } from "@/features/orga/OrgaGate";

export default function EvenementOrga() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OrgaGate title={orgaLabels.eventsTitle}>
      <EventPage key={id} eventId={id} />
    </OrgaGate>
  );
}
