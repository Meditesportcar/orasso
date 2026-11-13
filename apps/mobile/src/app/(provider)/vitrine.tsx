// Casquette Prestataire, Vitrine (lot 40 : fichier d'onglet ; lot 54 : l'écran vit dans `features/provider/VitrineScreen`).

import { useBackToPage } from "@/features/pages/useBackToPage";
import { VitrineScreen } from "@/features/provider/VitrineScreen";

export default function Vitrine() {
  useBackToPage("/(provider)/page");
  return <VitrineScreen />;
}
