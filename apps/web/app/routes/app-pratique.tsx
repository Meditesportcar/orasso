import { practicalTexts as L } from "@orasso/shared";

import { FicheBar, ficheHandle } from "../components/FicheBar";
import { PracticalScreen } from "../components/practical/PracticalScreen";
import { requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-pratique";
import "../styles/practical-r8q.css";

// « Pratique » (lot R8q, maquette R8.12) : la station-service et le lavage les plus proches, de moi ou de ma sortie. Plein écran,
// mode B. Les lieux se lisent dans le navigateur (`POST /practical`) : la position, quand on la donne, reste en mémoire de la page
// et ne part jamais en adresse ; la page serveur ne connaît ni position ni lieu.
export const handle = ficheHandle;

export function meta() {
  return [{ title: "Pratique · Orasso" }, { name: "robots", content: "noindex" }];
}

export const headers: Route.HeadersFunction = ({ parentHeaders }) => {
  const h = new Headers(parentHeaders);
  h.set("cache-control", "private, no-store");
  return h;
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  return null;
}

export default function AppPratique() {
  return (
    <div className="s-stack">
      <FicheBar title={L.screenTitle} facts={L.screenSubtitle} back="/app" closeLabel="Fermer" />
      <PracticalScreen />
    </div>
  );
}
