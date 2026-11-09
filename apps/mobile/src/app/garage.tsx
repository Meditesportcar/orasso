// Garage (lot 51 ; lot R7a1, D38 : n'est plus un onglet ; lot R7b1 : il vit dans le Profil, onglet interne « Garage »). La
// vieille adresse `/garage` (bandeau « où sont passées les choses », liens profonds) mène au Profil de la casquette de base
// sur cet onglet, quelle que soit la casquette active (tour 2).
import { ProfileRedirect } from "@/features/nav/TabRedirect";

export default function Garage() {
  return <ProfileRedirect onglet="garage" />;
}
