// La Boîte de l'organisateur s'appelle `/messages/orga` (lot R7c2) : l'ancienne adresse y renvoie.
import { Redirect } from "expo-router";

export default function OrgaRedirect() {
  return <Redirect href="/messages/orga" />;
}
