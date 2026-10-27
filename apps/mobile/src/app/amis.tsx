// Ancien écran « Mes amis » (lot 17) : il n'y a plus d'amitié (lot R6b, D37). Un lien ou un signet ancien arrive dans
// « Ton réseau », où se trouvent les abonnés, les abonnements, les demandes et le scan du QR d'un passionné.
import { Redirect } from "expo-router";

export default function Amis() {
  return <Redirect href="/reseau" />;
}
