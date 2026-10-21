// Casquette Pro, modifier la fiche (lot 35c). Hors de la barre d'onglets (`href: null`) ; l'onglet Ma fiche reste allumé.
// Lot 54 : c'est le segment « Modifier ma fiche » de Ma fiche, ouvert directement (anciens liens).
import { FicheScreen } from "@/features/pro/FicheScreen";

export default function ProModifier() {
  return <FicheScreen initial="edit" />;
}
