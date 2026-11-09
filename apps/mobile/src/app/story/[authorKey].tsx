// La visionneuse de stories (lot R7f2, maquette R7.7), mode B : plein écran, fond noir, sans barre d'onglets. `authorKey` :
// `u:<compte>`, `s:<structure>` ou `p:<pro>` (celui de `GET /stories/bar`).
import { useLocalSearchParams } from "expo-router";

import { StoryViewer } from "@/features/stories/view/StoryViewer";
import { useSession } from "@/lib/session";

export default function Story() {
  const { authorKey } = useLocalSearchParams<{ authorKey: string }>();
  const { me } = useSession();
  // Tout l'état de la visionneuse (stories lues, feuilles, brouillon, minuterie) appartient au compte : un autre compte
  // (déconnexion puis connexion, retour arrière) remonte une visionneuse neuve, rien de l'ancien ne reste affiché.
  return <StoryViewer key={me?.user.id ?? "anonyme"} authorKey={String(authorKey ?? "")} />;
}
