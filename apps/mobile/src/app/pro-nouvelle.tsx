// Créer sa fiche pro (lot 34, parité D20), depuis « Mes casquettes ». Hors des groupes de casquettes : sert tous les
// comptes (on n'a pas encore la casquette Pro).
import { FicheForm } from "@/features/pro/FicheForm";

export default function NouvelleFichePro() {
  return <FicheForm create />;
}
