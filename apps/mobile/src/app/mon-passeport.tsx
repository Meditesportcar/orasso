// Passeport (lot 50 ; lot R7a1 : le visiteur n'a plus d'onglet ; lot R7b1 : le passeport vit dans le Profil, onglet interne
// « Sorties »). Les adresses `/mon-passeport` et `/passeport` mènent au Profil sur cet onglet.
import { Redirect } from "expo-router";

export default function MonPasseport() {
  return <Redirect href="/profil?onglet=sorties" />;
}
