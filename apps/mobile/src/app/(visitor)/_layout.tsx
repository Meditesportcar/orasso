// Casquette Visiteur (DA v2, lot 40, prototype `s-plan`) : un compte sans véhicule actif. Explorer · Sorties · Accueil
// (le O, au centre) · Passeport · Profil. Ajouter un véhicule fait passer à la barre de l'exposant (V5).
import { PersonaTabSet } from "@/ui/PersonaTabs";

export default function VisitorLayout() {
  return <PersonaTabSet kind="visitor" />;
}
