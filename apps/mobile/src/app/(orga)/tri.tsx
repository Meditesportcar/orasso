// Casquette Organisateur, Tri : tri par glissement des candidatures (lot 23, ARCHITECTURE-SUITE § 7.3).
import { triageAppLabels } from "@orasso/shared";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { TriageScreen } from "@/features/orga/triage/TriageScreen";

export default function Tri() {
  return (
    <OrgaGate title={triageAppLabels.title}>
      <TriageScreen />
    </OrgaGate>
  );
}
