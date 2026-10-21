// Casquette Média (DA v2, lot 40, prototype `s-agenda`) : Explorer · Presse · Accueil (le O, au centre) · Contenus ·
// Profil. La casquette vient de l'API (lot 45) ; les écrans sont ceux du lot 55 (`features/media/`).
import { PersonaTabSet } from "@/ui/PersonaTabs";

export default function MediaLayout() {
  return <PersonaTabSet kind="media" />;
}
