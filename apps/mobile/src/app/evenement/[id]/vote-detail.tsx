// Casquette Organisateur, un vote en détail (`?vote=`), lot R7l2 : candidats à la main, scan des QR, durée, Lancer, Clore.
import { voteOrgaLabels } from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { VoteDetail } from "@/features/orga/votes/VoteDetail";

export default function VoteDetailOrga() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <OrgaGate title={voteOrgaLabels.screenTitle}>
      <VoteDetail key={id} eventId={id} />
    </OrgaGate>
  );
}
