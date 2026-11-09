// Passeport du visiteur (lot R7a1, D38) : n'est plus un onglet ; lot R7b1 : le passeport vit dans Profil › Sorties.
import { Redirect } from "expo-router";

export default function Passeport() {
  return <Redirect href="/profil?onglet=sorties" />;
}
