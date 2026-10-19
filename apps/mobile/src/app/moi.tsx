// `/moi` (ancien écran Moi, derrière l'avatar) → l'onglet Profil de la casquette active, ou de la casquette de base
// pour l'organisateur et l'Administration qui n'en ont pas (lot 40 : Mon profil devient le hub, prototype `s-me`).
import { TabRedirect } from "@/features/nav/TabRedirect";

export default function Moi() {
  return <TabRedirect route="profil" />;
}
