// « Publier au Fil » (lot R7e2) : photos en 4:5, plaque obligatoire, un mot, voiture et événement facultatifs.
// Lot R8d : `?structure=<id>&evenement=<id>` (« Publier pour cet événement ») pose la structure et l'événement de départ.
// Lot R9n : `?auteur=<clé d'auteur de la casquette>` (ou `me`) pose la casquette de départ (le Fil en casquette, le segment « Story »).
// Lot R9c : `?fiche=<id>&etiquette=offre` (« Publier une offre ») pose la fiche pro et l'étiquette « Offre ».
import { useLocalSearchParams } from "expo-router";

import { PublishScreen } from "@/features/fil/publish/PublishScreen";

export default function PublierAuFil() {
  const { structure, evenement, auteur, fiche, etiquette } = useLocalSearchParams<{
    structure?: string;
    evenement?: string;
    auteur?: string;
    fiche?: string;
    etiquette?: string;
  }>();
  return <PublishScreen start={{ structure, evenement, auteur, fiche, etiquette }} />;
}
