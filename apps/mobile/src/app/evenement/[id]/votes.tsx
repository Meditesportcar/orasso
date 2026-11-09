// Casquette Organisateur, « Votes » pendant l'événement (lot R7l2) : chaque vote, son état, Lancer et Clore. Plein écran,
// hors de la barre d'onglets.
import { voteOrgaLabels } from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { OrgaVotes } from "@/features/orga/votes/VotesScreen";

export default function VotesOrga() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OrgaGate title={voteOrgaLabels.screenTitle}>
      <OrgaVotes key={id} eventId={id} />
    </OrgaGate>
  );
}
