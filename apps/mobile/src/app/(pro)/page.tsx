// Onglet « Page » de la casquette (lot R9b, maquette R9.3 `n-page`) : la Page du propriétaire (`OwnerPage`), qui remplace l'écran
// provisoire de R9n. Les écrans d'hier (Structure, Équipe, Ma fiche, Vitrine, Contenus) s'ouvrent depuis ses chips et ses onglets.
import { OwnerPage } from "@/features/pages/OwnerPage";

export default function Page() {
  return <OwnerPage kind="pro" />;
}
