// Casquette Pro, Ma fiche (lot 40 : fichier d'onglet ; lot 54 : l'écran vit dans `features/pro/FicheScreen`).

import { useBackToPage } from "@/features/pages/useBackToPage";
import { FicheScreen } from "@/features/pro/FicheScreen";

export default function ProFiche() {
  useBackToPage("/(pro)/page");
  return <FicheScreen />;
}
