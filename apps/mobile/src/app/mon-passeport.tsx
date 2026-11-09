// Passeport (lot 50 ; lot R7a1 : le visiteur n'a plus d'onglet ; lot R7b1 : le passeport vit dans le Profil, onglet interne
// « Sorties »). Les adresses `/mon-passeport` et `/passeport` mènent au Profil de la casquette de base sur cet onglet.
import { ProfileRedirect } from "@/features/nav/TabRedirect";

export default function MonPasseport() {
  return <ProfileRedirect onglet="sorties" />;
}
