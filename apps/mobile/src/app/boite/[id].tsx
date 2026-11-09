// La Boîte a disparu (lot R7c2) : une conversation s'ouvre sous `/messages/<id>` ; l'ancienne adresse y renvoie.
import { Redirect, useLocalSearchParams } from "expo-router";

export default function ConversationRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/messages/${id}`} />;
}
