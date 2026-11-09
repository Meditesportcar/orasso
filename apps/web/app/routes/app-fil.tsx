import { navLabels } from "@orasso/shared";

import { Fil } from "../components/fil/Fil";
import { requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-fil";

// Onglet Le Fil (lot R7e2, D38, maquette R7.6), comme l'appli : publier, trois filtres, cartes par genre avec leur raison et
// « ⋯ ». Mode A : bande ORASSO et barre d'onglets (le layout). Les cartes sont lues dans le navigateur (`/api/fil`).
export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  return { userId: me.user.id };
}

export function meta() {
  return [{ title: `${navLabels.fil.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppFil({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1 className="fil-sr">{navLabels.fil.title}</h1>
      <Fil userId={loaderData.userId} />
    </>
  );
}
