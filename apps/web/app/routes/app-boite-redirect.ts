import { redirect } from "react-router";

import type { Route } from "./+types/app-boite-redirect";

// La Boîte a disparu (lot R7c2, D38) : ses anciennes adresses (signets, e-mails, notifications déjà envoyées) mènent à
// l'Activité (la cloche) ou aux Messages (la bulle). Redirection temporaire (302) : l'adresse pourra servir de nouveau.
export function loader({ request, params }: Route.LoaderArgs) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (path === "/app/journal") return redirect("/app/activite");
  if (path === "/app/boite/demandes") return redirect("/app/activite/demandes");
  if (path === "/app/boite") return redirect("/app/messages");
  if (params.id) return redirect(`/app/messages/${encodeURIComponent(params.id)}`);
  return redirect("/app/activite");
}
