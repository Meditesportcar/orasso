// Mode staff > Votes (lot R7l2, décision D38 : « le staff voit les votes en lecture seule ») : la liste des votes de
// l'événement avec leur état, sans « Lancer » ni « Clore » (l'API répond 403 aux écritures du staff) et sans scan de
// candidats (réservé à l'organisateur). En ligne seulement.
import { useLocalSearchParams } from "expo-router";

import { VotesScreen } from "@/features/orga/votes/VotesScreen";

export default function StaffVotes() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VotesScreen key={id} eventId={id} readOnly />;
}
