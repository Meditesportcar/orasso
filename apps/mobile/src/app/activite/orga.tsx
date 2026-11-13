// « Activité · <structure> » (lot R9d) : la cloche de la casquette organisateur. Sans casquette organisateur active (lien gardé,
// casquette changée), l'Activité personnelle plutôt qu'un écran vide.
import { Redirect } from "expo-router";

import { StructureActivityScreen } from "@/features/activite/structure/StructureActivityScreen";
import { usePersona } from "@/lib/persona";

export default function ActiviteOrga() {
  const { ready, persona } = usePersona();
  if (ready && persona.kind !== "organizer") return <Redirect href="/activite" />;
  return <StructureActivityScreen />;
}
