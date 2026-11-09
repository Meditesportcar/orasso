// La liste des votes d'un événement (lot R7l3) : `/votes/<id ou adresse de l'événement>?titre=…`.
import { VotesList } from "@/features/vote/VotesList";

export default function Votes() {
  return <VotesList />;
}
