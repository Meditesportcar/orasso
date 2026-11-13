// « Publier une story » (lot R7f3) : une photo en 9:16 (appareil ou galerie), la plaque, les détails, l'aperçu, l'envoi.
// Lot R9n : `?auteur=<clé d'auteur de la casquette>` ou `me` (une story personnelle depuis une casquette, maquette R9.2b).
import { useLocalSearchParams } from "expo-router";

import { PublishStoryScreen } from "@/features/stories/publish/PublishStoryScreen";

export default function PublierUneStory() {
  const { auteur } = useLocalSearchParams<{ auteur?: string }>();
  return <PublishStoryScreen auteur={auteur} />;
}
