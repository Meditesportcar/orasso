// « Publier au Fil » (lot R7e2) : photos en 4:5, plaque obligatoire, un mot, voiture et événement facultatifs.
// Lot R8d : `?structure=<id>&evenement=<id>` (« Publier pour cet événement ») pose la structure et l'événement de départ.
import { useLocalSearchParams } from "expo-router";

import { PublishScreen } from "@/features/fil/publish/PublishScreen";

export default function PublierAuFil() {
  const { structure, evenement } = useLocalSearchParams<{ structure?: string; evenement?: string }>();
  return <PublishScreen start={{ structure, evenement }} />;
}
