// Passeport du visiteur (lot R7a1, D38) : n'est plus un onglet (le Passeport ira dans Profil › Sorties, lot R7b1). En
// attendant, l'ancienne adresse mène à la page `/mon-passeport`.
import { Redirect } from "expo-router";

export default function Passeport() {
  return <Redirect href="/mon-passeport" />;
}
