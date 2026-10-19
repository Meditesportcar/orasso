// `/acces` (ancien onglet Accès) → l'onglet Sorties de la casquette active ou de base (lot 40), paramètres gardés.
import { TabRedirect } from "@/features/nav/TabRedirect";

export default function Acces() {
  return <TabRedirect route="sorties" />;
}
