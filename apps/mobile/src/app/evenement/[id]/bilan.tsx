// Casquette Organisateur, bilan d'un événement (lot 27). Hors de la barre d'onglets (`href: null`).
import { afterEventLabels } from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";

import { Bilan } from "@/features/orga/Bilan";
import { OrgaGate } from "@/features/orga/OrgaGate";

export default function BilanOrga() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OrgaGate title={afterEventLabels.reportTitle}>
      <Bilan key={id} eventId={id} />
    </OrgaGate>
  );
}
