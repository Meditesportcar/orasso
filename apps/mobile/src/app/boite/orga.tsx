// Casquette Organisateur, Boîte : messages des participants, messages groupés, discussions du staff, demandes (lot 22).
import { orgaLabels } from "@orasso/shared";

import { InboxScreen } from "@/features/orga/Inbox";
import { OrgaGate } from "@/features/orga/OrgaGate";

export default function Boite() {
  return (
    <OrgaGate title={orgaLabels.inboxTitle}>
      <InboxScreen />
    </OrgaGate>
  );
}
