import { redirect } from "react-router";

import { requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-fil-mes-publications";

// « Mes publications » (lot R7e2) devient, au lot R8b2 (D40), l'onglet « Publications » de mon profil (`/app/moi`) : l'adresse
// n'est plus qu'une redirection, pour que les anciens liens tiennent (Réglages, « Publier au Fil », signets). Supprimer une de mes
// publications se fait désormais par le menu « ⋯ » de la publication.
export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  return redirect("/app/moi?onglet=publications");
}

export default function AppFilMesPublications() {
  return null;
}
