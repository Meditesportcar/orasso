// Garage (lot 51 ; lot R7a1, D38 : n'est plus un onglet ; lot R7b1 : il vit dans le Profil, onglet interne « Garage »). La
// vieille adresse `/garage` (bandeau « où sont passées les choses », liens et retours existants) mène au Profil sur cet onglet.
import { Redirect } from "expo-router";

export default function Garage() {
  return <Redirect href="/profil?onglet=garage" />;
}
