import { redirect } from "react-router";

import type { Route } from "./+types/passeport";

// Passeport (lot 57 ; lot R7b1, D38 : il vit dans le Profil, onglet interne « Sorties »). L'adresse `/app/passeport` (cible des
// notifications `stamp_received`, liens, signets) répond 301 vers `/app/moi?onglet=sorties`, en gardant la saison demandée
// (`?saison=`).
export function meta() {
  return [{ name: "robots", content: "noindex" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const saison = new URL(request.url).searchParams.get("saison");
  return redirect(`/app/moi?onglet=sorties${saison ? `&saison=${encodeURIComponent(saison)}` : ""}`, 301);
}
