// La visionneuse de stories (lot R7f2, maquette R7.7), mode B : plein écran, fond noir, sans barre d'onglets. `authorKey` :
// `u:<compte>`, `s:<structure>` ou `p:<pro>` (celui de `GET /stories/bar`). `?suite=barre` (lot R8s) : ouverte depuis la barre du
// Fil, la lecture enchaîne les auteurs ; sans lui, elle se ferme à la fin de l'auteur.
import { useLocalSearchParams } from "expo-router";

import { StoryChain } from "@/features/stories/view/StoryChain";
import { useSession } from "@/lib/session";

export default function Story() {
  const { authorKey, suite } = useLocalSearchParams<{ authorKey: string; suite?: string }>();
  const { me } = useSession();
  // Tout l'état de la visionneuse (stories lues, feuilles, brouillon, minuterie) appartient au compte : un autre compte
  // (déconnexion puis connexion, retour arrière) remonte une visionneuse neuve, rien de l'ancien ne reste affiché.
  return (
    <StoryChain
      key={me?.user.id ?? "anonyme"}
      authorKey={String(authorKey ?? "")}
      followBar={String(suite ?? "") === "barre"}
    />
  );
}
