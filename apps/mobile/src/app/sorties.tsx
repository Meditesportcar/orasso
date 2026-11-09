// Sorties (lot R7a1, D38) : n'est plus un onglet. La page garde son adresse `/sorties` ; l'Accueil (bloc « Mes sorties »,
// « Tout voir ») et le Profil l'ouvrent, avec l'en-tête de fiche et son retour (`TabScreen` hors d'un groupe d'onglets).
import { SortiesScreen } from "@/features/sorties/SortiesScreen";

export default function Sorties() {
  return <SortiesScreen />;
}
