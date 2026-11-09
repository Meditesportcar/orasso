// `/acces` (ancien onglet Accès) → la page Sorties (lot R7a1 : plus un onglet) de la casquette active ou de base, paramètres gardés.
import { TabRedirect } from "@/features/nav/TabRedirect";

export default function Acces() {
  return <TabRedirect route="sorties" />;
}
