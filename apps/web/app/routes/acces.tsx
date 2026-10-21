// Ancienne adresse de l'onglet Accès (lots 05 à 43) : l'onglet est devenu Sorties (DA v2, prototype `s-sorties`, lot 57).
// Redirection permanente qui garde les paramètres (`?avis=<candidature>` des remerciements, `?vue=passes`,
// `?candidature=envoyee`) : les liens des anciens e-mails et notifications continuent de marcher.
import { redirect } from "react-router";

import type { Route } from "./+types/acces";

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return redirect(`/app/sorties${url.search}${url.hash}`, 301);
}
