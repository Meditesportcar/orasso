import { redirect } from "react-router";

// Lot R6b (D37) : plus d'amis. Les anciens liens vers « Mes amis » arrivent sur « Ton réseau ». La route reste déclarée
// dans `routes.app.ts` pour ne casser aucun lien enregistré.
export function loader() {
  return redirect("/app/reseau");
}

export function action() {
  return redirect("/app/reseau");
}
