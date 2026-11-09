// Un vote d'un événement (lots 50 et R7l3) : `/vote/<id ou adresse de l'événement>?vote=<vote>&titre=…`. Sans `vote` : « Toutes catégories ».
import { VoteScreen } from "@/features/vote/VoteScreen";

export default function Vote() {
  return <VoteScreen />;
}
