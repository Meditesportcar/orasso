import { redirect } from "react-router";

import { requireMe } from "../lib/api.server";
import { whatsNewSeenCookie } from "../lib/whatsnew.server";
import type { Route } from "./+types/app-bandeau";

// « Compris » du bandeau « où sont passées les choses » (lot R7a1) : écrit le cookie `whatsnew_r7` (`vu`, par navigateur) puis revient
// à l'Accueil. Un formulaire, donc sans JavaScript aussi. Aucune page : une adresse d'action seulement.
export async function loader() {
  throw redirect("/app");
}

export async function action({ request }: Route.ActionArgs) {
  await requireMe(request);
  throw redirect("/app", { headers: { "Set-Cookie": whatsNewSeenCookie(request) } });
}
