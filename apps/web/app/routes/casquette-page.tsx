import { redirect } from "react-router";

import { requireMe } from "../lib/api.server";
import type { Route } from "./+types/casquette-page";

// La « Page » d'une casquette (lot R9h). Partie 1 : l'adresse existe (`/orga/:structure/page`, `/pro/:pro/page`,
// `/app/media/page`, `/app/prestataire/page`) pour que les liens « Page » des barres ne mènent à rien de cassé ; elle ouvre
// l'écran d'aujourd'hui de la casquette (réglages de la structure, fiche pro, espace média, espace prestataire). La partie 2 la
// remplace par la vraie Page du propriétaire (`OwnerPage`) : rien ne se perd entre les deux.
export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const base = new URL(request.url).pathname.replace(/\/page\/?$/, "");
  throw redirect(base.startsWith("/orga/") ? `${base}/structure` : base);
}

export default function CasquettePage() {
  return null;
}
