// Page d'un média dans l'appli (lot R9b, maquette R9.3 `n-page`) : l'anneau de ses stories, « Suivre », trois compteurs, « Publications ·
// Contenus · Mentions » (« Contenus » : ses liens et galeries publics ; R9e en fera ses albums). Le site a la même adresse (`/m/:id`).
import { VisitedPage } from "@/features/pages/VisitedPage";

export default function MediaPage() {
  return <VisitedPage kind="media" />;
}
