// Casquette Organisateur, Messages de la structure : conversations des participants, messages groupés, discussions du staff (lot 22 ; refait au lot R9d : la bulle, que des conversations).
// Lot 40 : hors de la barre d'onglets, ouverte par la barre du haut ; notifications en tête. Lot R7c2 : `/messages/orga` (ex `/boite/orga`).
// Sans casquette Organisateur active (lien gardé, casquette changée), les Messages personnels plutôt qu'un écran vide.
import { structureActivityLabels } from "@orasso/shared";
import { Redirect } from "expo-router";

import { OrgaGate } from "@/features/orga/OrgaGate";
import { StructureMessagesScreen } from "@/features/orga/StructureMessages";
import { usePersona } from "@/lib/persona";
import { InboxScope } from "@/ui/InboxScope";

export default function Boite() {
  const { ready, persona } = usePersona();
  if (ready && persona.kind !== "organizer") return <Redirect href="/messages" />;
  return (
    <InboxScope>
      <OrgaGate title={structureActivityLabels.messagesTitle}>
        <StructureMessagesScreen />
      </OrgaGate>
    </InboxScope>
  );
}
