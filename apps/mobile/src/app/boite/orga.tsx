// Casquette Organisateur, Boîte : messages des participants, messages groupés, discussions du staff, demandes (lot 22).
// Lot 40 : hors de la barre d'onglets, ouverte par la barre du haut ; notifications en tête. Sans casquette
// Organisateur active (lien gardé, casquette changée), la Boîte personnelle plutôt qu'un écran vide.
import { orgaLabels } from "@orasso/shared";
import { Redirect } from "expo-router";

import { InboxScreen } from "@/features/orga/Inbox";
import { OrgaGate } from "@/features/orga/OrgaGate";
import { usePersona } from "@/lib/persona";
import { InboxScope } from "@/ui/InboxScope";

export default function Boite() {
  const { ready, persona } = usePersona();
  if (ready && persona.kind !== "organizer") return <Redirect href="/boite" />;
  return (
    <InboxScope>
      <OrgaGate title={orgaLabels.inboxTitle}>
        <InboxScreen />
      </OrgaGate>
    </InboxScope>
  );
}
