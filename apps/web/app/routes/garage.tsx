import { redirect } from "react-router";

import type { Route } from "./+types/garage";

// Garage (lot 51 ; lot R7a1, D38 : n'est plus un onglet ; lot R7b1 : il vit dans le Profil, onglet interne « Garage »). La
// vieille adresse `/app/garage` (liens, notifications, retours, signets) répond 301 vers `/app/moi?onglet=garage`, en gardant
// la recherche (ex. `?photo=refusee`). Les pages d'un véhicule (`/app/garage/:id`, `/app/garage/nouveau`) ne changent pas.
export function meta() {
  return [{ name: "robots", content: "noindex" }];
}

export function loader({ request }: Route.LoaderArgs) {
  const params = new URLSearchParams(new URL(request.url).search);
  params.delete("onglet");
  const rest = params.toString();
  return redirect(`/app/moi?onglet=garage${rest ? `&${rest}` : ""}`, 301);
}
