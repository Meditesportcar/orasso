// Casquette Organisateur, Boîte : messages des participants, messages groupés, discussions du staff, demandes (lot 22).
// Lot 40 : hors de la barre d'onglets, ouverte par la barre du haut ; notifications en tête.
import { orgaLabels } from "@orasso/shared";

import { InboxScreen } from "@/features/orga/Inbox";
import { OrgaGate } from "@/features/orga/OrgaGate";
import { InboxScope } from "@/ui/InboxScope";

export default function Boite() {
  return (
    <InboxScope>
      <OrgaGate title={orgaLabels.inboxTitle}>
        <InboxScreen />
      </OrgaGate>
    </InboxScope>
  );
}
