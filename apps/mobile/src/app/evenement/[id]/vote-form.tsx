// Casquette Organisateur, « Nouveau vote » (ou « Modifier le vote » avec `?vote=`), lot R7l2 : ouvert depuis l'étape « Votes
// du public » de l'éditeur et depuis l'écran « Votes ».
import { voteOrgaLabels } from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { VoteForm } from "@/features/orga/votes/VoteForm";

export default function VoteFormOrga() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OrgaGate title={voteOrgaLabels.newTitle}>
      <VoteForm key={id} eventId={id} />
    </OrgaGate>
  );
}
