// Casquette Organisateur, page d'un événement côté organisateur (lot 22). Hors de la barre d'onglets (`href: null`).
// Lot 35b : `?fait=cree|modifie` (retour de l'assistant) et `?avert=…` (affiche ou zone non enregistrée).
import { orgaLabels } from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";

import { EventPage } from "@/features/orga/EventPage";
import { OrgaGate } from "@/features/orga/OrgaGate";

export default function EvenementOrga() {
  const { id, fait, avert } = useLocalSearchParams<{ id: string; fait?: string; avert?: string }>();
  return (
    <OrgaGate title={orgaLabels.eventsTitle}>
      <EventPage key={`${id}-${fait ?? ""}`} eventId={id} done={fait ?? null} warning={avert ?? null} />
    </OrgaGate>
  );
}
